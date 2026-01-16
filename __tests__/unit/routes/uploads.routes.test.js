const express = require('express');
const request = require('supertest');
const multer = require('multer');

const { createUploadsRoutes } = require('../../../routes/uploads');
const { uploadJobs } = require('../../../state/upload-jobs');

function createApp({ documentService, collectionsService, collectionMiddleware } = {}) {
  const app = express();
  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  const createJob = (totalFiles) => {
    // Use the real createJob from state so the routes and tests observe the same map.
    const { createJob: realCreateJob } = require('../../../state/upload-jobs');
    return realCreateJob(totalFiles);
  };

  app.use(
    '/api',
    createUploadsRoutes({
      upload,
      collectionMiddleware:
        collectionMiddleware ||
        ((req, _res, next) => {
          req.qdrantCollection = 'test-collection';
          req.collectionId = 'default';
          next();
        }),
      uploadJobs,
      createJob,
      documentService:
        documentService ||
        {
          processSingleFile: jest.fn(async (_file, _collection, _autoCategorize, options) => {
            options?.onStage?.('Embedding…');
            return { id: 1 };
          })
        },
      collectionsService:
        collectionsService || {
          refreshDocumentCount: jest.fn(async () => {})
        }
    })
  );

  return app;
}

async function waitFor(predicate, { timeoutMs = 1500 } = {}) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise(setImmediate);
  }
}

describe('uploads routes (unit)', () => {
  beforeEach(() => {
    uploadJobs.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    uploadJobs.clear();
  });

  test('POST /api/documents/upload creates a job and processes files asynchronously (no external calls)', async () => {
    const processSingleFile = jest.fn(async (_file, _collection, _autoCategorize, options) => {
      options?.onStage?.('Embedding…');
      return { id: 123 };
    });

    const app = createApp({
      documentService: { processSingleFile },
      collectionsService: { refreshDocumentCount: jest.fn(async () => {}) }
    });

    const res = await request(app)
      .post('/api/documents/upload')
      .field('auto_categorize', 'false')
      .attach('files', Buffer.from('hello'), 'test.txt')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.jobId).toBe('string');
    expect(res.body.totalFiles).toBe(1);

    const job = uploadJobs.get(res.body.jobId);
    expect(job).toBeTruthy();
    expect(job.totalFiles).toBe(1);

    await waitFor(() => uploadJobs.get(res.body.jobId)?.status === 'completed');

    const finalJob = uploadJobs.get(res.body.jobId);
    expect(finalJob.status).toBe('completed');
    expect(finalJob.successfulFiles).toBe(1);
    expect(finalJob.failedFiles).toBe(0);
    expect(finalJob.processedFiles).toBe(1);

    expect(processSingleFile).toHaveBeenCalledTimes(1);
    expect(finalJob.currentStage).toBe(null);
  });

  test('GET /api/upload-jobs/:jobId supports filesLimit=0 (light polling)', async () => {
    const app = createApp();

    // Create a job with lots of files
    const { createJob } = require('../../../state/upload-jobs');
    const job = createJob(5000);
    job.files = Array.from({ length: 5000 }, (_, i) => ({ name: `f${i}.txt`, status: 'pending' }));
    job.processedFiles = 1000;

    const res = await request(app)
      .get(`/api/upload-jobs/${job.id}?filesLimit=0`)
      .expect(200);

    expect(res.body.id).toBe(job.id);
    expect(res.body.filesTotal).toBe(5000);
    expect(res.body.filesLimit).toBe(0);
    expect(res.body.files).toEqual([]);
  });

  test('GET /api/upload-jobs/:jobId returns a small window by default (prevents huge payloads)', async () => {
    const app = createApp();

    const { createJob } = require('../../../state/upload-jobs');
    const job = createJob(5000);
    job.files = Array.from({ length: 5000 }, (_, i) => ({ name: `f${i}.txt`, status: 'pending' }));
    job.processedFiles = 1000;

    const res = await request(app)
      .get(`/api/upload-jobs/${job.id}`)
      .expect(200);

    expect(res.body.filesTotal).toBe(5000);
    expect(res.body.files.length).toBeLessThanOrEqual(1000);
    expect(res.body.files.length).toBe(200); // default window size
    expect(res.body.filesOffset).toBe(950); // processedFiles - 50
  });

  test('GET /api/upload-jobs/:jobId/files returns a slice with offset/limit', async () => {
    const app = createApp();

    const { createJob } = require('../../../state/upload-jobs');
    const job = createJob(100);
    job.files = Array.from({ length: 100 }, (_, i) => ({ name: `f${i}.txt`, status: 'pending' }));

    const res = await request(app)
      .get(`/api/upload-jobs/${job.id}/files?offset=10&limit=5`)
      .expect(200);

    expect(res.body.id).toBe(job.id);
    expect(res.body.filesTotal).toBe(100);
    expect(res.body.offset).toBe(10);
    expect(res.body.limit).toBe(5);
    expect(res.body.files).toHaveLength(5);
    expect(res.body.files[0].name).toBe('f10.txt');
  });
});
