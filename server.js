const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const pdf2md = require('@opendocsg/pdf2md');
const TurndownService = require('turndown');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { PIIDetectorFactory } = require('./pii-detector');
require('dotenv').config({ quiet: true });

// Polyfill Promise.withResolvers for older Node.js versions
if (!Promise.withResolvers) {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Polyfill DOM APIs for pdfjs-dist in Node.js
const { DOMMatrix, DOMPoint } = require('canvas');
global.DOMMatrix = DOMMatrix;
global.DOMPoint = DOMPoint;

// Dynamic import cache for pdfjs-dist (ES Module)
let pdfjsLib = null;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    // Configure worker - use require.resolve to find the worker file
    const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  }
  return pdfjsLib;
}

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const MODEL = process.env.MODEL;
const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'documents';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const CATEGORIZATION_MODEL = process.env.CATEGORIZATION_MODEL || '';

// PII Detection Configuration
const PII_DETECTION_ENABLED = process.env.PII_DETECTION_ENABLED === 'true';
const PII_DETECTION_METHOD = process.env.PII_DETECTION_METHOD || 'hybrid'; // ollama, regex, hybrid
const PII_DETECTION_MODEL = process.env.PII_DETECTION_MODEL || CATEGORIZATION_MODEL || MODEL;

// Initialize PII Detector
let piiDetector = null;
if (PII_DETECTION_ENABLED) {
  piiDetector = PIIDetectorFactory.create(
    PII_DETECTION_METHOD,
    OLLAMA_URL,
    AUTH_TOKEN,
    PII_DETECTION_MODEL
  );
  console.log(`PII Detection enabled using ${PII_DETECTION_METHOD} method`);
}

/**
 * Detect PII in content
 */
async function detectPII(content) {
  if (!PII_DETECTION_ENABLED || !piiDetector) {
    return {
      hasPII: false,
      piiTypes: [],
      piiDetails: [],
      riskLevel: 'low',
      detectionMethod: 'disabled',
      scanTimestamp: new Date().toISOString(),
      processingTimeMs: 0
    };
  }
  
  try {
    return await piiDetector.detect(content);
  } catch (error) {
    console.error('PII detection error:', error);
    return {
      hasPII: false,
      piiTypes: [],
      piiDetails: [],
      riskLevel: 'low',
      detectionMethod: 'error',
      scanTimestamp: new Date().toISOString(),
      processingTimeMs: 0
    };
  }
}

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
});

// Initialize Qdrant client
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

/**
 * Get dense embedding from Ollama
 */
async function getDenseEmbedding(text) {
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      input: text
    }, {
      headers
    });
    return response.data.embeddings[0];
  } catch (error) {
    console.error('Error getting dense embedding:', error.message);
    throw error;
  }
}

/**
 * Generate sparse vector representation
 */
function getSparseVector(text) {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  const tokenFreq = {};
  tokens.forEach(token => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });
  
  const sparseMap = new Map();
  
  Object.entries(tokenFreq).forEach(([token, freq]) => {
    const hash = simpleHash(token) % 10000;
    sparseMap.set(hash, (sparseMap.get(hash) || 0) + freq);
  });
  
  const sortedEntries = Array.from(sparseMap.entries()).sort((a, b) => a[0] - b[0]);
  const indices = sortedEntries.map(([idx]) => idx);
  const values = sortedEntries.map(([, val]) => val);
  
  return { indices, values };
}

/**
 * Simple hash function
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Count total documents matching a filter
 */
async function countFilteredDocuments(filters) {
  if (!filters) {
    const collectionInfo = await qdrantClient.getCollection(COLLECTION_NAME);
    return collectionInfo.points_count;
  }
  
  // Use count API with filter
  const countResult = await qdrantClient.count(COLLECTION_NAME, {
    filter: filters,
    exact: true
  });
  
  return countResult.count;
}

/**
 * Automatically categorize document using Ollama chat (single request)
 */
async function categorizeDocument(content) {
  if (!CATEGORIZATION_MODEL) {
    return {};
  }

  console.log('Starting automatic categorization...');
  
  // Truncate content if too long (first 3000 chars for context)
  const textSample = content.substring(0, 3000);
  
  const systemPrompt = `You are a data extraction assistant.
From the text below, produce only a JSON object that follows this exact schema:
{
  "category": "single main category/subject of the text",
  "country": "country name",
  "city": "city name",
  "coordinates": [latitude, longitude],
  "date": "most relevant date in ISO-8601 format (YYYY-MM-DD)",
  "tags": ["array", "of", "lowercase", "tags"],
  "price": 0,
  "currency": "3-letter currency code (e.g., USD, EUR)",
  "short_description": "a few words describing what's in this text"
}

Requirements:
- Output ONLY the JSON object, no explanations or additional text
- If a field cannot be determined, use empty values: "" for strings, [] for arrays, 0 for numbers
- Do not round prices; keep the exact numeric value present in the text
- Tags should be lowercase with no punctuation or special characters
- Coordinates should be [latitude, longitude] or empty array [] if not found
- Keep all keys exactly as shown above`;

  try {
    const ollamaChatUrl = OLLAMA_URL.replace('/api/embed', '/api/chat');
    
    const headers = {
      'Content-Type': 'application/json'
    };
    if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }

    const response = await axios.post(ollamaChatUrl, {
      model: CATEGORIZATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textSample }
      ],
      stream: false
    }, { headers });

    const result = response.data.message.content.trim();
    
    // Parse JSON response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Clean up empty values
      Object.keys(parsed).forEach(key => {
        if (parsed[key] === null || 
            parsed[key] === '' || 
            (Array.isArray(parsed[key]) && parsed[key].length === 0) ||
            parsed[key] === 0) {
          delete parsed[key];
        }
      });
      
      console.log('Categorization complete:', parsed);
      return parsed;
    }
    
    console.warn('Could not parse JSON from categorization response');
    return {};
  } catch (error) {
    console.error('Error during categorization:', error.message);
    return {};
  }
}

