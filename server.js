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
const { VisualizationService } = require('./visualization-service');
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

// In-memory upload job store
const uploadJobs = new Map();
let jobIdCounter = 1;

// Temporary file storage for by-document search (with 1 hour TTL)
const tempFiles = new Map();
let tempFileIdCounter = 1;
const TEMP_FILE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

function generateJobId() {
  return `job_${Date.now()}_${jobIdCounter++}`;
}

function generateTempFileId() {
  return `temp_${Date.now()}_${tempFileIdCounter++}`;
}

function storeTempFile(fileBuffer, filename, mimetype) {
  const id = generateTempFileId();
  const expiresAt = Date.now() + TEMP_FILE_TTL;
  
  tempFiles.set(id, {
    id,
    buffer: fileBuffer,
    filename,
    mimetype,
    uploadedAt: Date.now(),
    expiresAt
  });
  
  console.log(`Stored temp file: ${id} (${filename}), expires at ${new Date(expiresAt).toISOString()}`);
  return { id, expiresAt };
}

function getTempFile(id) {
  const file = tempFiles.get(id);
  if (!file) return null;
  
  // Check if expired
  if (Date.now() > file.expiresAt) {
    tempFiles.delete(id);
    console.log(`Temp file expired and removed: ${id}`);
    return null;
  }
  
  return file;
}

