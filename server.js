const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const pdf2md = require('@opendocsg/pdf2md');
const TurndownService = require('turndown');
const { QdrantClient } = require('@qdrant/js-client-rest');
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
      
      // Process each row
      sortedRows.forEach(([y, items]) => {
        // Sort items by X position (left to right)
        items.sort((a, b) => a.x - b.x);
        
        // Detect if this is a table row (multiple items with significant gaps)
        const gaps = [];
        for (let i = 1; i < items.length; i++) {
          gaps.push(items[i].x - (items[i-1].x + items[i-1].width));
        }
        const hasLargeGaps = gaps.some(g => g > 20); // Significant spacing
        
        if (items.length >= 3 && hasLargeGaps) {
          // Likely a table row
          htmlContent += '<table><tr>\n';
          items.forEach(item => {
            htmlContent += `<td>${item.text}</td>`;
          });
          htmlContent += '</tr></table>\n';
        } else {
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
    maxFileSizeMB: MAX_FILE_SIZE_MB
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
    const { query, limit = 10, filters } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    const queryEmbedding = await getDenseEmbedding(query);
    
    const searchParams = {
      vector: {
        name: 'dense',
        vector: queryEmbedding
      },
      limit: parseInt(limit),
      with_payload: true
    };
    
    if (filters) {
      searchParams.filter = filters;
    }
    
    const results = await qdrantClient.search(COLLECTION_NAME, searchParams);
    
    res.json({
      query,
      searchType: 'semantic',
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
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
    const { query, limit = 10, denseWeight = 0.7, filters } = req.body;
    
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
      with_payload: true
    };
    
    if (filters) {
      searchParams.filter = filters;
    }
    
    const results = await qdrantClient.search(COLLECTION_NAME, searchParams);
    
    res.json({
      query,
      searchType: 'hybrid',
      denseWeight,
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
    const { query, location, limit = 10 } = req.body;
    
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
      with_payload: true
    });
    
    res.json({
      query,
      location,
      searchType: 'location',
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
    const { query, latitude, longitude, radius, limit = 10 } = req.body;
    
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
      with_payload: true
    });
    
    res.json({
      query,
      center: { latitude, longitude },
      radius,
      searchType: 'geo',
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
