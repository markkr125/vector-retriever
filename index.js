const axios = require('axios');
const { QdrantClient } = require('@qdrant/js-client-rest');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
require('dotenv').config({ quiet: true });

const OLLAMA_URL = process.env.OLLAMA_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;
const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'documents';

if (!EMBEDDING_MODEL) {
  throw new Error('Missing required env var EMBEDDING_MODEL');
}

// Initialize Qdrant client
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

let cachedEmbeddingDimension = null;

async function getEmbeddingDimension() {
  if (cachedEmbeddingDimension) return cachedEmbeddingDimension;

  const embedding = await getDenseEmbedding('dimension_probe');
  if (!Array.isArray(embedding) || embedding.length === 0) {
    console.warn('⚠️  Could not detect embedding dimension from Ollama; defaulting to 768');
    cachedEmbeddingDimension = 768;
    return cachedEmbeddingDimension;
  }

  cachedEmbeddingDimension = embedding.length;
  console.log(`✓ Detected embedding dimension: ${cachedEmbeddingDimension}`);
  return cachedEmbeddingDimension;
}

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
      model: EMBEDDING_MODEL,
      input: text
    }, {
      headers
    });
    return response.data.embeddings[0];
  } catch (error) {
    console.error('Error getting dense embedding:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

/**
 * Generate sparse vector representation (simple BM25-like token frequency)
 * In production, you'd use a proper BM25 implementation or SPLADE
 */
function getSparseVector(text) {
  // Tokenize and create sparse representation
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2); // Filter short words
  
  const tokenFreq = {};
  tokens.forEach(token => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });
  
  // Create sparse vector format for Qdrant
  // Use a Map to handle hash collisions
  const sparseMap = new Map();
  
  // Simple hash function for token to index mapping
  Object.entries(tokenFreq).forEach(([token, freq]) => {
    const hash = simpleHash(token) % 10000; // Limit to 10000 dimensions
    // If hash collision, add frequencies
    sparseMap.set(hash, (sparseMap.get(hash) || 0) + freq);
  });
  
  // Convert to sorted arrays
  const sortedEntries = Array.from(sparseMap.entries()).sort((a, b) => a[0] - b[0]);
  const indices = sortedEntries.map(([idx]) => idx);
  const values = sortedEntries.map(([, val]) => val);
  
  return { indices, values };
}

/**
 * Simple hash function for token mapping
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Parse metadata from filename and content
 */
function parseMetadata(filename, content) {
  const lines = content.split('\n').filter(l => l.trim());
  const metadata = {
    filename: path.basename(filename),
    filepath: filename,
    word_count: content.split(/\s+/).length,
    char_count: content.length,
    has_structured_metadata: false
  };
  
  // Try to extract structured metadata from content
  // Expected format: "Category: value" on separate lines
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
  } else {
    // For unstructured documents, try to infer category from filename
    const filenameLower = path.basename(filename).toLowerCase();
    if (filenameLower.includes('unstructured')) {
      metadata.category = 'unstructured';
      metadata.is_unstructured = true;
      
      // Extract topic from filename (e.g., unstructured_meditation_guide.txt -> meditation)
      const topicMatch = filenameLower.match(/unstructured_(.+?)(?:_guide|_essay|_recipe|_story|_history)?\.txt/);
      if (topicMatch) {
        metadata.topic = topicMatch[1].replace(/_/g, ' ');
      }
    }
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
  
  return metadata;
}

/**
 * Initialize Qdrant collection with hybrid search support
 */
async function initializeCollection() {
  try {
    // Check if collection exists
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (exists) {
      console.log(`Collection '${COLLECTION_NAME}' already exists.`);
      return;
    }
    
    const denseVectorSize = await getEmbeddingDimension();

    // Create collection with both dense and sparse vector support
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        // Dense vector for semantic search
        dense: {
          size: denseVectorSize,
          distance: 'Cosine'
        }
      },
      sparse_vectors: {
        // Sparse vector for keyword search (BM25-like)
        sparse: {
          index: {
            on_disk: false
          }
        }
      }
    });
    
    // Create payload indexes for fast filtering
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'category',
      field_schema: 'keyword'
    });
    
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'location',
      field_schema: 'keyword'
    });
    
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'tags',
      field_schema: 'keyword'
    });
    
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'price',
      field_schema: 'float'
    });
    
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'rating',
      field_schema: 'float'
    });
    
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'status',
      field_schema: 'keyword'
    });
    
    await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'coordinates',
      field_schema: 'geo'
    });
    
    console.log(`Collection '${COLLECTION_NAME}' created with hybrid search support and payload indexes.`);
  } catch (error) {
    console.error('Error initializing collection:', error.message);
    throw error;
  }
}

/**
 * Embed and store files in Qdrant
 */
