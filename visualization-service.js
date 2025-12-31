/**
 * Document Visualization Service
 * Generates 2D scatter plot coordinates using UMAP dimensionality reduction
 * Supports both in-memory and Redis caching strategies
 */

const { UMAP } = require('umap-js');
const { createClient } = require('redis');
const crypto = require('crypto');

/**
 * Base cache interface
 */
class CacheStrategy {
  async get(key) {
    throw new Error('Must implement get()');
  }

  async set(key, value, ttl) {
    throw new Error('Must implement set()');
  }

  async clear(key) {
    throw new Error('Must implement clear()');
  }

  async isValid(key) {
    throw new Error('Must implement isValid()');
  }
}

/**
 * In-Memory Cache Strategy (Default)
 */
class InMemoryCache extends CacheStrategy {
  constructor() {
    super();
    this.cache = new Map();
    console.log('[Cache] Using in-memory cache strategy');
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set(key, value, ttlMs = 3600000) {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
  }

  async clear(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  async isValid(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return Date.now() <= entry.expiresAt;
  }

  getStats() {
    return {
      strategy: 'in-memory',
      entries: this.cache.size,
      memoryUsage: JSON.stringify(Array.from(this.cache.values())).length
    };
  }
}

/**
 * Redis Cache Strategy
 */
class RedisCache extends CacheStrategy {
  constructor(redisUrl) {
    super();
    this.client = null;
    this.redisUrl = redisUrl || 'redis://localhost:6379';
    this.connected = false;
    console.log(`[Cache] Using Redis cache strategy: ${this.redisUrl}`);
  }

  async connect() {
    if (this.connected) return;

    try {
      this.client = createClient({ url: this.redisUrl });
      
      this.client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('[Redis] Connected successfully');
        this.connected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.error('[Redis] Failed to connect:', error.message);
      throw error;
    }
  }

  async get(key) {
    if (!this.connected) await this.connect();
    
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Redis] Get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlMs = 3600000) {
    if (!this.connected) await this.connect();
    
    try {
      const ttlSeconds = Math.floor(ttlMs / 1000);
      await this.client.set(key, JSON.stringify(value), {
        EX: ttlSeconds
      });
    } catch (error) {
      console.error('[Redis] Set error:', error.message);
    }
  }

  async clear(key) {
    if (!this.connected) await this.connect();
    
    try {
      if (key) {
        await this.client.del(key);
      } else {
        // Clear all visualization keys
        const keys = await this.client.keys('viz:*');
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      }
    } catch (error) {
      console.error('[Redis] Clear error:', error.message);
    }
  }

  async isValid(key) {
    if (!this.connected) await this.connect();
    
    try {
      const ttl = await this.client.ttl(key);
      return ttl > 0;
    } catch (error) {
      console.error('[Redis] isValid error:', error.message);
      return false;
    }
  }

  async getStats() {
    if (!this.connected) await this.connect();
    
    try {
      const keys = await this.client.keys('viz:*');
      return {
        strategy: 'redis',
        entries: keys.length,
        connected: this.connected
      };
    } catch (error) {
      return {
        strategy: 'redis',
        entries: 0,
        connected: false,
        error: error.message
      };
    }
  }

  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

/**
 * Visualization Service
 */
class VisualizationService {
  constructor(qdrantClient, collectionName, cacheStrategy = 'memory') {
    this.qdrantClient = qdrantClient;
    this.collectionName = collectionName;
    
    // Initialize cache strategy based on config
    if (cacheStrategy === 'redis') {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.cache = new RedisCache(redisUrl);
    } else {
      this.cache = new InMemoryCache();
    }
    
    this.cacheKey = 'viz:scatter:main';
    this.cacheTTL = parseInt(process.env.VIZ_CACHE_TTL || '3600000'); // 1 hour default
    
    console.log(`[VisualizationService] Initialized with ${cacheStrategy} cache, TTL: ${this.cacheTTL}ms`);
  }

  /**
   * Get scatter plot data (with caching)
   */
  async getScatterData(options = {}) {
    const startTime = Date.now();
    
    // Check cache
    if (!options.forceRefresh) {
      const cached = await this.cache.get(this.cacheKey);
      if (cached) {
        const age = Date.now() - cached.metadata.generatedAt;
        console.log(`[Viz] Cache hit (age: ${Math.round(age / 1000)}s)`);
        return {
          ...cached,
          fromCache: true,
          cacheAge: age
        };
      }
    }

    console.log('[Viz] Cache miss, generating visualization...');
    
    // Generate new visualization
    const data = await this.generateVisualization(options);
    
    // Cache result
    await this.cache.set(this.cacheKey, data, this.cacheTTL);
    
    const duration = Date.now() - startTime;
    console.log(`[Viz] Generation complete in ${duration}ms`);
    
    return {
      ...data,
      fromCache: false,
      generationTime: duration
    };
  }

  /**
   * Generate visualization from scratch
   */
  async generateVisualization(options = {}) {
    const limit = options.limit || 5000; // Max points to visualize
    
    try {
      // 1. Get collection info
      const collectionInfo = await this.qdrantClient.getCollection(this.collectionName);
      const totalPoints = collectionInfo.points_count;
      
      console.log(`[Viz] Collection has ${totalPoints} points`);
      
      if (totalPoints === 0) {
        return {
          points: [],
          metadata: {
            totalDocuments: 0,
            visualizedDocuments: 0,
            generatedAt: Date.now(),
            method: 'umap'
          }
        };
      }

      // 2. Fetch vectors (scroll through collection)
      console.log(`[Viz] Fetching vectors (limit: ${limit})...`);
      const fetchLimit = Math.min(totalPoints, limit);
      
      const scrollResult = await this.qdrantClient.scroll(this.collectionName, {
        limit: fetchLimit,
        with_payload: true,
        with_vector: true
      });

      const points = scrollResult.points;
      console.log(`[Viz] Fetched ${points.length} points`);

      if (points.length === 0) {
        return {
          points: [],
          metadata: {
            totalDocuments: totalPoints,
            visualizedDocuments: 0,
            generatedAt: Date.now(),
            method: 'umap'
          }
        };
      }

      // 3. Extract vectors and prepare for UMAP
      const vectors = points.map(p => {
        // Handle both named vectors and direct vectors
        if (p.vector && p.vector.dense) {
          return p.vector.dense;
        } else if (p.vector && Array.isArray(p.vector)) {
          return p.vector;
        } else if (p.vector) {
          // If it's an object with multiple named vectors, use 'dense' or first available
          const vectorNames = Object.keys(p.vector);
          if (vectorNames.includes('dense')) {
            return p.vector.dense;
          } else if (vectorNames.length > 0) {
            return p.vector[vectorNames[0]];
          }
        }
        throw new Error(`Invalid vector format for point ${p.id}`);
      });

      console.log(`[Viz] Vector dimensions: ${vectors[0].length}D`);

      // 4. Apply UMAP dimensionality reduction (768D -> 2D)
      console.log('[Viz] Running UMAP reduction...');
      const umapStart = Date.now();
      
      const umap = new UMAP({
        nComponents: 2,
        nNeighbors: Math.min(15, Math.floor(points.length / 2)),
        minDist: 0.1,
        spread: 1.0
      });

      const embedding = await umap.fitAsync(vectors);
      
      const umapDuration = Date.now() - umapStart;
      console.log(`[Viz] UMAP complete in ${umapDuration}ms`);

      // 5. Format response
      const formattedPoints = points.map((point, idx) => {
        const [x, y] = embedding[idx];
        
        return {
          id: point.id,
          x: x,
          y: y,
          title: point.payload?.title || point.payload?.filename || `Document ${point.id}`,
          category: point.payload?.category || 'Unknown',
          location: point.payload?.location || null,
          tags: point.payload?.tags || [],
          piiRisk: point.payload?.pii_risk_level || 'none',
          date: point.payload?.upload_date || null,
          // Include minimal payload for preview
          snippet: point.payload?.content?.substring(0, 150) || ''
        };
      });

      return {
        points: formattedPoints,
        metadata: {
          totalDocuments: totalPoints,
          visualizedDocuments: points.length,
          generatedAt: Date.now(),
          method: 'umap',
          parameters: {
            nNeighbors: Math.min(15, Math.floor(points.length / 2)),
            minDist: 0.1
          },
          processingTime: {
            umap: umapDuration
          }
        }
      };

    } catch (error) {
      console.error('[Viz] Generation error:', error);
      throw error;
    }
  }

  /**
   * Get visualization for specific search results
   */
  async getSearchResultsVisualization(searchParams) {
    const startTime = Date.now();
    
    // Generate cache key from search params
    const cacheKey = `viz:search:${this.hashSearchParams(searchParams)}`;
    
    // Check cache
    if (!searchParams.forceRefresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        const age = Date.now() - cached.metadata.generatedAt;
        console.log(`[Viz] Search results cache hit (age: ${Math.round(age / 1000)}s)`);
        return {
          ...cached,
          fromCache: true,
          cacheAge: age
        };
      }
    }

    console.log('[Viz] Generating search results visualization...');

    try {
      const { query, searchType, denseWeight, filters, limit = 5000 } = searchParams;

      // 1. Execute search to get matching documents
      console.log(`[Viz] Executing search: "${query}" (${searchType})`);
      const searchStartTime = Date.now();
      
      // Build search request based on type
      let searchResults = [];
      
      if (searchType === 'semantic' || searchType === 'hybrid') {
        // Need to get embedding for query
        const embedding = searchParams.queryEmbedding; // Should be passed from caller
        
        if (!embedding) {
          throw new Error('Query embedding required for semantic/hybrid search');
        }

        // Perform vector search with filters
        searchResults = await this.qdrantClient.search(this.collectionName, {
          vector: { name: 'dense', vector: embedding },
          filter: filters,
          limit: limit,
          with_payload: true,
          with_vector: true
        });
      } else if (searchType === 'keyword') {
        // For keyword search, we'd need sparse vector search
        // For now, fall back to scroll with filters
        const scrollResult = await this.qdrantClient.scroll(this.collectionName, {
          filter: filters,
          limit: limit,
          with_payload: true,
          with_vector: true
        });
        searchResults = scrollResult.points;
      } else {
        // Default: just get filtered documents
        const scrollResult = await this.qdrantClient.scroll(this.collectionName, {
          filter: filters,
          limit: limit,
          with_payload: true,
          with_vector: true
        });
        searchResults = scrollResult.points;
      }

      const searchDuration = Date.now() - searchStartTime;
      console.log(`[Viz] Search complete: ${searchResults.length} results in ${searchDuration}ms`);

      if (searchResults.length === 0) {
        return {
          points: [],
          metadata: {
            totalMatches: 0,
            visualizedCount: 0,
            generatedAt: Date.now(),
            method: 'none',
            searchQuery: query,
            processingTime: {
              search: searchDuration,
              umap: 0
            }
          },
          fromCache: false,
          generationTime: Date.now() - startTime
        };
      }

      // 2. Extract vectors for UMAP
      const vectors = searchResults.map(p => {
        if (p.vector && p.vector.dense) {
          return p.vector.dense;
        } else if (p.vector && Array.isArray(p.vector)) {
          return p.vector;
        } else if (p.vector) {
          const vectorNames = Object.keys(p.vector);
          if (vectorNames.includes('dense')) {
            return p.vector.dense;
          } else if (vectorNames.length > 0) {
            return p.vector[vectorNames[0]];
          }
        }
        throw new Error(`Invalid vector format for point ${p.id}`);
      });

      console.log(`[Viz] Running UMAP on ${vectors.length} vectors...`);
      const umapStart = Date.now();

      // 3. Run UMAP dimensionality reduction
      const umap = new UMAP({
        nComponents: 2,
        nNeighbors: Math.min(15, Math.floor(vectors.length / 2)),
        minDist: 0.1,
        spread: 1.0
      });

      const embedding = await umap.fitAsync(vectors);
      const umapDuration = Date.now() - umapStart;
      console.log(`[Viz] UMAP complete in ${umapDuration}ms`);

      // 4. Format response
      const formattedPoints = searchResults.map((point, idx) => {
        const [x, y] = embedding[idx];
        
        return {
          id: point.id,
          x: x,
          y: y,
          title: point.payload?.title || point.payload?.filename || `Document ${point.id}`,
          category: point.payload?.category || 'Unknown',
          location: point.payload?.location || null,
          tags: point.payload?.tags || [],
          piiRisk: point.payload?.pii_risk_level || 'none',
          date: point.payload?.upload_date || null,
          snippet: point.payload?.content?.substring(0, 150) || '',
          score: point.score || null
        };
      });

      const visualizationData = {
        points: formattedPoints,
        metadata: {
          totalMatches: searchResults.length,
          visualizedCount: formattedPoints.length,
          generatedAt: Date.now(),
          method: 'umap',
          searchQuery: query,
          searchType: searchType,
          parameters: {
            nNeighbors: Math.min(15, Math.floor(vectors.length / 2)),
            minDist: 0.1
          },
          processingTime: {
            search: searchDuration,
            umap: umapDuration
          }
        }
      };

      // 5. Cache with shorter TTL (10 minutes)
      await this.cache.set(cacheKey, visualizationData, 600000);

      const totalDuration = Date.now() - startTime;
      console.log(`[Viz] Search results visualization complete in ${totalDuration}ms`);

      return {
        ...visualizationData,
        fromCache: false,
        generationTime: totalDuration
      };

    } catch (error) {
      console.error('[Viz] Search results visualization error:', error);
      throw error;
    }
  }

  /**
   * Hash search parameters for cache key
   */
  hashSearchParams(params) {
    const { query, searchType, denseWeight, filters, limit } = params;
    
    // Normalize filters by sorting keys
    const normalizedFilters = filters ? this.normalizeFilters(filters) : null;
    
    const normalized = JSON.stringify({
      q: query?.toLowerCase().trim() || '',
      type: searchType || 'semantic',
      weight: denseWeight || 0.7,
      filters: normalizedFilters,
      limit: limit || 5000
    });
    
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * Normalize filters for consistent hashing
   */
  normalizeFilters(filters) {
    if (!filters) return null;
    
    // Sort filter keys and values for consistent hashing
    const normalized = {};
    
    if (filters.must) {
      normalized.must = filters.must.map(f => {
        const sorted = {};
        Object.keys(f).sort().forEach(key => {
          sorted[key] = f[key];
        });
        return sorted;
      }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    
    if (filters.should) {
      normalized.should = filters.should.map(f => {
        const sorted = {};
        Object.keys(f).sort().forEach(key => {
          sorted[key] = f[key];
        });
        return sorted;
      }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    
    return normalized;
  }

  /**
   * Clear cache
   */
  async clearCache() {
    await this.cache.clear(this.cacheKey);
    console.log('[Viz] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cache.getStats();
  }

  /**
   * Disconnect (for Redis cleanup)
   */
  async disconnect() {
    if (this.cache instanceof RedisCache) {
      await this.cache.disconnect();
    }
  }
}

module.exports = {
  VisualizationService,
  InMemoryCache,
  RedisCache
};
