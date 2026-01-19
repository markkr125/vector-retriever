const { QdrantClient } = require('@qdrant/js-client-rest');

function getTestDenseVectorSize(documents = []) {
  const envValue = process.env.TEST_EMBEDDING_DIM;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  for (const doc of documents) {
    if (Array.isArray(doc?.vector) && doc.vector.length > 0) return doc.vector.length;
    if (Array.isArray(doc?.vector?.dense) && doc.vector.dense.length > 0) return doc.vector.dense.length;
  }

  throw new Error('Missing test embedding dimension. Set TEST_EMBEDDING_DIM in the environment or pass documents with vectors.');
}

/**
 * Setup a test collection with sample data
 * @param {string} collectionName - Name of the test collection
 * @returns {Promise<string>} - Collection name
 */
async function setupTestCollection(collectionName = 'test_collection', options = {}) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
  
  try {
    // Check if collection exists, delete if it does
    try {
      await client.getCollection(collectionName);
      await client.deleteCollection(collectionName);
      console.log(`Deleted existing test collection: ${collectionName}`);
    } catch (error) {
      // Collection doesn't exist, that's fine
    }

    const denseVectorSize = getTestDenseVectorSize(options.documents);

    // Create collection with hybrid vectors
    await client.createCollection(collectionName, {
      vectors: {
        dense: { 
          size: denseVectorSize, 
          distance: 'Cosine' 
        }
      },
      sparse_vectors: {
        sparse: {}
      }
    });

    console.log(`Created test collection: ${collectionName}`);

    // Create payload indexes
    await client.createPayloadIndex(collectionName, {
      field_name: 'category',
      field_schema: 'keyword'
    });

    await client.createPayloadIndex(collectionName, {
      field_name: 'location',
      field_schema: 'keyword'
    });

    await client.createPayloadIndex(collectionName, {
      field_name: 'price',
      field_schema: 'float'
    });

    return collectionName;
  } catch (error) {
    console.error('Error setting up test collection:', error);
    throw error;
  }
}

/**
 * Insert test documents into collection
 * @param {string} collectionName 
 * @param {Array} documents - Array of document objects
 */
async function insertTestDocuments(collectionName, documents) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

  const denseVectorSize = getTestDenseVectorSize(documents);
  
  const points = documents.map((doc, index) => ({
    id: doc.id || index + 1,
    vector: {
      dense: doc.vector || Array(denseVectorSize).fill(0).map(() => Math.random()),
      sparse: doc.sparse || {
        indices: [1234, 5678],
        values: [2, 1]
      }
    },
    payload: doc.payload || doc
  }));

  await client.upsert(collectionName, {
    points: points
  });

  console.log(`Inserted ${points.length} test documents into ${collectionName}`);
}

/**
 * Teardown test collection
 * @param {string} collectionName 
 */
async function teardownTestCollection(collectionName) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
  
  try {
    await client.deleteCollection(collectionName);
    console.log(`Deleted test collection: ${collectionName}`);
  } catch (error) {
    console.error('Error deleting test collection:', error);
    // Don't throw - cleanup should be best-effort
  }
}

/**
 * Wait for upload job to complete
 * @param {string} jobId 
 * @param {Function} getJobStatus - Function to fetch job status
 * @param {number} timeout - Timeout in ms
 */
async function waitForJobCompletion(jobId, getJobStatus, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const status = await getJobStatus(jobId);
    
    if (status.status === 'completed' || status.status === 'error' || status.status === 'stopped') {
      return status;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
}

module.exports = {
  setupTestCollection,
  insertTestDocuments,
  teardownTestCollection,
  waitForJobCompletion
};
