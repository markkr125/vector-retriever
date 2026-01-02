const request = require('supertest');
const { setupTestCollection, insertTestDocuments, teardownTestCollection } = require('../../fixtures/test-helpers');

// These tests require Qdrant to be running
// Set RUN_INTEGRATION_TESTS=true to enable
const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = shouldRun ? describe : describe.skip;

// Note: This requires server.js to export the Express app
// For now, these are skeleton tests that show the structure
describeIntegration('Search API Integration Tests', () => {
  const testCollectionName = 'test_search_collection';
  let app;

  beforeAll(async () => {
    // In a real implementation, would import app from server.js
    // app = require('../../../server');
    
    await setupTestCollection(testCollectionName);
    
    // Insert test documents
    await insertTestDocuments(testCollectionName, [
      {
        id: 1,
        payload: {
          category: 'hotel',
          location: 'Paris',
          content: 'Luxury hotel with spa and rooftop pool',
          price: 450,
          rating: 4.8,
          filename: 'hotel_luxury_paris.txt'
        }
      },
      {
        id: 2,
        payload: {
          category: 'hotel',
          location: 'London',
          content: 'Budget hotel in central London',
          price: 120,
          rating: 4.0,
          filename: 'hotel_budget_london.txt'
        }
      },
      {
        id: 3,
        payload: {
          category: 'restaurant',
          location: 'Paris',
          content: 'Italian restaurant with authentic cuisine',
          price: 50,
          rating: 4.5,
          filename: 'restaurant_italian_paris.txt'
        }
      }
    ]);
  });

  afterAll(async () => {
    await teardownTestCollection(testCollectionName);
  });

  describe('POST /api/search/hybrid', () => {
    test.skip('returns hybrid search results', async () => {
      const response = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({
          query: 'luxury hotel',
          denseWeight: 0.7,
          limit: 10
        })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body.results.length).toBeGreaterThan(0);
      expect(response.body.results[0]).toHaveProperty('score');
      expect(response.body.results[0]).toHaveProperty('payload');
    });

    test.skip('filters by category', async () => {
      const response = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({
          query: 'luxury',
          filters: [
            { type: 'category', value: 'hotel' }
          ]
        })
        .expect(200);

      response.body.results.forEach(result => {
        expect(result.payload.category).toBe('hotel');
      });
    });

    test.skip('filters by price range', async () => {
      const response = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({
          query: 'hotel',
          filters: [
            { type: 'price', operator: 'gte', value: 100 },
            { type: 'price', operator: 'lte', value: 500 }
          ]
        })
        .expect(200);

      response.body.results.forEach(result => {
        expect(result.payload.price).toBeGreaterThanOrEqual(100);
        expect(result.payload.price).toBeLessThanOrEqual(500);
      });
    });

    test.skip('respects limit parameter', async () => {
      const response = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({
          query: 'hotel',
          limit: 1
        })
        .expect(200);

      expect(response.body.results.length).toBeLessThanOrEqual(1);
    });

    test.skip('adjusts dense weight for semantic vs keyword balance', async () => {
      // Pure semantic (denseWeight = 1.0)
      const semantic = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({
          query: 'luxury hotel',
          denseWeight: 1.0
        });

      // Pure keyword (denseWeight = 0.0)
      const keyword = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({
          query: 'luxury hotel',
          denseWeight: 0.0
        });

      // Results may differ based on weighting
      expect(semantic.body.results).toBeDefined();
      expect(keyword.body.results).toBeDefined();
    });
  });

  describe('POST /api/search/semantic', () => {
    test.skip('returns semantic search results', async () => {
      const response = await request(app)
        .post('/api/search/semantic')
        .query({ collection: testCollectionName })
        .send({
          query: 'luxurious accommodation',
          limit: 10
        })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      expect(response.body.results.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/search/location', () => {
    test.skip('filters by location', async () => {
      const response = await request(app)
        .post('/api/search/location')
        .query({ collection: testCollectionName })
        .send({
          location: 'Paris',
          query: 'hotel'
        })
        .expect(200);

      response.body.results.forEach(result => {
        expect(result.payload.location).toBe('Paris');
      });
    });
  });

  describe('POST /api/search/geo', () => {
    test.skip('finds documents within radius', async () => {
      // Would require documents with coordinates
      const response = await request(app)
        .post('/api/search/geo')
        .query({ collection: testCollectionName })
        .send({
          lat: 48.8566,
          lon: 2.3522,
          radius: 50000, // 50km
          query: 'hotel'
        })
        .expect(200);

      expect(response.body).toHaveProperty('results');
    });
  });

  describe('Error Handling', () => {
    test.skip('returns 400 for missing query', async () => {
      await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({})
        .expect(400);
    });

    test.skip('returns 404 for non-existent collection', async () => {
      await request(app)
        .post('/api/search/hybrid')
        .query({ collection: 'non_existent_collection' })
        .send({ query: 'test' })
        .expect(404);
    });
  });
});

// Placeholder for structure - actual tests would need server.js refactoring
describe('Search API Tests (Unit)', () => {
  test('test structure is set up correctly', () => {
    expect(setupTestCollection).toBeDefined();
    expect(insertTestDocuments).toBeDefined();
    expect(teardownTestCollection).toBeDefined();
  });
});
