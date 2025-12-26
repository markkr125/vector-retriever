const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');
require('dotenv').config({ quiet: true });

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

// API Routes

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
 * POST /api/documents/add
 * Add a new document to the collection
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
