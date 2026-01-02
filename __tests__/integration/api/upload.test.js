const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { setupTestCollection, teardownTestCollection, waitForJobCompletion } = require('../../fixtures/test-helpers');

const shouldRun = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = shouldRun ? describe : describe.skip;

describeIntegration('Upload API Integration Tests', () => {
  const testCollectionName = 'test_upload_collection';
  let app;

  beforeAll(async () => {
    await setupTestCollection(testCollectionName);
  });

  afterAll(async () => {
    await teardownTestCollection(testCollectionName);
  });

  describe('POST /api/documents/upload', () => {
    test.skip('uploads text file and returns jobId', async () => {
      const testFile = Buffer.from('Test document content for upload');
      
      const response = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', testFile, 'test.txt')
        .expect(200);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body.jobId).toMatch(/^job_\d+_\d+$/);
    });

    test.skip('uploads multiple files', async () => {
      const file1 = Buffer.from('First document');
      const file2 = Buffer.from('Second document');
      
      const response = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', file1, 'test1.txt')
        .attach('files', file2, 'test2.txt')
        .expect(200);

      expect(response.body.jobId).toBeDefined();
    });

    test.skip('processes files in background with status tracking', async () => {
      const testFile = Buffer.from('Background processing test');
      
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', testFile, 'background.txt');

      const jobId = uploadResponse.body.jobId;

      // Poll for completion
      const getJobStatus = async (id) => {
        const statusResponse = await request(app)
          .get(`/api/upload-jobs/${id}`)
          .expect(200);
        return statusResponse.body;
      };

      const finalStatus = await waitForJobCompletion(jobId, getJobStatus, 30000);

      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.successfulFiles).toBe(1);
      expect(finalStatus.processedFiles).toBe(1);
    });

    test.skip('extracts structured metadata from content', async () => {
      const structuredContent = `Category: hotel
Location: Test City
Price: 299
Rating: 4.5

Test hotel description`;
      
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', Buffer.from(structuredContent), 'hotel_test.txt');

      const jobId = uploadResponse.body.jobId;

      const getJobStatus = async (id) => {
        const statusResponse = await request(app).get(`/api/upload-jobs/${id}`);
        return statusResponse.body;
      };

      await waitForJobCompletion(jobId, getJobStatus);

      // Verify document was stored with metadata
      const searchResponse = await request(app)
        .post('/api/search/hybrid')
        .query({ collection: testCollectionName })
        .send({ query: 'hotel test' });

      const uploadedDoc = searchResponse.body.results.find(
        r => r.payload.filename === 'hotel_test.txt'
      );

      expect(uploadedDoc).toBeDefined();
      expect(uploadedDoc.payload.category).toBe('hotel');
      expect(uploadedDoc.payload.price).toBe(299);
    });
  });

  describe('GET /api/upload-jobs/:jobId', () => {
    test.skip('returns job status', async () => {
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', Buffer.from('Test'), 'test.txt');

      const jobId = uploadResponse.body.jobId;

      const statusResponse = await request(app)
        .get(`/api/upload-jobs/${jobId}`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('id', jobId);
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('totalFiles');
      expect(statusResponse.body).toHaveProperty('processedFiles');
    });

    test.skip('returns 404 for non-existent job', async () => {
      await request(app)
        .get('/api/upload-jobs/non_existent_job')
        .expect(404);
    });
  });

  describe('POST /api/upload-jobs/:jobId/stop', () => {
    test.skip('stops upload job', async () => {
      // Upload multiple files
      const files = Array(5).fill(null).map((_, i) => 
        Buffer.from(`File ${i}`)
      );
      
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', files[0], 'file0.txt')
        .attach('files', files[1], 'file1.txt')
        .attach('files', files[2], 'file2.txt')
        .attach('files', files[3], 'file3.txt')
        .attach('files', files[4], 'file4.txt');

      const jobId = uploadResponse.body.jobId;

      // Wait briefly then stop
      await new Promise(resolve => setTimeout(resolve, 500));

      const stopResponse = await request(app)
        .post(`/api/upload-jobs/${jobId}/stop`)
        .expect(200);

      expect(stopResponse.body).toHaveProperty('message');

      // Check final status
      const statusResponse = await request(app)
        .get(`/api/upload-jobs/${jobId}`)
        .expect(200);

      expect(statusResponse.body.status).toBe('stopped');
      expect(statusResponse.body.processedFiles).toBeLessThan(5);
    });
  });

  describe('GET /api/upload-jobs/active', () => {
    test.skip('returns active upload job', async () => {
      const uploadResponse = await request(app)
        .post('/api/documents/upload')
        .query({ collection: testCollectionName })
        .attach('files', Buffer.from('Test'), 'test.txt');

      const jobId = uploadResponse.body.jobId;

      // Immediately check for active job
      const activeResponse = await request(app)
        .get('/api/upload-jobs/active')
        .expect(200);

      if (activeResponse.body.jobId) {
        expect(activeResponse.body.jobId).toBe(jobId);
      }
    });

    test.skip('returns null when no active job', async () => {
      const response = await request(app)
        .get('/api/upload-jobs/active')
        .expect(200);

      expect(response.body).toEqual({ jobId: null });
    });
  });
});

// Structure tests
describe('Upload API Tests (Unit)', () => {
  test('test helpers are available', () => {
    expect(waitForJobCompletion).toBeDefined();
  });
});