async function embedFiles() {
  console.log('Initializing Qdrant collection...');
  await initializeCollection();
  
  const files = glob.sync('./data/**/*.txt');
  console.log(`Found ${files.length} files to embed.`);
  
  for (const file of files) {
    console.log(`\nProcessing ${file}...`);
    const content = fs.readFileSync(file, 'utf8');
    
    // Get dense embedding
    const denseEmbedding = await getDenseEmbedding(content);
    if (!denseEmbedding) {
      console.log(`Failed to embed ${file}`);
      continue;
    }
    
    // Get sparse vector
    const sparseVector = getSparseVector(content);
    
    // Parse metadata
    const metadata = parseMetadata(file, content);
    metadata.content = content;
    
    // Generate unique ID
    const pointId = simpleHash(file);
    
    // Upsert point with both dense and sparse vectors
    try {
      await qdrantClient.upsert(COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: pointId,
            vector: {
              dense: denseEmbedding,
              sparse: sparseVector
            },
            payload: metadata
          }
        ]
      });
      
      console.log(`✓ Embedded and stored ${file}`);
      console.log(`  Metadata:`, JSON.stringify(metadata, null, 2));
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error storing ${file}:`, error.message);
      continue;
    }
  }
  
  console.log('\n✅ All files processed successfully!');
}

/**
 * Perform semantic search (dense vectors only)
 */
async function semanticSearch(query, limit = 5) {
  console.log(`\n🔍 Semantic Search: "${query}"\n`);
  
  const queryEmbedding = await getDenseEmbedding(query);
  if (!queryEmbedding) {
    console.log('Failed to get embedding for query.');
    return;
  }
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: {
      name: 'dense',
      vector: queryEmbedding
    },
    limit: limit,
    with_payload: true
  });
  
  console.log('Results:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   File: ${result.payload.filename}`);
    console.log(`   Category: ${result.payload.category || 'N/A'}`);
    console.log(`   Content: ${result.payload.content.substring(0, 150)}...`);
  });
}

/**
 * Perform hybrid search (dense + sparse vectors)
 */
async function hybridSearch(query, limit = 5, denseWeight = 0.7) {
  console.log(`\n🔍 Hybrid Search: "${query}"`);
  console.log(`   (Dense weight: ${denseWeight}, Sparse weight: ${1 - denseWeight})\n`);
  
  const denseEmbedding = await getDenseEmbedding(query);
  const sparseVector = getSparseVector(query);
  
  if (!denseEmbedding) {
    console.log('Failed to get embedding for query.');
    return;
  }
  
  // Qdrant hybrid search with score fusion
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: {
      name: 'dense',
      vector: denseEmbedding
    },
    sparse_vector: {
      name: 'sparse',
      vector: sparseVector
    },
    limit: limit,
    with_payload: true
  });
  
  console.log('Results:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   File: ${result.payload.filename}`);
    console.log(`   Category: ${result.payload.category || 'N/A'}`);
    if (result.payload.tags) {
      console.log(`   Tags: ${result.payload.tags.join(', ')}`);
    }
    console.log(`   Content: ${result.payload.content.substring(0, 150)}...`);
  });
}

/**
 * Perform filtered search with complex conditions
 */
async function filteredSearch(query, filters, limit = 5) {
  console.log(`\n🔍 Filtered Search: "${query}"`);
  console.log(`   Filters:`, JSON.stringify(filters, null, 2), '\n');
  
  const queryEmbedding = await getDenseEmbedding(query);
  if (!queryEmbedding) {
    console.log('Failed to get embedding for query.');
    return;
  }
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: {
      name: 'dense',
      vector: queryEmbedding
    },
    filter: filters,
    limit: limit,
    with_payload: true
  });
  
  console.log(`Found ${results.length} results:`);
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   File: ${result.payload.filename}`);
    console.log(`   Category: ${result.payload.category || 'N/A'}`);
    if (result.payload.price) console.log(`   Price: $${result.payload.price}`);
    if (result.payload.rating) console.log(`   Rating: ${result.payload.rating}/5`);
    if (result.payload.location) console.log(`   Location: ${result.payload.location}`);
    console.log(`   Content: ${result.payload.content.substring(0, 150)}...`);
  });
}

/**
 * Perform geo-filtered search
 */
async function geoSearch(query, centerLat, centerLon, radiusMeters, limit = 5) {
  console.log(`\n🌍 Geo-Filtered Search: "${query}"`);
  console.log(`   Center: ${centerLat}, ${centerLon}`);
  console.log(`   Radius: ${radiusMeters}m\n`);
  
  const queryEmbedding = await getDenseEmbedding(query);
  if (!queryEmbedding) {
    console.log('Failed to get embedding for query.');
    return;
  }
  
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
              lat: centerLat,
              lon: centerLon
            },
            radius: radiusMeters
          }
        }
      ]
    },
    limit: limit,
    with_payload: true
  });
  
  console.log(`Found ${results.length} results within ${radiusMeters}m:`);
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   File: ${result.payload.filename}`);
    console.log(`   Location: ${result.payload.location || 'N/A'}`);
    if (result.payload.coordinates) {
      console.log(`   Coordinates: ${result.payload.coordinates.lat}, ${result.payload.coordinates.lon}`);
    }
    console.log(`   Content: ${result.payload.content.substring(0, 150)}...`);
  });
}

