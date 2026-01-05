const express = require('express');
const request = require('supertest');

jest.mock('../../../utils/text-utils', () => ({
  getSparseVector: jest.fn(() => ({ indices: [1, 2], values: [1, 1] }))
}));

jest.mock('../../../services/qdrant-utils', () => ({
  countFilteredDocuments: jest.fn(async () => 226)
}));

const { createSearchRoutes } = require('../../../routes/search');

function makeApp({ qdrantClient, embeddingService }) {
  const app = express();
  app.use(express.json());

  // Multer-like stub used by routes/search.js for upload endpoints.
  // Our unit tests focus on hybrid search, but the router registers upload routes too.
  const upload = {
    single: () => (_req, _res, next) => next(),
    array: () => (_req, _res, next) => next()
  };

  const collectionMiddleware = (req, _res, next) => {
    req.qdrantCollection = 'test-collection';
    next();
  };

  const router = createSearchRoutes({
    qdrantClient,
    collectionMiddleware,
    upload,
    embeddingService,
    documentService: null,
    getTempFile: null,
    pdfParse: null,
    pdf2md: null,
    mammoth: null,
    pdfToMarkdownViaHtml: null,
    processPdfText: null
  });

  app.use('/api', router);
  return app;
}

describe('Search routes (unit)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/search/hybrid', () => {
    test('uses weighted formula + dynamic prefetch limit, and caps score at 1.0', async () => {
      const qdrantClient = {
        query: jest.fn(async () => ({
          points: [
            { id: 1, score: 1.742, payload: { filename: 'Amazon.pdf' } },
            { id: 2, score: 0.588, payload: { filename: 'Other.pdf' } }
          ]
        }))
      };

      const embeddingService = {
        getDenseEmbedding: jest.fn(async () => [0.01, 0.02, 0.03])
      };

      const app = makeApp({ qdrantClient, embeddingService });

      const response = await request(app)
        .post('/api/search/hybrid')
        .send({
          query: 'Amazon',
          denseWeight: 0.7,
          limit: 10,
          offset: 100
        })
        .expect(200);

      // Verify request made to Qdrant Query API
      expect(qdrantClient.query).toHaveBeenCalledTimes(1);

      const [collectionName, queryParams] = qdrantClient.query.mock.calls[0];
      expect(collectionName).toBe('test-collection');

      // Dynamic prefetch limit supports deep pagination
      // prefetchLimit = max(100, offset + limit*2) = max(100, 100 + 20) = 120
      expect(queryParams.prefetch).toHaveLength(2);
      expect(queryParams.prefetch[0].limit).toBe(120);
      expect(queryParams.prefetch[1].limit).toBe(120);

      // Weighted formula must reference both prefetch scores
      expect(queryParams.query).toHaveProperty('formula');
      const sum = queryParams.query.formula.sum;
      const denseTerm = sum.find(x => x && x.mult && x.mult[1] === '$score[0]');
      const sparseTerm = sum.find(x => x && x.mult && x.mult[1] === '$score[1]');
      expect(denseTerm).toBeTruthy();
      expect(sparseTerm).toBeTruthy();
      expect(denseTerm.mult[0]).toBeCloseTo(0.7, 8);
      expect(sparseTerm.mult[0]).toBeCloseTo(0.3, 8);

      // API response: scores capped at 1.0
      expect(response.body.results[0].score).toBe(1.0);
      expect(response.body.results[1].score).toBeCloseTo(0.588, 6);
    });

    test('returns 400 if query is missing', async () => {
      const qdrantClient = { query: jest.fn() };
      const embeddingService = { getDenseEmbedding: jest.fn() };
      const app = makeApp({ qdrantClient, embeddingService });

      await request(app)
        .post('/api/search/hybrid')
        .send({})
        .expect(400);

      expect(qdrantClient.query).not.toHaveBeenCalled();
    });
  });
});