// Cleanup expired temp files every 10 minutes
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [id, file] of tempFiles.entries()) {
    if (now > file.expiresAt) {
      tempFiles.delete(id);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} expired temp files`);
  }
}, 10 * 60 * 1000); // Run every 10 minutes

function createJob(totalFiles) {
  const jobId = generateJobId();
  const job = {
    id: jobId,
    status: 'processing', // processing, completed, stopped, error
    totalFiles,
    processedFiles: 0,
    successfulFiles: 0,
    failedFiles: 0,
    currentFile: null,
    files: [], // { name, status: 'pending'|'processing'|'success'|'error', error?, id? }
    errors: [],
    startTime: Date.now(),
    endTime: null
  };
  uploadJobs.set(jobId, job);
  return job;
}

/**
 * Process a single file upload
 */
async function processSingleFile(file, autoCategorize = false) {
  // Decode base64-encoded filename (used to preserve UTF-8 for Hebrew/Arabic/etc)
  let filename = file.originalname;
  
  // Note: For multiple file upload, filename_encoded should be per-file
  // For now, we'll use the originalname directly and handle encoding in the client
  if (/[\x80-\xFF]/.test(filename)) {
    // Fallback: try to decode if contains non-ASCII
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
  
  console.log(`Processing file: ${filename} (${fileExt})`);

  let content = '';
  let metadata = {};

  // Parse file based on type
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
      const docResult = await mammoth.convertToMarkdown({ buffer: file.buffer });
      content = docResult.value;
      console.log('DOC converted to markdown successfully');
      break;

    default:
      throw new Error(`Unsupported file type: ${fileExt}. Supported: txt, json, pdf, docx, doc`);
  }

  if (!content || content.trim().length === 0) {
    throw new Error('File is empty or could not extract content');
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
  if (CATEGORIZATION_MODEL && autoCategorize) {
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

  return {
    filename,
    id: pointId,
    fileType: fileExt,
    contentLength: content.length,
    metadata: parsedMetadata
  };
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

// Initialize Visualization Service
const VIZ_CACHE_STRATEGY = process.env.VIZ_CACHE_STRATEGY || 'memory'; // 'memory' or 'redis'
const visualizationService = new VisualizationService(
  qdrantClient,
  COLLECTION_NAME,
  VIZ_CACHE_STRATEGY
);

console.log(`Visualization cache strategy: ${VIZ_CACHE_STRATEGY}`);

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
    const { query, limit = 10, offset = 0, filters, documentIds } = req.body;
    
    // Debug: Log filters
    if (filters) {
      console.log('Semantic search filters:', JSON.stringify(filters, null, 2));
    }
    if (documentIds) {
      console.log('Semantic search documentIds:', documentIds);
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
      
      // Build filter with documentIds if provided
      let effectiveFilters = filters;
      if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
        if (!effectiveFilters) {
          effectiveFilters = { must: [] };
        } else if (!effectiveFilters.must) {
          effectiveFilters = { ...effectiveFilters, must: [] };
        } else {
          effectiveFilters = { ...effectiveFilters, must: [...effectiveFilters.must] };
        }
        effectiveFilters.must.push({ has_id: documentIds });
      }
      
      if (effectiveFilters) {
        // Special handling for never_scanned filter - need to do client-side filtering
        const hasNeverScannedFilter = effectiveFilters.must_not && 
          effectiveFilters.must_not.some(f => f.key === 'pii_detected');
        
        if (hasNeverScannedFilter) {
          // Can't filter for missing fields in Qdrant, so fetch all and filter
          const allResults = [];
          let scrollOffset = null;
          let hasMore = true;
          
          while (hasMore) {
            const scrollResult = await qdrantClient.scroll(COLLECTION_NAME, {
              limit: 100,
              offset: scrollOffset,
              with_payload: true,
              filter: effectiveFilters.must ? { must: effectiveFilters.must } : undefined // Apply other filters
            });
            
            scrollResult.points.forEach(p => {
              // Check if pii_detected field is missing
              if (p.payload.pii_detected === undefined) {
                allResults.push(p);
              }
            });
            
            scrollOffset = scrollResult.next_page_offset;
            hasMore = scrollOffset !== null && scrollOffset !== undefined;
          }
          
          // Paginate results
          const startIdx = parseInt(offset);
          const endIdx = startIdx + parseInt(limit);
          results = allResults.slice(startIdx, endIdx).map(p => ({
            id: p.id,
            score: 1.0,
            payload: p.payload
          }));
          
          totalEstimate = allResults.length;
        } else {
          scrollParams.filter = effectiveFilters;
          const scrollResults = await qdrantClient.scroll(COLLECTION_NAME, scrollParams);
          results = scrollResults.points.map(p => ({
            id: p.id,
            score: 1.0,
            payload: p.payload
          }));
          totalEstimate = await countFilteredDocuments(effectiveFilters);
        }
      } else {
        const scrollResults = await qdrantClient.scroll(COLLECTION_NAME, scrollParams);
        results = scrollResults.points.map(p => ({
          id: p.id,
          score: 1.0,
          payload: p.payload
        }));
        totalEstimate = await countFilteredDocuments(filters);
      }
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
      
      // Build filter with documentIds if provided
      let effectiveFilters = filters;
      if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
        if (!effectiveFilters) {
          effectiveFilters = { must: [] };
        } else if (!effectiveFilters.must) {
          effectiveFilters = { ...effectiveFilters, must: [] };
        } else {
          effectiveFilters = { ...effectiveFilters, must: [...effectiveFilters.must] };
        }
        effectiveFilters.must.push({ has_id: documentIds });
      }
      
      if (effectiveFilters) {
        const hasNeverScannedFilter = effectiveFilters.must_not && 
          effectiveFilters.must_not.some(f => f.key === 'pii_detected');
        
        if (hasNeverScannedFilter) {
          // For never_scanned with vector search, get more results then filter
          const largeSearchParams = {
            ...searchParams,
            limit: 1000,
            filter: effectiveFilters.must ? { must: effectiveFilters.must } : undefined
          };
          
          const allResults = await qdrantClient.search(COLLECTION_NAME, largeSearchParams);
          const filteredResults = allResults.filter(r => r.payload.pii_detected === undefined);
          
          const startIdx = parseInt(offset);
          const endIdx = startIdx + parseInt(limit);
          results = filteredResults.slice(startIdx, endIdx).map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload
          }));
          
          totalEstimate = filteredResults.length;
        } else {
          searchParams.filter = effectiveFilters;
          const searchResults = await qdrantClient.search(COLLECTION_NAME, searchParams);
          results = searchResults.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload
          }));
          totalEstimate = await countFilteredDocuments(effectiveFilters);
        }
      } else if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
        // No filters but documentIds provided
        searchParams.filter = {
          must: [{ has_id: documentIds }]
        };
        const searchResults = await qdrantClient.search(COLLECTION_NAME, searchParams);
        results = searchResults.map(r => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }));
        totalEstimate = documentIds.length; // Rough estimate
      } else {
        const searchResults = await qdrantClient.search(COLLECTION_NAME, searchParams);
        results = searchResults.map(r => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }));
        totalEstimate = await countFilteredDocuments(null);
      }
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
    const { query, limit = 10, offset = 0, denseWeight = 0.7, filters, documentIds } = req.body;
    
    // Debug: Log filters
    if (filters) {
     // console.log('Hybrid search filters:', JSON.stringify(filters, null, 2));
    }
    if (documentIds) {
      //console.log('Hybrid search documentIds:', documentIds);
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
        
        // Add document IDs filter if provided
        if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
          qdrantFilter.must.push({
            has_id: documentIds
          });
        }
        
        if (qdrantFilter.must.length > 0) {
          searchParams.filter = qdrantFilter;
        }
      }
      
      // If filters already in Qdrant format - add documentIds if provided
      if (filters && filters.must && Array.isArray(filters.must)) {
        if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
          searchParams.filter.must.push({
            has_id: documentIds
          });
        }
      }
    } else if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      // No filters but documentIds provided
      searchParams.filter = {
        must: [{
          has_id: documentIds
        }]
      };
    }
    
    // Special handling for never_scanned filter with vector search
    const hasNeverScannedFilter = filters && filters.must_not && 
      filters.must_not.some(f => f.key === 'pii_detected');
    
    if (hasNeverScannedFilter) {
      // For never_scanned with vector search, we need to search all then filter
      // This is less efficient but necessary since Qdrant can't filter on missing fields
      const largeSearchParams = {
        ...searchParams,
        limit: 1000, // Get more results to filter
        filter: filters.must ? { must: filters.must } : undefined
      };
      
      const allResults = await qdrantClient.search(COLLECTION_NAME, largeSearchParams);
      
      // Filter out documents that have pii_detected field
      const filteredResults = allResults.filter(r => r.payload.pii_detected === undefined);
      
      // Paginate
      const startIdx = parseInt(offset);
      const endIdx = startIdx + parseInt(limit);
      const results = filteredResults.slice(startIdx, endIdx);
      
      const totalEstimate = filteredResults.length;
      
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
    } else {
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
    }
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
 * GET /api/browse
 * Browse all documents with pagination and optional sorting
 */
app.get('/api/browse', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20');
    const page = parseInt(req.query.page || '1');
    const sortBy = req.query.sortBy || 'id'; // id, filename, date, category
    const sortOrder = req.query.sortOrder || 'asc'; // asc, desc
    const offset = (page - 1) * limit;

    console.log(`Browse request: limit=${limit}, page=${page}, offset=${offset}, sortBy=${sortBy}, sortOrder=${sortOrder}`);

    // Get collection info for total count
    const info = await qdrantClient.getCollection(COLLECTION_NAME);
    const totalDocuments = info.points_count || 0;

    // Use scroll API to fetch documents
    const scrollResult = await qdrantClient.scroll(COLLECTION_NAME, {
      limit: limit,
      offset: offset,
      with_payload: true,
      with_vector: false
    });

    let results = scrollResult.points.map(point => ({
      id: point.id,
      payload: point.payload
    }));

    // Sort results based on sortBy parameter
    if (sortBy === 'filename' && results.length > 0) {
      results.sort((a, b) => {
        const nameA = (a.payload.filename || a.payload.title || '').toLowerCase();
        const nameB = (b.payload.filename || b.payload.title || '').toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      });
    } else if (sortBy === 'date' && results.length > 0) {
      results.sort((a, b) => {
        const dateA = a.payload.date || a.payload.created_at || '';
        const dateB = b.payload.date || b.payload.created_at || '';
        return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
      });
    } else if (sortBy === 'category' && results.length > 0) {
      results.sort((a, b) => {
        const catA = (a.payload.category || '').toLowerCase();
        const catB = (b.payload.category || '').toLowerCase();
        return sortOrder === 'asc' ? catA.localeCompare(catB) : catB.localeCompare(catA);
      });
    }
    // Default 'id' sorting is handled by Qdrant's natural order

    res.json({
      success: true,
      searchType: 'browse',
      total: totalDocuments,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalDocuments / limit),
      sortBy: sortBy,
      sortOrder: sortOrder,
      results: results
    });
  } catch (error) {
    console.error('Browse error:', error);
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
 * POST /api/temp-files
 * Upload a file temporarily for by-document search
 */
app.post('/api/temp-files', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { id, expiresAt } = storeTempFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    res.json({
      id,
      filename: req.file.originalname,
      size: req.file.size,
      expiresAt: new Date(expiresAt).toISOString(),
      ttlSeconds: Math.floor(TEMP_FILE_TTL / 1000)
    });
  } catch (error) {
    console.error('Temp file upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/temp-files/:id
 * Retrieve a temporary file
 */
app.get('/api/temp-files/:id', (req, res) => {
  try {
    const file = getTempFile(req.params.id);
    
    if (!file) {
      return res.status(404).json({ 
        error: 'File not found or expired',
        message: 'Please re-upload your document to search again'
      });
    }

    res.json({
      id: file.id,
      filename: file.filename,
      size: file.buffer.length,
      uploadedAt: new Date(file.uploadedAt).toISOString(),
      expiresAt: new Date(file.expiresAt).toISOString()
    });
  } catch (error) {
    console.error('Temp file retrieval error:', error);
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
 * POST /api/search/by-document
 * Search for similar documents by uploading a file or using a temp file ID
 * This is like "find similar" but without saving the document
 */
app.post('/api/search/by-document', upload.single('file'), async (req, res) => {
  try {
    const limit = parseInt(req.body.limit) || 10;
    const offset = parseInt(req.body.offset) || 0;
    const tempFileId = req.body.tempFileId;
    
    let file;
    let fileBuffer;
    let filename;
    
    // Check if using temp file ID or direct upload
    if (tempFileId) {
      const tempFile = getTempFile(tempFileId);
      if (!tempFile) {
        return res.status(404).json({ 
          error: 'File not found or expired',
          message: 'The uploaded file has expired. Please re-upload to search again.',
          code: 'TEMP_FILE_EXPIRED'
        });
      }
      fileBuffer = tempFile.buffer;
      filename = tempFile.filename;
      console.log(`Using temp file for search: ${tempFileId} (${filename})`);
    } else if (req.file) {
      fileBuffer = req.file.buffer;
      filename = req.file.originalname;
      console.log(`Processing uploaded file for search: ${filename}`);
    } else {
      return res.status(400).json({ 
        error: 'No file uploaded or temp file ID provided',
        message: 'Please provide either a file or a tempFileId'
      });
    }
    
    // Extract text from the file
    let content = '';
    const fileExt = filename.split('.').pop().toLowerCase();
    
    try {
      if (fileExt === 'txt' || fileExt === 'md') {
        content = fileBuffer.toString('utf-8');
      } else if (fileExt === 'pdf') {
        // Use the same PDF extraction logic as the main upload
        try {
          content = await pdfToMarkdownViaHtml(fileBuffer);
        } catch (htmlError) {
          console.warn('PDF via HTML conversion failed, trying @opendocsg/pdf2md:', htmlError.message);
          try {
            content = await pdf2md(fileBuffer);
          } catch (pdf2mdError) {
            console.warn('pdf2md failed, using basic text extraction:', pdf2mdError.message);
            const pdfData = await pdfParse(fileBuffer);
            content = processPdfText(pdfData.text);
          }
        }
      } else if (fileExt === 'docx') {
        // Use markdown conversion for better structure preservation
        const result = await mammoth.convertToMarkdown({ buffer: fileBuffer });
        content = result.value;
      } else {
        return res.status(400).json({ 
          error: `Unsupported file type: ${fileExt}. Supported: txt, md, pdf, docx` 
        });
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
      return res.status(500).json({ 
        error: 'Failed to extract text from file',
        details: extractError.message 
      });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'No text content found in file' });
    }

    console.log(`Extracted ${content.length} characters from ${filename}`);

    // Generate embedding for the content
    let embedding;
    try {
      embedding = await getDenseEmbedding(content);
      if (!embedding) {
        throw new Error('Failed to generate embedding');
      }
    } catch (embeddingError) {
      console.error('Embedding generation error:', embeddingError);
      return res.status(500).json({ 
        error: 'Failed to generate embedding',
        details: embeddingError.message 
      });
    }

    // Search for similar documents using the embedding
    const totalToFetch = limit + offset;
    const searchResults = await qdrantClient.search(COLLECTION_NAME, {
      vector: {
        name: 'dense',
        vector: embedding
      },
      limit: totalToFetch,
      with_payload: true,
      with_vector: false
    });

    // Apply pagination
    const paginatedResults = searchResults.slice(offset, offset + limit);

    res.json({
      searchType: 'by-document',
      sourceFile: filename,
      contentLength: content.length,
      total: searchResults.length,
      tempFileId: tempFileId || undefined, // Include if used
      results: paginatedResults.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }))
    });

  } catch (error) {
    console.error('Search by document error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to search by document'
    });
  }
});

/**
 * GET /api/random
 * Get random documents from the collection
 */
app.get('/api/random', async (req, res) => {
  try {
    const { limit = 10, seed, offset = 0 } = req.query;
    
    // Get collection info to know total count
    const info = await qdrantClient.getCollection(COLLECTION_NAME);
    const totalPoints = info.points_count;
    
    if (totalPoints === 0) {
      return res.json({ results: [], seed: seed || Date.now() });
    }
    
    const requestedLimit = parseInt(limit);
    const offsetNum = parseInt(offset);
    
    // Use seed for reproducible randomness (or generate new one)
    const usedSeed = seed ? parseInt(seed) : Date.now();
    
    // Seeded random number generator (simple LCG)
    const seededRandom = (s) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    
    // Fetch more results than needed to randomly sample from
    const fetchLimit = Math.min(totalPoints, requestedLimit * 5); // Fetch 5x to have good randomness
    const maxOffset = Math.max(0, totalPoints - fetchLimit);
    const randomOffset = Math.floor(seededRandom(usedSeed) * maxOffset);
    
    console.log(`Random request: seed=${usedSeed}, totalPoints=${totalPoints}, requestedLimit=${requestedLimit}, offset=${offsetNum}, fetchLimit=${fetchLimit}, randomOffset=${randomOffset}`);
    
    // Use scroll API with random offset
    const results = await qdrantClient.scroll(COLLECTION_NAME, {
      limit: fetchLimit,
      offset: randomOffset,
      with_payload: true
    });
    
    // Seeded shuffle using seed + offset for pagination
    const shuffled = results.points
      .map((r, idx) => ({ r, sort: seededRandom(usedSeed + idx) }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ r }) => r)
      .slice(offsetNum, offsetNum + requestedLimit);
    
    res.json({
      searchType: 'random',
      total: totalPoints,
      seed: usedSeed,
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
    let totalNeverScanned = 0;
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
        if (point.payload.pii_detected === undefined) {
          // Never scanned
          totalNeverScanned++;
        } else if (point.payload.pii_detected === true) {
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
        // If pii_detected === false, it will be counted in "none" category below
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
    
    // Add "none" count for documents without PII (scanned but clean)
    riskLevels.none = totalPoints - totalWithPII - totalNeverScanned;
    // Add "never_scanned" count
    riskLevels.never_scanned = totalNeverScanned;
    
    // Debug logging (commented out to reduce noise)
    // console.log('PII Stats:', { totalPoints, totalWithPII, totalNeverScanned, noneCount: riskLevels.none, riskLevels });
    
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
app.post('/api/documents/upload', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const files = req.files;
    const autoCategorize = req.body.auto_categorize === 'true';

    // Create job
    const job = createJob(files.length);
    
    // Initialize file statuses
    job.files = files.map(f => ({
      name: f.originalname,
      status: 'pending',
      error: null,
      id: null
    }));

    // Return job ID immediately
    res.json({
      success: true,
      jobId: job.id,
      totalFiles: files.length
    });

    // Process files asynchronously
    (async () => {
      for (let i = 0; i < files.length; i++) {
        // Check if job was stopped
        if (job.status === 'stopped') {
          console.log(`Job ${job.id} stopped. Skipping remaining files.`);
          break;
        }

        const file = files[i];
        const fileInfo = job.files[i];
        
        fileInfo.status = 'processing';
        job.currentFile = fileInfo.name;

        try {
          const result = await processSingleFile(file, autoCategorize);
          
          fileInfo.status = 'success';
          fileInfo.id = result.id;
          job.successfulFiles++;
        } catch (error) {
          console.error(`Error processing file ${fileInfo.name}:`, error);
          
          fileInfo.status = 'error';
          fileInfo.error = error.message;
          job.failedFiles++;
          job.errors.push({
            filename: fileInfo.name,
            error: error.message
          });
        } finally {
          job.processedFiles++;
          job.currentFile = null;
        }
      }

      // Mark job as complete
      if (job.status !== 'stopped') {
        job.status = 'completed';
      }
      job.endTime = Date.now();
      
      console.log(`Job ${job.id} finished: ${job.successfulFiles} successful, ${job.failedFiles} failed`);
    })();

  } catch (error) {
    console.error('Error creating upload job:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to create upload job'
    });
  }
});

/**
 * GET /api/upload-jobs/active
 * Get the currently active upload job (if any)
 * NOTE: Must come before /:jobId route to avoid matching "active" as a jobId
 */
app.get('/api/upload-jobs/active', (req, res) => {
  // Find any job that's still processing
  for (const job of uploadJobs.values()) {
    if (job.status === 'processing') {
      return res.json(job);
    }
  }
  
  res.json(null);
});

/**
 * GET /api/upload-jobs/:jobId
 * Get the status of an upload job
 */
app.get('/api/upload-jobs/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = uploadJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(job);
});

/**
 * POST /api/upload-jobs/:jobId/stop
 * Stop an upload job
 */
app.post('/api/upload-jobs/:jobId/stop', (req, res) => {
  const { jobId } = req.params;
  const job = uploadJobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (job.status !== 'processing') {
    return res.status(400).json({ error: 'Job is not processing' });
  }
  
  job.status = 'stopped';
  console.log(`Job ${jobId} marked for stopping`);
  
  res.json({ success: true, message: 'Job will stop after current file completes' });
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

/**
 * GET /api/visualize/scatter
 * Get 2D scatter plot data for document visualization
 */
app.get('/api/visualize/scatter', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const limit = parseInt(req.query.limit) || 1000;

    const data = await visualizationService.getScatterData({
      forceRefresh,
      limit
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Visualization error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/visualize/search-results
 * Get visualization for specific search results
 */
app.post('/api/visualize/search-results', async (req, res) => {
  try {
    const { query, searchType, denseWeight, filters, limit, forceRefresh } = req.body;

    // Get query embedding if needed for semantic/hybrid search
    let queryEmbedding = null;
    if (query && (searchType === 'semantic' || searchType === 'hybrid')) {
      queryEmbedding = await getDenseEmbedding(query);
    }

    const data = await visualizationService.getSearchResultsVisualization({
      query,
      searchType,
      denseWeight,
      filters,
      limit: limit || 5000,
      forceRefresh: forceRefresh || false,
      queryEmbedding
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Search results visualization error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/visualize/refresh
 * Force refresh visualization cache
 */
app.post('/api/visualize/refresh', async (req, res) => {
  try {
    await visualizationService.clearCache();
    
    const data = await visualizationService.getScatterData({
      forceRefresh: true,
      limit: req.body.limit || 1000
    });

    res.json({
      success: true,
      message: 'Visualization cache refreshed',
      data
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/visualize/stats
 * Get cache statistics
 */
app.get('/api/visualize/stats', async (req, res) => {
  try {
    const stats = await visualizationService.getCacheStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔍 Ready to search in collection: ${COLLECTION_NAME}`);
});
