const express = require('express');
const request = require('supertest');
const { Readable } = require('stream');

const cloudImportService = require('../../../services/cloud-import-service');
const { analysisJobs } = require('../../../state/analysis-jobs');
const { uploadJobs } = require('../../../state/upload-jobs');

const { createCloudImportRoutes } = require('../../../routes/cloud-import');

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

function createApp({ documentService } = {}) {
  const app = express();
  app.use(express.json());

  const collectionMiddleware = (req, _res, next) => {
    req.collectionId = 'default';
    req.qdrantCollection = 'test-collection';
    next();
  };

  app.use(
    '/api/cloud-import',
    createCloudImportRoutes({
      collectionMiddleware,
      documentService:
        documentService || {
          processSingleFile: jest.fn(async (_file, _collection, _autoCategorize, options) => {
            options?.onStage?.('Embedding…');
            return { id: 123 };
          })
        },
      embeddingService: {},
      categorizationService: {},
      PIIDetectorFactory: {},
      uploadJobs
    })
  );

  return app;
}

describe('cloud-import routes (unit)', () => {
  beforeEach(() => {
    analysisJobs.clear();
    uploadJobs.clear();

    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    jest.spyOn(cloudImportService, 'isGoogleDriveEnabled').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    analysisJobs.clear();
    uploadJobs.clear();
  });

  test('POST /api/cloud-import/analyze starts an analysis job and completes via mocked S3 analysis', async () => {
    const mockFiles = [
      {
        key: 'folder/a.pdf',
        name: 'a.pdf',
        size: 10,
        lastModified: '2024-01-01T00:00:00Z',
        extension: '.pdf'
      },
      {
        key: 'folder/b.txt',
        name: 'b.txt',
        size: 5,
        lastModified: '2024-01-02T00:00:00Z',
        extension: '.txt'
      }
    ];

    jest
      .spyOn(cloudImportService, 'analyzeS3Folder')
      .mockImplementation(async (_url, options) => {
        options?.onProgress?.({ filesDiscovered: 2, pagesProcessed: 1, totalSize: 15 });
        // Ensure abortSignal is wired
        expect(options?.abortSignal).toBeTruthy();
        return {
          files: mockFiles,
          totalSize: 15,
          fileTypes: { '.pdf': 1, '.txt': 1 }
        };
      });

    const app = createApp();

    const start = await request(app)
      .post('/api/cloud-import/analyze')
      .send({ provider: 's3', url: 'https://bucket.s3.amazonaws.com/folder/' })
      .expect(200);

    expect(start.body.status).toBe('analyzing');
    expect(typeof start.body.jobId).toBe('string');

    await waitFor(() => analysisJobs.get(start.body.jobId)?.status === 'completed');

    const status = await request(app)
      .get(`/api/cloud-import/analysis-jobs/${start.body.jobId}`)
      .expect(200);

    expect(status.body.status).toBe('completed');
    expect(status.body.filesDiscovered).toBe(2);
    expect(status.body.totalSize).toBe(15);
    expect(status.body.fileTypes['.pdf']).toBe(1);
    expect(status.body.files).toHaveLength(2);
    expect(status.body.files[0]).toHaveProperty('extension');
  });

  test('POST /api/cloud-import/analysis-jobs/:jobId/cancel cancels analysis without turning into error', async () => {
    jest
      .spyOn(cloudImportService, 'analyzeS3Folder')
      .mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          const signal = options?.abortSignal;
          if (!signal) return reject(new Error('Missing abortSignal'));

          if (signal.aborted) {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            return reject(err);
          }

          signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

    const app = createApp();

    const start = await request(app)
      .post('/api/cloud-import/analyze')
      .send({ provider: 's3', url: 'https://bucket.s3.amazonaws.com/folder/' })
      .expect(200);

    const cancel = await request(app)
      .post(`/api/cloud-import/analysis-jobs/${start.body.jobId}/cancel`)
      .send({})
      .expect(200);

    expect(cancel.body.status).toBe('cancelled');

    await waitFor(() => analysisJobs.get(start.body.jobId)?.status === 'cancelled');

    const status = await request(app)
      .get(`/api/cloud-import/analysis-jobs/${start.body.jobId}`)
      .expect(200);

    expect(status.body.status).toBe('cancelled');
    expect(status.body.error).toBe(null);
  });

  test('Pause analysis keeps partial results and POST /analyze resumes from saved cursor for same URL', async () => {
    const mockFilesPage1 = [
      {
        key: 'folder/a.pdf',
        name: 'a.pdf',
        size: 10,
        lastModified: '2024-01-01T00:00:00Z',
        extension: '.pdf'
      },
      {
        key: 'folder/b.txt',
        name: 'b.txt',
        size: 5,
        lastModified: '2024-01-02T00:00:00Z',
        extension: '.txt'
      }
    ];

    const analyzeSpy = jest.spyOn(cloudImportService, 'analyzeS3Folder');

    analyzeSpy.mockImplementationOnce((_url, options) => {
      // Simulate a first page found, with a continuation token to resume from
      options?.onProgress?.({
        filesDiscovered: 2,
        pagesProcessed: 1,
        totalSize: 15,
        fileTypes: { '.pdf': 1, '.txt': 1 },
        s3ContinuationToken: 'TOKEN_1',
        files: mockFilesPage1
      });

      const signal = options?.abortSignal;
      return new Promise((_resolve, reject) => {
        if (!signal) return reject(new Error('Missing abortSignal'));
        signal.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    analyzeSpy.mockImplementationOnce(async (_url, options) => {
      // Resume must use saved continuation token
      expect(options?.resumeFromContinuationToken).toBe('TOKEN_1');
      return {
        files: mockFilesPage1,
        totalSize: 15,
        fileTypes: { '.pdf': 1, '.txt': 1 }
      };
    });

    const app = createApp();

    const start = await request(app)
      .post('/api/cloud-import/analyze')
      .send({ provider: 's3', url: 'https://bucket.s3.amazonaws.com/folder/' })
      .expect(200);

    // Wait until progress was written
    await waitFor(() => analysisJobs.get(start.body.jobId)?.filesDiscovered === 2);

    // Pause
    const paused = await request(app)
      .post(`/api/cloud-import/analysis-jobs/${start.body.jobId}/pause`)
      .send({})
      .expect(200);

    expect(paused.body.status).toBe('paused');
    await waitFor(() => analysisJobs.get(start.body.jobId)?.status === 'paused');

    // Verify lookup by URL finds resumable job
    const lookup = await request(app)
      .get('/api/cloud-import/analysis-jobs/by-url')
      .query({ provider: 's3', url: 'https://bucket.s3.amazonaws.com/folder/' })
      .expect(200);
    expect(lookup.body.found).toBe(true);
    expect(lookup.body.status).toBe('paused');
    expect(lookup.body.jobId).toBe(start.body.jobId);

    // Verify partial files can be retrieved while paused
    const statusWithFiles = await request(app)
      .get(`/api/cloud-import/analysis-jobs/${start.body.jobId}`)
      .query({ includeFiles: '1' })
      .expect(200);
    expect(statusWithFiles.body.status).toBe('paused');
    expect(statusWithFiles.body.files).toHaveLength(2);

    // Resume via /analyze (same URL)
    const resume = await request(app)
      .post('/api/cloud-import/analyze')
      .send({ provider: 's3', url: 'https://bucket.s3.amazonaws.com/folder/' })
      .expect(200);

    expect(resume.body.jobId).toBe(start.body.jobId);
    expect(resume.body.resumed).toBe(true);

    await waitFor(() => analysisJobs.get(start.body.jobId)?.status === 'completed');
  });

  test('POST /api/cloud-import/import starts a cloud import job and processes files using mocked download + processSingleFile', async () => {
    jest
      .spyOn(cloudImportService, 'downloadS3File')
      .mockImplementation(async (_fileInfo) => Readable.from([Buffer.from('hello')]));

    const processSingleFile = jest.fn(async (_file, _collection, _autoCategorize, options) => {
      options?.onStage?.('Embedding…');
      return { id: 'doc_1', isUpdate: false };
    });

    const checkForDuplicates = jest.fn(async () => new Map());

    const app = createApp({ documentService: { processSingleFile, checkForDuplicates } });

    const res = await request(app)
      .post('/api/cloud-import/import')
      .send({
        provider: 's3',
        url: 'https://bucket.s3.amazonaws.com/folder/',
        files: [
          { name: 'a.txt', size: 5, url: 'https://bucket.s3.amazonaws.com/folder/a.txt' }
        ],
        autoCategorize: false
      })
      .expect(200);

    expect(typeof res.body.jobId).toBe('string');

    await waitFor(() => uploadJobs.get(res.body.jobId)?.status === 'completed');

    const job = uploadJobs.get(res.body.jobId);
    expect(job.successfulFiles).toBe(1);
    expect(job.failedFiles).toBe(0);
    expect(processSingleFile).toHaveBeenCalledTimes(1);
    expect(checkForDuplicates).toHaveBeenCalledTimes(1);
  });

  test('POST /api/cloud-import/analyze works for Google Drive using mocked analysis (no Google API calls)', async () => {
    const mockFiles = [
      {
        id: 'g1',
        name: 'doc1.pdf',
        size: 10,
        mimeType: 'application/pdf',
        extension: '.pdf'
      },
      {
        id: 'g2',
        name: 'doc2.txt',
        size: 5,
        mimeType: 'text/plain',
        extension: '.txt'
      }
    ];

    jest
      .spyOn(cloudImportService, 'analyzeGoogleDriveFolder')
      .mockImplementation(async (_url, options) => {
        options?.onProgress?.({ filesDiscovered: 2, pagesProcessed: 1, totalSize: 15 });
        expect(options?.abortSignal).toBeTruthy();
        return {
          files: mockFiles,
          totalSize: 15,
          fileTypes: { '.pdf': 1, '.txt': 1 }
        };
      });

    const app = createApp();

    const start = await request(app)
      .post('/api/cloud-import/analyze')
      .send({ provider: 'gdrive', url: 'https://drive.google.com/drive/folders/FAKE_FOLDER' })
      .expect(200);

    expect(start.body.status).toBe('analyzing');
    expect(typeof start.body.jobId).toBe('string');

    await waitFor(() => analysisJobs.get(start.body.jobId)?.status === 'completed');

    const status = await request(app)
      .get(`/api/cloud-import/analysis-jobs/${start.body.jobId}`)
      .expect(200);

    expect(status.body.status).toBe('completed');
    expect(status.body.filesDiscovered).toBe(2);
    expect(status.body.totalSize).toBe(15);
    expect(status.body.fileTypes['.pdf']).toBe(1);
    expect(status.body.files).toHaveLength(2);
    expect(status.body.files[0]).toHaveProperty('extension');
  });

  test('POST /api/cloud-import/import works for Google Drive using mocked download + processSingleFile (no Google API calls)', async () => {
    jest
      .spyOn(cloudImportService, 'downloadGoogleDriveFile')
      .mockImplementation(async (_fileInfo) => Readable.from([Buffer.from('hello')]))

    const processSingleFile = jest.fn(async (_file, _collection, _autoCategorize, options) => {
      options?.onStage?.('Embedding…');
      return { id: 'doc_g1', isUpdate: false };
    });

    const checkForDuplicates = jest.fn(async () => new Map());

    const app = createApp({ documentService: { processSingleFile, checkForDuplicates } });

    const res = await request(app)
      .post('/api/cloud-import/import')
      .send({
        provider: 'gdrive',
        url: 'https://drive.google.com/drive/folders/FAKE_FOLDER',
        files: [
          { id: 'g1', name: 'doc1.txt', size: 5, url: 'https://drive.google.com/uc?id=g1' }
        ],
        autoCategorize: false
      })
      .expect(200);

    expect(typeof res.body.jobId).toBe('string');

    await waitFor(() => uploadJobs.get(res.body.jobId)?.status === 'completed');

    const job = uploadJobs.get(res.body.jobId);
    expect(job.successfulFiles).toBe(1);
    expect(job.failedFiles).toBe(0);
    expect(processSingleFile).toHaveBeenCalledTimes(1);
    expect(checkForDuplicates).toHaveBeenCalledTimes(1);
  });
});