/**
 * Convert PDF to HTML then to Markdown using pdf.js
 */
async function pdfToMarkdownViaHtml(buffer) {
  try {
    const pdfjsLib = await getPdfjs();
    
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(buffer);
    
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    let htmlContent = '<div class="pdf-content">\n';
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Group text items by Y position (rows)
      const rows = new Map();
      
      textContent.items.forEach(item => {
        const y = Math.round(item.transform[5]); // Y position
        const x = item.transform[4]; // X position
        
        if (!rows.has(y)) {
          rows.set(y, []);
        }
        rows.get(y).push({ x, text: item.str, width: item.width });
      });
      
      // Sort rows by Y position (top to bottom)
      const sortedRows = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]);
      
      // Detect table regions
      let currentTable = [];
      let inTable = false;
      
      // Process each row
      sortedRows.forEach(([y, items], idx) => {
        // Sort items by X position (left to right)
        items.sort((a, b) => a.x - b.x);
        
        // Detect if this is a table row (multiple items with significant gaps)
        const gaps = [];
        for (let i = 1; i < items.length; i++) {
          gaps.push(items[i].x - (items[i-1].x + items[i-1].width));
        }
        const hasLargeGaps = gaps.some(g => g > 20); // Significant spacing
        const isTableRow = items.length >= 3 && hasLargeGaps;
        
        if (isTableRow) {
          // Add to current table
          currentTable.push(items);
          inTable = true;
        } else {
          // If we were building a table, close it
          if (inTable && currentTable.length > 0) {
            htmlContent += '<table>\n';
            currentTable.forEach(rowItems => {
              htmlContent += '<tr>\n';
              rowItems.forEach(item => {
                htmlContent += `<td>${item.text}</td>`;
              });
              htmlContent += '</tr>\n';
            });
            htmlContent += '</table>\n';
            currentTable = [];
            inTable = false;
          }
          
          // Regular text
          const text = items.map(i => i.text).join(' ');
          
          // Detect headings (short text, all caps or title case)
          if (text.length < 80 && text === text.toUpperCase() && text.length > 3) {
            htmlContent += `<h2>${text}</h2>\n`;
          } else if (text.length < 80 && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(text)) {
            htmlContent += `<h3>${text}</h3>\n`;
          } else {
            htmlContent += `<p>${text}</p>\n`;
          }
        }
      });
      
      // Close any remaining table
      if (inTable && currentTable.length > 0) {
        htmlContent += '<table>\n';
        currentTable.forEach(rowItems => {
          htmlContent += '<tr>\n';
          rowItems.forEach(item => {
            htmlContent += `<td>${item.text}</td>`;
          });
          htmlContent += '</tr>\n';
        });
        htmlContent += '</table>\n';
      }
      
      if (pageNum < pdf.numPages) {
        htmlContent += '<hr/>\n'; // Page separator
      }
    }
    
    htmlContent += '</div>';
    
    // Convert HTML to Markdown
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    });
    
    // Add table support
    turndownService.addRule('tables', {
      filter: 'table',
      replacement: function(content, node) {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (rows.length === 0) return content;
        
        let markdown = '\n';
        rows.forEach((row, idx) => {
          const cells = Array.from(row.querySelectorAll('td, th'));
          markdown += '| ' + cells.map(c => c.textContent.trim()).join(' | ') + ' |\n';
          
          if (idx === 0) {
            markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
          }
        });
        return markdown + '\n';
      }
    });
    
    const markdown = turndownService.turndown(htmlContent);
    return markdown;
    
  } catch (error) {
    console.error('PDF to HTML conversion error:', error);
    throw error;
  }
}

/**
 * Process PDF text to improve structure and prevent concatenation issues
 * Only creates tables when clear table structure exists (3+ aligned columns)
 */