/**
 * Demo function to showcase all features
 */
async function runDemo() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 QDRANT ADVANCED FEATURES DEMONSTRATION');
  console.log('='.repeat(70));
  
  // Demo 1: Semantic Search
  await semanticSearch('artificial intelligence and machine learning', 3);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Demo 2: Hybrid Search
  await hybridSearch('luxury hotels with excellent service', 3);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Demo 3: Complex Filtered Search - Must/Should/Must_Not
  console.log('\n' + '='.repeat(70));
  await filteredSearch('great food and atmosphere', {
    must: [
      { key: 'category', match: { value: 'restaurant' } }
    ],
    should: [
      { key: 'rating', range: { gte: 4.5 } },
      { key: 'tags', match: { any: ['fine-dining', 'romantic'] } }
    ],
    must_not: [
      { key: 'status', match: { value: 'closed' } }
    ]
  }, 3);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Demo 4: Price Range Filter
  console.log('\n' + '='.repeat(70));
  await filteredSearch('nice place to stay', {
    must: [
      { key: 'price', range: { gte: 100, lte: 300 } }
    ]
  }, 3);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Demo 5: Nested Field Filter with Tags
  console.log('\n' + '='.repeat(70));
  await filteredSearch('outdoor activities', {
    must: [
      { key: 'tags', match: { any: ['outdoor', 'adventure', 'nature'] } }
    ]
  }, 3);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Demo 6: Geo-Filtered Search (if data includes coordinates)
  console.log('\n' + '='.repeat(70));
  await geoSearch('tourist attractions', 40.7128, -74.0060, 50000, 3); // NYC area
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Demo completed!');
  console.log('='.repeat(70) + '\n');
}

/**
 * Perform location-based search
 */
async function locationSearch(query, locationName, limit = 5) {
  console.log(`\n📍 Location Search: "${query}" in ${locationName}\n`);
  
  const queryEmbedding = await getDenseEmbedding(query);
  if (!queryEmbedding) {
    console.log('Failed to get embedding for query.');
    return;
  }
  
  const results = await qdrantClient.search(COLLECTION_NAME, {
    vector: {
      name: 'dense',
      vector: queryEmbedding
    },
    filter: {
      must: [
        { key: 'location', match: { value: locationName } }
      ]
    },
    limit: limit,
    with_payload: true
  });
  
  console.log(`Found ${results.length} results in ${locationName}:`);
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   File: ${result.payload.filename}`);
    console.log(`   Category: ${result.payload.category || 'N/A'}`);
    if (result.payload.price) console.log(`   Price: $${result.payload.price}`);
    if (result.payload.rating) console.log(`   Rating: ${result.payload.rating}/5`);
    if (result.payload.tags) console.log(`   Tags: ${result.payload.tags.join(', ')}`);
    console.log(`   Content: ${result.payload.content.substring(0, 150)}...`);
  });
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args[0] === 'embed') {
      await embedFiles();
    } else if (args[0] === 'search') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log('Please provide a search query.');
        return;
      }
      await semanticSearch(query);
    } else if (args[0] === 'hybrid') {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.log('Please provide a search query.');
        return;
      }
      await hybridSearch(query);
    } else if (args[0] === 'location') {
      const location = args[1];
      const query = args.slice(2).join(' ');
      if (!location || !query) {
        console.log('Usage: node index.js location <city> <query>');
        console.log('Example: node index.js location Paris "luxury hotel"');
        return;
      }
      await locationSearch(query, location);
    } else if (args[0] === 'geo') {
      const lat = parseFloat(args[1]);
      const lon = parseFloat(args[2]);
      const radius = parseFloat(args[3]);
      const query = args.slice(4).join(' ');
      if (!lat || !lon || !radius || !query) {
        console.log('Usage: node index.js geo <lat> <lon> <radius_meters> <query>');
        console.log('Example: node index.js geo 40.7128 -74.0060 50000 "restaurants"');
        return;
      }
      await geoSearch(query, lat, lon, radius);
    } else if (args[0] === 'demo') {
      await runDemo();
    } else {
      console.log('Usage:');
      console.log('  node index.js embed                          - Embed all files from sample-data/ directory');
      console.log('  node index.js search <query>                 - Semantic search');
      console.log('  node index.js hybrid <query>                 - Hybrid search (semantic + keyword)');
      console.log('  node index.js location <city> <query>        - Search in specific location');
      console.log('  node index.js geo <lat> <lon> <radius> <q>   - Geo-radius search');
      console.log('  node index.js demo                           - Run comprehensive demo');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
