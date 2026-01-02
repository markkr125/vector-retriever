const { VisualizationService, InMemoryCache } = require('../../../visualization-service');

describe('InMemoryCache', () => {
  let cache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  afterEach(async () => {
    await cache.clear();
  });

  test('stores and retrieves data', async () => {
    const testData = { vectors: [[1, 2], [3, 4]] };
    await cache.set('test-key', testData, 5000);
    
    const retrieved = await cache.get('test-key');
    expect(retrieved).toEqual(testData);
  });

  test('returns null for non-existent key', async () => {
    const result = await cache.get('non-existent');
    expect(result).toBeNull();
  });

  test('expires entries after TTL', async () => {
    await cache.set('expire-test', { data: 'value' }, 100); // 100ms TTL
    
    // Should exist immediately
    let result = await cache.get('expire-test');
    expect(result).toEqual({ data: 'value' });
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should be expired
    result = await cache.get('expire-test');
    expect(result).toBeNull();
  });

  test('invalidates specific key', async () => {
    await cache.set('key1', { data: 'value1' }, 5000);
    await cache.set('key2', { data: 'value2' }, 5000);
    
    await cache.invalidate('key1');
    
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toEqual({ data: 'value2' });
  });

  test('clears all entries', async () => {
    await cache.set('key1', { data: 'value1' }, 5000);
    await cache.set('key2', { data: 'value2' }, 5000);
    
    await cache.clear();
    
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key2')).toBeNull();
  });

  test('handles multiple concurrent operations', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(cache.set(`key${i}`, { value: i }, 5000));
    }
    
    await Promise.all(promises);
    
    const result = await cache.get('key5');
    expect(result).toEqual({ value: 5 });
  });
});

describe('VisualizationService Cache Keys', () => {
  test('generates consistent cache keys', () => {
    // This would test the cache key generation logic
    // For now, just ensure the service can be instantiated
    const service = new VisualizationService(
      null, // qdrantClient (not needed for this test)
      'memory',
      3600000
    );
    
    expect(service).toBeDefined();
  });
});

describe('UMAP Dimensionality Reduction', () => {
  let service;
  let mockQdrantClient;

  beforeEach(() => {
    // Mock Qdrant client
    mockQdrantClient = {
      getCollection: jest.fn(),
      scroll: jest.fn()
    };
    service = new VisualizationService(mockQdrantClient, 'memory', 60000);
  });

  test('service initializes with correct parameters', () => {
    expect(service).toBeDefined();
    expect(service.qdrantClient).toBeDefined();
  });

  test('handles empty collection', async () => {
    mockQdrantClient.getCollection.mockResolvedValue({ points_count: 0 });

    const result = await service.generateVisualization({
      collectionName: 'test-collection'
    });

    expect(result.points).toEqual([]);
    expect(result.metadata.totalDocuments).toBe(0);
  });

  test('produces 2D coordinates from vectors', async () => {
    // Mock collection with 3 documents
    mockQdrantClient.getCollection.mockResolvedValue({ points_count: 3 });
    mockQdrantClient.scroll.mockResolvedValue({
      points: [
        {
          id: 1,
          vector: { dense: Array(10).fill(0).map(() => Math.random()) },
          payload: { category: 'test1', content: 'doc1' }
        },
        {
          id: 2,
          vector: { dense: Array(10).fill(0).map(() => Math.random()) },
          payload: { category: 'test2', content: 'doc2' }
        },
        {
          id: 3,
          vector: { dense: Array(10).fill(0).map(() => Math.random()) },
          payload: { category: 'test3', content: 'doc3' }
        }
      ]
    });

    const result = await service.generateVisualization({
      collectionName: 'test-collection',
      groupBy: 'category'
    });

    expect(result.points).toBeDefined();
    expect(result.points.length).toBe(3);
    
    // Each point should have x, y coordinates
    result.points.forEach(point => {
      expect(point).toHaveProperty('x');
      expect(point).toHaveProperty('y');
      expect(typeof point.x).toBe('number');
      expect(typeof point.y).toBe('number');
      expect(isFinite(point.x)).toBe(true);
      expect(isFinite(point.y)).toBe(true);
    });
  });

  test('handles errors gracefully', async () => {
    mockQdrantClient.getCollection.mockRejectedValue(new Error('Collection not found'));

    await expect(
      service.generateVisualization({ collectionName: 'nonexistent' })
    ).rejects.toThrow();
  });
});

describe('Visualization Color Coding', () => {
  test('service supports different grouping strategies', () => {
    const service = new VisualizationService(null, 'memory', 3600000);
    
    // Service should handle groupBy parameter
    // Actual testing would require integration tests
    expect(service).toBeDefined();
  });
});