function processPdfText(text) {
  if (!text) return '';
  
  let lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let result = [];
  let inTable = false;
  let tableRows = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Only detect actual tables: lines with 3+ items separated by 2+ spaces
    // This indicates columnar data, not just label-value pairs
    const columns = line.split(/\s{2,}/).filter(c => c.trim());
    const isActualTable = columns.length >= 3;
    
    // Detect headings (short, uppercase heavy, no currency)
    const isHeading = (
      line.length < 80 &&
      line.length > 3 &&
      !line.includes('$') &&
      !line.includes(':') &&
      (line === line.toUpperCase() || /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(line))
    );
    
    if (isHeading && !inTable) {
      // Add heading
      if (result.length > 0) result.push('');
      result.push(`## ${line}`);
      result.push('');
      continue;
    }
    
    if (isActualTable) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(columns);
    } else {
      // Not a table row
      if (inTable && tableRows.length > 0) {
        // Flush the table
        result.push(...formatTable(tableRows));
        result.push('');
        tableRows = [];
        inTable = false;
      }
      
      // Add regular line with proper spacing
      result.push(line);
    }
  }
  
  // Flush any remaining table
  if (inTable && tableRows.length > 0) {
    result.push(...formatTable(tableRows));
  }
  
  return result.join('\n');
}

/**
 * Format array of rows into a markdown table
 */
function formatTable(rows) {
  if (rows.length === 0) return [];
  
  // Determine max columns
  const maxCols = Math.max(...rows.map(r => r.length));
  
  // Pad rows to same length
  rows = rows.map(row => {
    while (row.length < maxCols) row.push('');
    return row;
  });
  
  const result = [];
  
  // Add all rows as table
  rows.forEach((row, idx) => {
    result.push(`| ${row.join(' | ')} |`);
    // Add separator after first row
    if (idx === 0 && rows.length > 1) {
      result.push(`| ${row.map(() => '---').join(' | ')} |`);
    }
  });
  
  return result;
}

// API Routes

/**
 * GET /api/config
 * Get server configuration
 */
