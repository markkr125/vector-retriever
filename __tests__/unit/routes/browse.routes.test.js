const express = require('express');
const request = require('supertest');

const { createBrowseRoutes } = require('../../../routes/browse');

function createApp({ qdrantClient, browseCache, cacheTtlMs }) {
  const app = express();

  const collectionMiddleware = (req, _res, next) => {
    req.collectionId = 'test-collection-id';
    req.qdrantCollection = 'col_test_collection';
    next();
  };

  app.use(
    '/api',
    createBrowseRoutes({
      qdrantClient,
      collectionMiddleware,
      browseCache,
      cacheTtlMs
    })
  );

  return app;
}

describe('Browse Routes (unit)', () => {
  test('filters by filename (case-insensitive) before sorting', async () => {
    const points = [
      { id: 1, payload: { filename: 'Hotel_Paris.txt' } },
      { id: 2, payload: { filename: 'restaurant_london.txt' } },
      { id: 3, payload: { title: 'HOTEL_fallback_title.md' } }
    ];

    const qdrantClient = {
      scroll: jest.fn().mockResolvedValue({ points, next_page_offset: null }),
      retrieve: jest.fn().mockImplementation(async (_collection, { ids }) => {
        const byId = new Map(points.map(p => [String(p.id), p]));
        return ids.map(id => byId.get(String(id))).filter(Boolean);
      })
    };

    const browseCache = new Map();
    const app = createApp({ qdrantClient, browseCache, cacheTtlMs: 60_000 });

    const res = await request(app)
      .get('/api/browse')
      .query({ filename: 'hotel', limit: 50, page: 1 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.searchType).toBe('browse');
    expect(res.body.total).toBe(2);
    expect(res.body.results).toHaveLength(2);

    const filenames = res.body.results.map(r => r.payload.filename || r.payload.title);
    expect(filenames.join(' ')).toMatch(/hotel/i);

    expect(qdrantClient.scroll).toHaveBeenCalledTimes(1);
    expect(qdrantClient.retrieve).toHaveBeenCalledTimes(1);
  });

  test('reuses cached session when filename+sort match', async () => {
    const points = [
      { id: 10, payload: { filename: 'a.txt' } },
      { id: 11, payload: { filename: 'b.txt' } }
    ];

    const qdrantClient = {
      scroll: jest.fn().mockResolvedValue({ points, next_page_offset: null }),
      retrieve: jest.fn().mockImplementation(async (_collection, { ids }) => {
        const byId = new Map(points.map(p => [String(p.id), p]));
        return ids.map(id => byId.get(String(id))).filter(Boolean);
      })
    };

    const browseCache = new Map();
    const app = createApp({ qdrantClient, browseCache, cacheTtlMs: 60_000 });

    const first = await request(app)
      .get('/api/browse')
      .query({ filename: 'a', sortBy: 'id', sortOrder: 'asc', limit: 20, page: 1 })
      .expect(200);

    const sessionId = first.body.sessionId;
    expect(typeof sessionId).toBe('string');
    expect(sessionId).toContain('browse-');

    const second = await request(app)
      .get('/api/browse')
      .query({ filename: 'a', sortBy: 'id', sortOrder: 'asc', limit: 20, page: 1, sessionId })
      .expect(200);

    expect(second.body.sessionId).toBe(sessionId);

    // First request builds cache: 1 scroll. Second should reuse cache: still 1 scroll total.
    expect(qdrantClient.scroll).toHaveBeenCalledTimes(1);
    expect(qdrantClient.retrieve).toHaveBeenCalledTimes(2);
  });

  test('invalidates cached session when filename changes', async () => {
    const points = [
      { id: 100, payload: { filename: 'hotel.txt' } },
      { id: 200, payload: { filename: 'restaurant.txt' } }
    ];

    const qdrantClient = {
      scroll: jest.fn().mockResolvedValue({ points, next_page_offset: null }),
      retrieve: jest.fn().mockImplementation(async (_collection, { ids }) => {
        const byId = new Map(points.map(p => [String(p.id), p]));
        return ids.map(id => byId.get(String(id))).filter(Boolean);
      })
    };

    const browseCache = new Map();
    const app = createApp({ qdrantClient, browseCache, cacheTtlMs: 60_000 });

    const first = await request(app)
      .get('/api/browse')
      .query({ filename: 'hotel', sortBy: 'id', sortOrder: 'asc', limit: 20, page: 1 })
      .expect(200);

    const sessionId = first.body.sessionId;

    await request(app)
      .get('/api/browse')
      .query({ filename: 'restaurant', sortBy: 'id', sortOrder: 'asc', limit: 20, page: 1, sessionId })
      .expect(200);

    // Second request should trigger a fresh scroll because cacheKey changed
    expect(qdrantClient.scroll).toHaveBeenCalledTimes(2);
  });
});
