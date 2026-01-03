const crypto = require('crypto');

// Collections Metadata Service
const COLLECTIONS_METADATA_NAME = '_system_collections';

/**
 * Generate a UUID v4 using crypto
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Collection Metadata Service
 * Manages collections metadata using a special Qdrant collection
 */
class CollectionMetadataService {
  constructor(qdrantClient) {
    this.client = qdrantClient;
    this.collectionName = COLLECTIONS_METADATA_NAME;
    this.cache = new Map(); // In-memory cache for faster lookups
  }

  /**
   * Initialize the metadata collection if it doesn't exist
   */
  async initialize() {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        console.log('Creating collections metadata collection...');
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: 1,
            distance: 'Cosine'
          }
        });
        console.log('Collections metadata collection created');
      }

      // Load all collections into cache
      await this.loadCache();

      // Ensure default collection exists
      await this.ensureDefaultCollection();
    } catch (error) {
      console.error('Error initializing collections metadata:', error);
      throw error;
    }
  }

  /**
   * Load all collection metadata into cache
   */
  async loadCache() {
    try {
      const result = await this.client.scroll(this.collectionName, {
        limit: 1000,
        with_payload: true,
        with_vector: false
      });

      this.cache.clear();
      for (const point of result.points) {
        this.cache.set(point.payload.collectionId, point.payload);
      }

      console.log(`Loaded ${this.cache.size} collections into cache`);
    } catch (error) {
      console.error('Error loading collections cache:', error);
    }
  }

  /**
   * Ensure default collection exists
   */
  async ensureDefaultCollection() {
    const defaultExists = Array.from(this.cache.values()).some(c => c.isDefault);

    if (!defaultExists) {
      console.log('Creating default collection...');
      // UUID generated using crypto.randomUUID()
      const defaultId = generateUUID();

      await this.createCollection({
        collectionId: defaultId,
        displayName: 'default',
        description: 'Default collection',
        isDefault: true
      });

      console.log('Default collection created');
    }
  }

  /**
   * Create a new collection with metadata
   */
  async createCollection({ collectionId, displayName, description = '', isDefault = false }) {
    // UUID generated using crypto.randomUUID()
    if (!collectionId) {
      collectionId = generateUUID();
    }

    const qdrantName = isDefault ? 'default' : `col_${collectionId.replace(/-/g, '_')}`;
    const now = new Date().toISOString();

    const metadata = {
      collectionId,
      displayName,
      description,
      qdrantName,
      isDefault,
      createdAt: now,
      documentCount: 0
    };

    // Create actual Qdrant collection
    await this.createQdrantCollection(qdrantName);

    // Store metadata
    await this.client.upsert(this.collectionName, {
      points: [{
        id: collectionId,
        vector: [0], // Dummy vector (metadata collection doesn't need real vectors)
        payload: metadata
      }]
    });

    // Update cache
    this.cache.set(collectionId, metadata);

    console.log(`Created collection: ${displayName} (${collectionId} -> ${qdrantName})`);
    return metadata;
  }

  /**
   * Create actual Qdrant collection with standard schema
   */
  async createQdrantCollection(qdrantName) {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === qdrantName);

      if (!exists) {
        await this.client.createCollection(qdrantName, {
          vectors: {
            dense: {
              size: 768,
              distance: 'Cosine'
            }
          },
          sparse_vectors: {
            sparse: {
              index: {
                on_disk: false
              }
            }
          }
        });

        // Create payload indexes
        const indexFields = [
          'category', 'location', 'tags', 'price', 'rating',
          'status', 'coordinates', 'pii_detected', 'pii_risk_level',
          'has_structured_metadata', 'is_unstructured'
        ];

        for (const field of indexFields) {
          try {
            await this.client.createPayloadIndex(qdrantName, {
              field_name: field,
              field_schema: 'keyword'
            });
          } catch (err) {
            // Geo field needs special handling
            if (field === 'coordinates') {
              await this.client.createPayloadIndex(qdrantName, {
                field_name: field,
                field_schema: 'geo'
              });
            }
          }
        }

        console.log(`Created Qdrant collection: ${qdrantName} with indexes`);
      }
    } catch (error) {
      console.error(`Error creating Qdrant collection ${qdrantName}:`, error);
      throw error;
    }
  }

  /**
   * Get collection metadata by ID
   */
  getCollection(collectionId) {
    return this.cache.get(collectionId);
  }

  /**
   * Get all collections
   */
  getAllCollections() {
    return Array.from(this.cache.values()).sort((a, b) => {
      // Default collection first
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  /**
   * Get default collection
   */
  getDefaultCollection() {
    return Array.from(this.cache.values()).find(c => c.isDefault);
  }

  /**
   * Update collection document count
   */
  async updateDocumentCount(collectionId, count) {
    const metadata = this.cache.get(collectionId);
    if (!metadata) return;

    metadata.documentCount = count;

    await this.client.setPayload(this.collectionName, {
      points: [collectionId],
      payload: { documentCount: count }
    });

    this.cache.set(collectionId, metadata);
  }

  /**
   * Delete collection
   */
  async deleteCollection(collectionId) {
    const metadata = this.cache.get(collectionId);
    if (!metadata) {
      throw new Error('Collection not found');
    }

    if (metadata.isDefault) {
      throw new Error('Cannot delete default collection');
    }

    // Delete actual Qdrant collection
    await this.client.deleteCollection(metadata.qdrantName);

    // Delete metadata
    await this.client.delete(this.collectionName, {
      points: [collectionId]
    });

    // Remove from cache
    this.cache.delete(collectionId);

    console.log(`Deleted collection: ${metadata.displayName} (${collectionId})`);
  }

  /**
   * Empty collection (delete all documents)
   */
  async emptyCollection(collectionId) {
    const metadata = this.cache.get(collectionId);
    if (!metadata) {
      throw new Error('Collection not found');
    }

    // Delete and recreate the collection
    await this.client.deleteCollection(metadata.qdrantName);
    await this.createQdrantCollection(metadata.qdrantName);

    // Update document count
    await this.updateDocumentCount(collectionId, 0);

    console.log(`Emptied collection: ${metadata.displayName} (${collectionId})`);
  }

  /**
   * Refresh document count for a collection
   */
  async refreshDocumentCount(collectionId) {
    const metadata = this.cache.get(collectionId);
    if (!metadata) return;

    try {
      const info = await this.client.getCollection(metadata.qdrantName);
      await this.updateDocumentCount(collectionId, info.points_count || 0);
    } catch (error) {
      console.error(`Error refreshing document count for ${collectionId}:`, error);
    }
  }
}

module.exports = {
  COLLECTIONS_METADATA_NAME,
  CollectionMetadataService
};