app.get('/api/config', (req, res) => {
  res.json({
    maxFileSizeMB: MAX_FILE_SIZE_MB,
    categorizationEnabled: !!CATEGORIZATION_MODEL,
    piiDetectionEnabled: PII_DETECTION_ENABLED,
    piiDetectionMethod: PII_DETECTION_METHOD
  });
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  try {
    const collections = await qdrantClient.getCollections();
    res.json({
      status: 'ok',
      qdrant: 'connected',
      collections: collections.collections.map(c => c.name)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/collections
 * Get available collections
 */
app.get('/api/collections', async (req, res) => {
  try {
    const collections = await qdrantClient.getCollections();
    res.json(collections.collections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collection/:name/info
 * Get collection information
 */
app.get('/api/collection/:name/info', async (req, res) => {
  try {
    const info = await qdrantClient.getCollection(req.params.name);
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/search/semantic
 * Semantic search (dense vectors only)
 */
app.post('/api/search/semantic', async (req, res) => {
  try {
    const { query, limit = 10, offset = 0, filters } = req.body;
    
    // Debug: Log filters
    if (filters) {
      console.log('Semantic search filters:', JSON.stringify(filters, null, 2));
    }
    
    let results;
    let totalEstimate;
    
    // If no query provided, do a filtered scroll instead of vector search
    if (!query || query.trim() === '') {
      const scrollParams = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        with_payload: true
      };
      
      if (filters) {
        scrollParams.filter = filters;
      }
      
      const scrollResults = await qdrantClient.scroll(COLLECTION_NAME, scrollParams);
      results = scrollResults.points.map(p => ({
        id: p.id,
        score: 1.0, // No relevance score for scroll
        payload: p.payload
      }));
      
      // Get total count with filter
      totalEstimate = await countFilteredDocuments(filters);
    } else {
      // Normal vector search
      const queryEmbedding = await getDenseEmbedding(query);
      
      const searchParams = {
        vector: {
          name: 'dense',
          vector: queryEmbedding
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
        with_payload: true
      };
      
      if (filters) {
        searchParams.filter = filters;
      }
      
      const searchResults = await qdrantClient.search(COLLECTION_NAME, searchParams);
      results = searchResults.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }));
      
      // Get total count with filter
      totalEstimate = await countFilteredDocuments(filters);
    }
    
    res.json({
      query: query || '(filtered)',
      searchType: 'semantic',
      total: totalEstimate,
      results
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/search/hybrid
 * Hybrid search (dense + sparse vectors)
 */
app.post('/api/search/hybrid', async (req, res) => {
  try {
    const { query, limit = 10, offset = 0, denseWeight = 0.7, filters } = req.body;
    
    // Debug: Log filters
    if (filters) {
      console.log('Hybrid search filters:', JSON.stringify(filters, null, 2));
    }
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const denseEmbedding = await getDenseEmbedding(query);
    const sparseVector = getSparseVector(query);
    
    const searchParams = {
      vector: {
        name: 'dense',
        vector: denseEmbedding
      },
      sparse_vector: {
        name: 'sparse',
        vector: sparseVector
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      with_payload: true
    };
    
    // Apply filters directly if in Qdrant format, otherwise build them
    if (filters) {
      // Check if filters are already in Qdrant format (has 'must' array)
      if (filters.must && Array.isArray(filters.must)) {
        searchParams.filter = filters;
      } else {
        // Legacy format: build filters from flat object
        const qdrantFilter = { must: [] };
        
        if (filters.category) {
          qdrantFilter.must.push({
            key: 'category',
            match: { value: filters.category }
          });
        }
        
        if (filters.location) {
          qdrantFilter.must.push({
            key: 'location',
            match: { value: filters.location }
          });
        }
        
        if (filters.tags && filters.tags.length > 0) {
          qdrantFilter.must.push({
            key: 'tags',
            match: { any: filters.tags }
          });
        }
        
        if (filters.pii_detected !== undefined) {
          qdrantFilter.must.push({
            key: 'pii_detected',
            match: { value: filters.pii_detected }
          });
        }
        
        if (filters.pii_types && filters.pii_types.length > 0) {
          qdrantFilter.must.push({
            key: 'pii_types',
            match: { any: filters.pii_types }
          });
        }
        
        if (filters.pii_risk_level) {
          qdrantFilter.must.push({
            key: 'pii_risk_level',
            match: { value: filters.pii_risk_level }
          });
        }
        
        if (qdrantFilter.must.length > 0) {
          searchParams.filter = qdrantFilter;
        }
      }
    }
    
    const results = await qdrantClient.search(COLLECTION_NAME, searchParams);
    
    // Get total count with filter
    const totalEstimate = await countFilteredDocuments(searchParams.filter);
    
    res.json({
      query,
      searchType: 'hybrid',
      denseWeight,
      total: totalEstimate,
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
    });
  } catch (error) {
    console.error('Hybrid search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/search/location
 * Location-based search
 */
app.post('/api/search/location', async (req, res) => {
  try {
    const { query, location, limit = 10, offset = 0 } = req.body;
    
    if (!query || !location) {
      return res.status(400).json({ error: 'Query and location are required' });
    }
    
    const queryEmbedding = await getDenseEmbedding(query);
    
    const results = await qdrantClient.search(COLLECTION_NAME, {
      vector: {
        name: 'dense',
        vector: queryEmbedding
      },
      filter: {
        must: [
          { key: 'location', match: { value: location } }
        ]
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      with_payload: true
    });
    
    res.json({
      query,
      location,
      searchType: 'location',
      total: results.length, // Use actual results length for filtered searches
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
    });
  } catch (error) {
    console.error('Location search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/search/geo
 * Geo-radius search
 */
app.post('/api/search/geo', async (req, res) => {
  try {
    const { query, latitude, longitude, radius, limit = 10, offset = 0 } = req.body;
    
    if (!query || latitude === undefined || longitude === undefined || !radius) {
      return res.status(400).json({ 
        error: 'Query, latitude, longitude, and radius are required' 
      });
    }
    
    const queryEmbedding = await getDenseEmbedding(query);
    
    const results = await qdrantClient.search(COLLECTION_NAME, {
      vector: {
        name: 'dense',
        vector: queryEmbedding
      },
      filter: {
        must: [
          {
            key: 'coordinates',
            geo_radius: {
              center: {
                lat: parseFloat(latitude),
                lon: parseFloat(longitude)
              },
              radius: parseFloat(radius)
            }
          }
        ]
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      with_payload: true
    });
    
    res.json({
      query,
      center: { latitude, longitude },
      radius,
      searchType: 'geo',
      total: results.length, // Use actual results length for filtered searches
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
    });
  } catch (error) {
    console.error('Geo search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stats
 * Get collection statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    const info = await qdrantClient.getCollection(COLLECTION_NAME);
    
    // Get sample documents to extract unique values
    const samples = await qdrantClient.scroll(COLLECTION_NAME, {
      limit: 100,
      with_payload: true
    });
    
    const categories = new Set();
    const locations = new Set();
    const allTags = new Set();
    
    samples.points.forEach(point => {
      if (point.payload.category) categories.add(point.payload.category);
      if (point.payload.location) locations.add(point.payload.location);
      if (point.payload.tags) {
        point.payload.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    res.json({
      totalDocuments: info.points_count,
      vectorSize: info.config.params.vectors.dense.size,
      categories: Array.from(categories).sort(),
      locations: Array.from(locations).sort(),
      tags: Array.from(allTags).sort()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/recommend
 * Find similar documents using Qdrant's recommendation API
 */
app.post('/api/recommend', async (req, res) => {
  try {
    const { documentId, limit = 10, offset = 0 } = req.body;
    
    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }
    
    // Convert documentId to number if it's a numeric string
    const pointId = isNaN(documentId) ? documentId : parseInt(documentId, 10);
    
    // First, get total count of similar documents (fetch with high limit to count)
    const allSimilar = await qdrantClient.recommend(COLLECTION_NAME, {
      positive: [pointId],
      limit: 100, // Fetch up to 100 similar documents to get accurate count
      with_payload: false, // Don't need payload for counting
      with_vector: false,
      using: 'dense'
    });
    
    const totalSimilar = allSimilar.length;
    
    // Now fetch the paginated results with payload
    const totalToFetch = parseInt(limit) + parseInt(offset);
    const results = await qdrantClient.recommend(COLLECTION_NAME, {
      positive: [pointId],
      limit: totalToFetch,
      with_payload: true,
      using: 'dense'
    });
    
    // Slice results to apply offset and limit
    const offsetNum = parseInt(offset);
    const limitNum = parseInt(limit);
    const paginatedResults = results.slice(offsetNum, offsetNum + limitNum);
    
    res.json({
      documentId,
      searchType: 'recommendation',
      total: totalSimilar, // Total similar documents available
      results: paginatedResults.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
    });
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/random
 * Get random documents from the collection
 */
app.get('/api/random', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get collection info to know total count
    const info = await qdrantClient.getCollection(COLLECTION_NAME);
    const totalPoints = info.points_count;
    
    if (totalPoints === 0) {
      return res.json({ results: [] });
    }
    
    const requestedLimit = parseInt(limit);
    
    // Fetch more results than needed to randomly sample from
    const fetchLimit = Math.min(totalPoints, requestedLimit * 5); // Fetch 5x to have good randomness
    const maxOffset = Math.max(0, totalPoints - fetchLimit);
    const randomOffset = Math.floor(Math.random() * maxOffset);
    
    console.log(`Random request: totalPoints=${totalPoints}, requestedLimit=${requestedLimit}, fetchLimit=${fetchLimit}, randomOffset=${randomOffset}`);
    
    // Use scroll API with random offset
    const results = await qdrantClient.scroll(COLLECTION_NAME, {
      limit: fetchLimit,
      offset: randomOffset,
      with_payload: true
    });
    
    // Randomly shuffle and take only the requested amount
    const shuffled = results.points
      .map(r => ({ r, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ r }) => r)
      .slice(0, requestedLimit);
    
    res.json({
      searchType: 'random',
      total: totalPoints,
      results: shuffled.map(r => ({
        id: r.id,
        score: 1.0, // Random results don't have scores
        payload: r.payload
      }))
    });
  } catch (error) {
    console.error('Random documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/document/:id
 * Get a specific document by ID
 */
app.get('/api/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Convert ID to number if it's a numeric string
    const pointId = isNaN(id) ? id : parseInt(id, 10);
    
    // Retrieve the document from Qdrant
    const points = await qdrantClient.retrieve(COLLECTION_NAME, {
      ids: [pointId],
      with_payload: true
    });
    
    if (points.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({
      id: points[0].id,
      score: 1.0,
      payload: points[0].payload
    });
  } catch (error) {
    console.error('Document retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/facets
 * Get faceted counts for categories, locations, and tags
 */
app.get('/api/facets', async (req, res) => {
  try {
    // Scroll through all documents to count facets
    // For large collections, you might want to limit this or use sampling
    let offset = null;
    const categoryCount = {};
    const locationCount = {};
    const tagCount = {};
    const piiTypeCount = {};
    let totalWithPII = 0;
    const riskLevels = { low: 0, medium: 0, high: 0, critical: 0 };
    let totalPoints = 0;
    let hasMore = true;
    
    while (hasMore) {
      const scrollResult = await qdrantClient.scroll(COLLECTION_NAME, {
        limit: 100,
        offset: offset,
        with_payload: true
      });
      
      scrollResult.points.forEach(point => {
        totalPoints++;
        
        // Count categories
        if (point.payload.category) {
          categoryCount[point.payload.category] = (categoryCount[point.payload.category] || 0) + 1;
        }
        
        // Count locations
        if (point.payload.location) {
          locationCount[point.payload.location] = (locationCount[point.payload.location] || 0) + 1;
        }
        
        // Count tags
        if (point.payload.tags && Array.isArray(point.payload.tags)) {
          point.payload.tags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          });
        }
        
        // PII aggregation
        if (point.payload.pii_detected) {
          totalWithPII++;
          
          // Count risk levels
          if (point.payload.pii_risk_level) {
            riskLevels[point.payload.pii_risk_level] = (riskLevels[point.payload.pii_risk_level] || 0) + 1;
          }
          
          // Count PII types
          if (point.payload.pii_types && Array.isArray(point.payload.pii_types)) {
            point.payload.pii_types.forEach(type => {
              piiTypeCount[type] = (piiTypeCount[type] || 0) + 1;
            });
          }
        }
      });
      
      offset = scrollResult.next_page_offset;
      hasMore = offset !== null && offset !== undefined;
    }
    
    // Convert to sorted arrays
    const categories = Object.entries(categoryCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    const locations = Object.entries(locationCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    const tags = Object.entries(tagCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // Limit to top 50 tags
    
    const piiTypes = Object.entries(piiTypeCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    // Add "none" count for documents without PII
    riskLevels.none = totalPoints - totalWithPII;
    
    res.json({
      categories,
      locations,
      tags,
      piiStats: {
        total: totalWithPII,
        percentage: totalPoints > 0 ? ((totalWithPII / totalPoints) * 100).toFixed(1) : 0,
        riskLevels
      },
      piiTypes,
      totalDocuments: totalPoints
    });
  } catch (error) {
    console.error('Facets error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/documents/upload
 * Upload a document file (supports txt, json, pdf, doc, docx)
 */
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    // Decode base64-encoded filename (used to preserve UTF-8 for Hebrew/Arabic/etc)
    let filename = file.originalname;
    
    if (req.body.filename_encoded) {
      try {
        filename = decodeURIComponent(escape(Buffer.from(req.body.filename_encoded, 'base64').toString('binary')));
        console.log('Decoded filename from base64:', filename);
      } catch (e) {
        console.warn('Failed to decode base64 filename:', e.message);
        // Fall back to attempting latin1 decode
        if (/[\x80-\xFF]/.test(filename)) {
          try {
            const decoded = Buffer.from(filename, 'latin1').toString('utf8');
            if (!decoded.includes('\uFFFD')) {
              filename = decoded;
            }
          } catch (e2) {
            console.warn('Failed to decode filename:', e2.message);
          }
        }
      }
    } else if (/[\x80-\xFF]/.test(filename)) {
      // Fallback: try to decode if no encoded filename provided
      try {
        const decoded = Buffer.from(filename, 'latin1').toString('utf8');
        if (!decoded.includes('\uFFFD')) {
          filename = decoded;
        }
      } catch (e) {
        console.warn('Failed to decode filename:', e.message);
      }
    }
    
    const fileExt = filename.split('.').pop().toLowerCase();
    
    console.log(`Uploading file: ${filename} (${fileExt})`);

    let content = '';
    let metadata = {};

    // Parse file based on type
    try {
      switch (fileExt) {
        case 'txt':
          content = file.buffer.toString('utf8');
          break;

        case 'json':
          const jsonData = JSON.parse(file.buffer.toString('utf8'));
          // If JSON has content field, use it; otherwise stringify
          content = jsonData.content || JSON.stringify(jsonData, null, 2);
          // Extract metadata from JSON if present
          if (jsonData.metadata) metadata = jsonData.metadata;
          if (jsonData.category) metadata.category = jsonData.category;
          if (jsonData.location) metadata.location = jsonData.location;
          if (jsonData.tags) metadata.tags = jsonData.tags;
          break;

        case 'pdf':
          // Try PDF.js → HTML → Markdown approach
          console.log('Converting PDF using HTML intermediate format...');
          
          try {
            content = await pdfToMarkdownViaHtml(file.buffer);
            console.log('✓ PDF converted via HTML → Markdown successfully');
          } catch (htmlError) {
            console.warn('PDF via HTML conversion failed, trying @opendocsg/pdf2md:', htmlError.message);
            
            // Fallback 1: Try @opendocsg/pdf2md
            try {
              content = await pdf2md(file.buffer);
              console.log('✓ PDF converted with @opendocsg/pdf2md');
            } catch (pdf2mdError) {
              console.warn('pdf2md failed, using custom text processing:', pdf2mdError.message);
              
              // Fallback 2: Basic text extraction with processing
              const pdfData = await pdfParse(file.buffer);
              content = processPdfText(pdfData.text);
              console.log('✓ PDF processed with basic text extraction');
            }
          }
          
          // Get page count
          const pdfData = await pdfParse(file.buffer);
          metadata.pages = pdfData.numpages;
          break;

        case 'docx':
          // Convert to markdown to preserve headings, lists, tables, etc.
          const docxResult = await mammoth.convertToMarkdown({ buffer: file.buffer });
          content = docxResult.value;
          console.log('DOCX converted to markdown successfully');
          break;

        case 'doc':
          // Note: .doc files are harder to parse, mammoth primarily supports .docx
          // Attempting to parse as docx format and convert to markdown
          try {
            const docResult = await mammoth.convertToMarkdown({ buffer: file.buffer });
            content = docResult.value;
            console.log('DOC converted to markdown successfully');
          } catch (docError) {
            return res.status(400).json({ 
              error: 'Unable to parse .doc file. Please convert to .docx format.',
              details: docError.message
            });
          }
          break;

        default:
          return res.status(400).json({ 
            error: `Unsupported file type: ${fileExt}`,
            supported: ['txt', 'json', 'pdf', 'docx', 'doc']
          });
      }
    } catch (parseError) {
      console.error('File parsing error:', parseError);
      return res.status(400).json({ 
        error: `Failed to parse ${fileExt} file`,
        details: parseError.message
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'File is empty or could not extract content' });
    }

    // Parse additional metadata from request body if provided
    if (req.body.metadata) {
      try {
        const additionalMetadata = JSON.parse(req.body.metadata);
        metadata = { ...metadata, ...additionalMetadata };
      } catch (e) {
        // Ignore if metadata is not valid JSON
      }
    }

    // PII Detection - scan for sensitive information
    if (PII_DETECTION_ENABLED) {
      console.log('Scanning for PII...');
      const piiResult = await detectPII(content);
      
      if (piiResult.hasPII) {
        metadata.pii_detected = true;
        metadata.pii_types = piiResult.piiTypes;
        metadata.pii_details = piiResult.piiDetails;
        metadata.pii_risk_level = piiResult.riskLevel;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        metadata.pii_detection_method = piiResult.detectionMethod;
        
        console.log(`⚠️  PII detected: ${piiResult.piiTypes.join(', ')} (${piiResult.piiDetails.length} items)`);
      } else {
        metadata.pii_detected = false;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        console.log('✓ No PII detected');
      }
    }

    // Automatic categorization if enabled and requested
    if (CATEGORIZATION_MODEL && req.body.auto_categorize === 'true') {
      console.log('Automatic categorization requested...');
      const extracted = await categorizeDocument(content);
      metadata = { ...metadata, ...extracted };
      console.log('Extracted metadata:', extracted);
    }

    // Parse metadata from content if it's structured
    const parsedMetadata = parseMetadataFromContent(filename, content, metadata);
    parsedMetadata.file_type = fileExt;

    // Get dense embedding
    const denseEmbedding = await getDenseEmbedding(content);
    if (!denseEmbedding) {
      throw new Error('Failed to generate embedding');
    }

    // Generate sparse vector
    const sparseVector = getSparseVector(content);

    // Create point ID from filename and timestamp
    const pointId = simpleHash(filename + Date.now());

    // Store in Qdrant
    await qdrantClient.upsert(COLLECTION_NAME, {
      points: [
        {
          id: pointId,
          vector: {
            dense: denseEmbedding,
            sparse: sparseVector
          },
          payload: {
            ...parsedMetadata,
            content: content,
            added_at: new Date().toISOString()
          }
        }
      ]
    });

    console.log(`✅ Successfully uploaded: ${filename}`);

    res.json({
      success: true,
      message: `File "${filename}" uploaded successfully`,
      id: pointId,
      fileType: fileExt,
      contentLength: content.length,
      metadata: parsedMetadata
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to upload file'
    });
  }
});

/**
 * POST /api/documents/add
 * Add a new document to the collection (legacy text-based endpoint)
 */
app.post('/api/documents/add', async (req, res) => {
  try {
    const { filename, content, metadata = {} } = req.body;
    
    if (!filename || !content) {
      return res.status(400).json({ error: 'Filename and content are required' });
    }
    
    console.log(`Adding document: ${filename}`);
    
    // PII Detection - scan for sensitive information
    if (PII_DETECTION_ENABLED) {
      console.log('Scanning for PII...');
      const piiResult = await detectPII(content);
      
      if (piiResult.hasPII) {
        metadata.pii_detected = true;
        metadata.pii_types = piiResult.piiTypes;
        metadata.pii_details = piiResult.piiDetails;
        metadata.pii_risk_level = piiResult.riskLevel;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        metadata.pii_detection_method = piiResult.detectionMethod;
        
        console.log(`⚠️  PII detected: ${piiResult.piiTypes.join(', ')} (${piiResult.piiDetails.length} items)`);
      } else {
        metadata.pii_detected = false;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        console.log('✓ No PII detected');
      }
    }
    
    // Parse metadata from content
    const parsedMetadata = parseMetadataFromContent(filename, content, metadata);
    
    // Get dense embedding
    const denseEmbedding = await getDenseEmbedding(content);
    if (!denseEmbedding) {
      throw new Error('Failed to generate embedding');
    }
    
    // Generate sparse vector
    const sparseVector = getSparseVector(content);
    
    // Create point ID from filename
    const pointId = simpleHash(filename + Date.now());
    
    // Store in Qdrant
    await qdrantClient.upsert(COLLECTION_NAME, {
      points: [
        {
          id: pointId,
          vector: {
            dense: denseEmbedding,
            sparse: sparseVector
          },
          payload: {
            ...parsedMetadata,
            content: content,
            added_at: new Date().toISOString()
          }
        }
      ]
    });
    
    console.log(`✅ Successfully added: ${filename}`);
    
    res.json({
      success: true,
      message: `Document "${filename}" added successfully`,
      id: pointId,
      metadata: parsedMetadata
    });
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to add document'
    });
  }
});

/**
 * POST /api/documents/:id/scan-pii
 * Scan existing document for PII (retroactive scanning)
 */
app.post('/api/documents/:id/scan-pii', async (req, res) => {
  try {
    if (!PII_DETECTION_ENABLED) {
      return res.status(400).json({ 
        success: false,
        error: 'PII detection is not enabled on this server' 
      });
    }

    const docId = parseInt(req.params.id);
    
    // Retrieve document from Qdrant
    const docs = await qdrantClient.retrieve(COLLECTION_NAME, { 
      ids: [docId],
      with_payload: true,
      with_vector: false
    });
    
    if (!docs || docs.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Document not found' 
      });
    }
    
    const doc = docs[0];
    
    // Always allow rescanning - no time restrictions
    console.log(`Scanning document ${doc.payload.filename} for PII...`);
    
    // Scan for PII
    const piiResult = await detectPII(doc.payload.content);
    
    // Update document in Qdrant (only PII fields)
    await qdrantClient.setPayload(COLLECTION_NAME, {
      points: [docId],
      payload: {
        pii_detected: piiResult.hasPII,
        pii_types: piiResult.piiTypes || [],
        pii_details: piiResult.piiDetails || [],
        pii_risk_level: piiResult.riskLevel || 'low',
        pii_scan_date: piiResult.scanTimestamp,
        pii_detection_method: piiResult.detectionMethod
      }
    });
    
    // Return friendly message
    const message = piiResult.hasPII 
      ? `⚠️ Found ${piiResult.piiTypes.length} type(s) of sensitive data in ${piiResult.piiDetails.length} location(s)`
      : '✓ No sensitive data detected';
    
    res.json({
      success: true,
      piiDetected: piiResult.hasPII,
      message: message,
      piiTypes: piiResult.piiTypes,
      riskLevel: piiResult.riskLevel,
      detailsCount: piiResult.piiDetails.length,
      filename: doc.payload.filename
    });
    
  } catch (error) {
    console.error('PII scan error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * POST /api/documents/scan-all-pii
 * Scan all documents for PII (bulk retroactive scanning)
 */
app.post('/api/documents/scan-all-pii', async (req, res) => {
  try {
    if (!PII_DETECTION_ENABLED) {
      return res.status(400).json({ 
        success: false,
        error: 'PII detection is not enabled on this server' 
      });
    }

    let scanned = 0;
    let withPII = 0;
    let errors = 0;
    let skipped = 0;
    const force = req.body.force === true;
    
    console.log('Starting bulk PII scan...');
    
    // Stream all documents
    let offset = null;
    let hasMore = true;
    
    while (hasMore) {
      const scrollResult = await qdrantClient.scroll(COLLECTION_NAME, {
        limit: 50,
        with_payload: true,
        with_vector: false,
        offset: offset
      });
      
      if (!scrollResult.points || scrollResult.points.length === 0) {
        hasMore = false;
        break;
      }
      
      for (const point of scrollResult.points) {
        // Skip if already scanned and not forced
        if (point.payload.pii_scan_date && !force) {
          const lastScan = new Date(point.payload.pii_scan_date);
          const hoursSinceLastScan = (Date.now() - lastScan) / 1000 / 60 / 60;
          
          if (hoursSinceLastScan < 24) {
            skipped++;
            continue;
          }
        }
        
        try {
          console.log(`Scanning: ${point.payload.filename}`);
          const piiResult = await detectPII(point.payload.content);
          
          await qdrantClient.setPayload(COLLECTION_NAME, {
            points: [point.id],
            payload: {
              pii_detected: piiResult.hasPII,
              pii_types: piiResult.piiTypes || [],
              pii_details: piiResult.piiDetails || [],
              pii_risk_level: piiResult.riskLevel || 'low',
              pii_scan_date: piiResult.scanTimestamp,
              pii_detection_method: piiResult.detectionMethod
            }
          });
          
          scanned++;
          if (piiResult.hasPII) {
            withPII++;
            console.log(`  ⚠️  Found PII: ${piiResult.piiTypes.join(', ')}`);
          }
          
        } catch (err) {
          console.error(`Error scanning ${point.id}:`, err.message);
          errors++;
        }
      }
      
      offset = scrollResult.next_page_offset;
      if (!offset) {
        hasMore = false;
      }
    }
    
    const message = `Scanned ${scanned} documents, found PII in ${withPII}${skipped > 0 ? ` (skipped ${skipped} recently scanned)` : ''}`;
    console.log(`✓ Bulk scan complete: ${message}`);
    
    res.json({
      success: true,
      message: message,
      stats: { 
        scanned, 
        withPII, 
        errors, 
        skipped,
        percentageWithPII: scanned > 0 ? ((withPII / scanned) * 100).toFixed(1) : 0
      }
    });
    
  } catch (error) {
    console.error('Bulk scan error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Parse metadata from content and provided metadata
 */
function parseMetadataFromContent(filename, content, providedMetadata) {
  const metadata = {
    filename: filename,
    word_count: content.split(/\s+/).length,
    char_count: content.length,
    has_structured_metadata: false
  };
  
  // Merge provided metadata
  Object.assign(metadata, providedMetadata);
  
  // Check if category was already provided (e.g., from auto-categorization)
  if (providedMetadata.category) {
    metadata.has_structured_metadata = true;
  }
  
  // Try to extract structured metadata from content
  const categoryMatch = content.match(/^Category:\s*(.+)/im);
  const locationMatch = content.match(/^Location:\s*(.+)/im);
  const dateMatch = content.match(/^Date:\s*(.+)/im);
  const tagsMatch = content.match(/^Tags:\s*(.+)/im);
  const priceMatch = content.match(/^Price:\s*(\d+(?:\.\d+)?)/im);
  const ratingMatch = content.match(/^Rating:\s*(\d+(?:\.\d+)?)/im);
  const statusMatch = content.match(/^Status:\s*(.+)/im);
  const coordinatesMatch = content.match(/^Coordinates:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/im);
  
  if (categoryMatch) {
    metadata.category = categoryMatch[1].trim();
    metadata.has_structured_metadata = true;
  }
  
  if (locationMatch) metadata.location = locationMatch[1].trim();
  if (dateMatch) metadata.date = dateMatch[1].trim();
  if (tagsMatch) {
    metadata.tags = tagsMatch[1].split(',').map(t => t.trim());
    metadata.has_structured_metadata = true;
  }
  if (priceMatch) {
    metadata.price = parseFloat(priceMatch[1]);
    metadata.has_structured_metadata = true;
  }
  if (ratingMatch) {
    metadata.rating = parseFloat(ratingMatch[1]);
    metadata.has_structured_metadata = true;
  }
  if (statusMatch) metadata.status = statusMatch[1].trim();
  if (coordinatesMatch) {
    metadata.coordinates = {
      lat: parseFloat(coordinatesMatch[1]),
      lon: parseFloat(coordinatesMatch[2])
    };
  }
  
  // If no structured metadata found, mark as unstructured
  if (!metadata.has_structured_metadata) {
    metadata.is_unstructured = true;
  }
  
  return metadata;
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Ready to search in collection: ${COLLECTION_NAME}`);
});
