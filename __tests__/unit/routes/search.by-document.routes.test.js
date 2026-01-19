const express = require('express');
const request = require('supertest');
const multer = require('multer');

const { createSearchRoutes } = require('../../../routes/search');

describe('search by-document route (unit)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeApp({ documentService }) {
    const app = express();
    app.use(express.json());

    const upload = multer({ storage: multer.memoryStorage() });

    const collectionMiddleware = (req, _res, next) => {
      req.qdrantCollection = 'test-collection';
      next();
    };

    const embeddingService = {
      getDenseEmbedding: jest.fn(async () => [0.1, 0.2, 0.3])
    };

    const qdrantClient = {
      search: jest.fn(async () => [
        { id: 1, score: 0.9, payload: { filename: 'a.txt' } },
        { id: 2, score: 0.8, payload: { filename: 'b.txt' } }
      ])
    };

    const router = createSearchRoutes({
      qdrantClient,
      collectionMiddleware,
      upload,
      embeddingService,
      documentService,
      getTempFile: () => null,
      pdfParse: null,
      pdf2md: null,
      mammoth: null,
      pdfToMarkdownViaHtml: null,
      processPdfText: null
    });

    app.use('/api', router);

    return { app, embeddingService, qdrantClient };
  }

  test('accepts image upload and uses vision processing when enabled', async () => {
    const documentService = {
      visionService: {
        processImage: jest.fn(async () => ({
          language: 'English',
          description: 'Mock image description',
          markdownContent: 'Mock extracted image content'
        }))
      }
    };

    const { app, embeddingService, qdrantClient } = makeApp({ documentService });

    const res = await request(app)
      .post('/api/search/by-document')
      .field('limit', '10')
      .attach('file', Buffer.from('png-bytes'), {
        filename: 'test.png',
        contentType: 'image/png'
      })
      .expect(200);

    expect(documentService.visionService.processImage).toHaveBeenCalledTimes(1);
    expect(embeddingService.getDenseEmbedding).toHaveBeenCalledWith('Mock extracted image content');
    expect(qdrantClient.search).toHaveBeenCalledTimes(1);

    expect(res.body.searchType).toBe('by-document');
    expect(res.body.sourceFile).toBe('test.png');
    expect(res.body.results).toHaveLength(2);
  });

  test('returns 400 for image upload when vision is disabled', async () => {
    const documentService = {
      visionService: null
    };

    const { app } = makeApp({ documentService });

    const res = await request(app)
      .post('/api/search/by-document')
      .attach('file', Buffer.from('png-bytes'), {
        filename: 'test.png',
        contentType: 'image/png'
      })
      .expect(400);

    expect(res.body.message).toMatch(/VISION_MODEL_ENABLED=true/i);
  });

  test('uses documentService.extractContentForSearchByDocument for non-image uploads (e.g. CSV)', async () => {
    const documentService = {
      visionService: null,
      extractContentForSearchByDocument: jest.fn(async () => ({
        content: 'Name,Age\nAlice,30',
        fileExt: 'csv'
      }))
    };

    const { app, embeddingService, qdrantClient } = makeApp({ documentService });

    const res = await request(app)
      .post('/api/search/by-document')
      .field('limit', '10')
      .attach('file', Buffer.from('Name,Age\nAlice,30'), {
        filename: 'test.csv',
        contentType: 'text/csv'
      })
      .expect(200);

    expect(documentService.extractContentForSearchByDocument).toHaveBeenCalledWith({
      fileBuffer: expect.any(Buffer),
      filename: 'test.csv'
    });
    expect(embeddingService.getDenseEmbedding).toHaveBeenCalledWith('Name,Age\nAlice,30');
    expect(qdrantClient.search).toHaveBeenCalledTimes(1);

    expect(res.body.searchType).toBe('by-document');
    expect(res.body.sourceFile).toBe('test.csv');
    expect(res.body.results).toHaveLength(2);
  });
});
