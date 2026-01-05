const express = require('express');
const request = require('supertest');

const { createDocumentsRoutes } = require('../../../routes/documents');

describe('documents routes (unit)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('POST /api/documents/:id/generate-description persists and returns detected_language for text docs', async () => {
    const qdrantClient = {
      retrieve: jest
        .fn()
        // Initial retrieve: document without detected_language
        .mockResolvedValueOnce([
          {
            id: 123,
            payload: {
              content: 'Hola mundo. Este es un documento de prueba.',
              file_type: 'txt',
              filename: 'spanish.txt'
            }
          }
        ])
        // Second retrieve: document after setPayload
        .mockResolvedValueOnce([
          {
            id: 123,
            payload: {
              content: 'Hola mundo. Este es un documento de prueba.',
              file_type: 'txt',
              filename: 'spanish.txt',
              description: 'Resumen.',
              detected_language: 'Spanish'
            }
          }
        ]),
      setPayload: jest.fn(async () => ({}))
    };

    const collectionMiddleware = (req, _res, next) => {
      req.qdrantCollection = 'test-collection';
      req.collectionId = 'default';
      next();
    };

    const documentService = {
      descriptionService: {
        generateDescription: jest.fn(async () => ({ language: 'Spanish', description: 'Resumen.' }))
      },
      visionService: null
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/api',
      createDocumentsRoutes({
        collectionMiddleware,
        documentService,
        collectionsService: { refreshDocumentCount: jest.fn(async () => {}) },
        qdrantClient
      })
    );

    const res = await request(app)
      .post('/api/documents/123/generate-description')
      .send({})
      .expect(200);

    expect(qdrantClient.setPayload).toHaveBeenCalledTimes(1);
    expect(qdrantClient.setPayload).toHaveBeenCalledWith('test-collection', {
      points: [123],
      payload: {
        description: 'Resumen.',
        detected_language: 'Spanish'
      }
    });

    expect(res.body.success).toBe(true);
    expect(res.body.description).toBe('Resumen.');
    expect(res.body.detected_language).toBe('Spanish');
  });
});
