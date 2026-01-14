const express = require('express');
const cloudImportService = require('../services/cloud-import-service');
const { isAbortError } = require('../services/ollama-agent');
const {
  createAnalysisJob,
  getAnalysisJob,
  updateAnalysisProgress,
  completeAnalysisJob,
  cancelAnalysisJob,
  failAnalysisJob
} = require('../state/analysis-jobs');

function createCloudImportRoutes({ collectionMiddleware, documentService, embeddingService, categorizationService, PIIDetectorFactory, uploadJobs }) {
  const router = express.Router();

  function extractS3BucketFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('s3://')) {
      const match = url.match(/^s3:\/\/([^\/]+)/);
      return match ? match[1] : null;
    }

    const match = url.match(/^https?:\/\/([^.]+)\.s3(?:[.-][^.]+)?\.amazonaws\.com\//);
    return match ? match[1] : null;
  }

  /**
   * GET /api/cloud-import/providers
   * Returns available cloud providers and their enabled status
   */
  router.get('/providers', (req, res) => {
    res.json({
      s3: {
        enabled: true,
        requiresAuth: false
      },
      gdrive: {
        enabled: cloudImportService.isGoogleDriveEnabled(),
        requiresAuth: true
      }
    });
  });

  /**
   * POST /api/cloud-import/analyze
   * Starts a cloud folder analysis job and returns jobId immediately
   * Body: { provider: 's3'|'gdrive', url: 'folder_url' }
   */
  router.post('/analyze', async (req, res) => {
    try {
      const { provider, url } = req.body;

      if (!provider || !url) {
        return res.status(400).json({ error: 'Provider and URL are required' });
      }

      if (provider !== 's3' && provider !== 'gdrive') {
        return res.status(400).json({ error: 'Invalid provider. Must be "s3" or "gdrive"' });
      }

      // Create analysis job
      const job = createAnalysisJob(provider, url);

      // Start analysis in background
      (async () => {
        try {
          const options = {
            onProgress: (progress) => {
              updateAnalysisProgress(job.jobId, progress);
            },
            abortSignal: job.abortController.signal
          };

          let analysis;
          if (provider === 's3') {
            analysis = await cloudImportService.analyzeS3Folder(url, options);
          } else if (provider === 'gdrive') {
            analysis = await cloudImportService.analyzeGoogleDriveFolder(url, options);
          }

          // Mark job as completed
          completeAnalysisJob(job.jobId, analysis.files, analysis.totalSize, analysis.fileTypes);
        } catch (error) {
          console.error(`Analysis job ${job.jobId} failed:`, error);
          failAnalysisJob(job.jobId, error);
        }
      })();

      // Return jobId immediately
      res.json({
        jobId: job.jobId,
        status: 'analyzing'
      });
    } catch (error) {
      console.error('Cloud import analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/cloud-import/analysis-jobs/:jobId
   * Get analysis job status and progress
   */
  router.get('/analysis-jobs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = getAnalysisJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Analysis job not found' });
    }

    // Return progress info (without abortController)
    res.json({
      jobId: job.jobId,
      status: job.status,
      provider: job.provider,
      url: job.url,
      filesDiscovered: job.filesDiscovered,
      totalSize: job.totalSize,
      fileTypes: job.fileTypes,
      pagesProcessed: job.pagesProcessed,
      files: job.status === 'completed' ? job.files : undefined,
      error: job.error,
      startTime: job.startTime,
      endTime: job.endTime
    });
  });

  /**
   * POST /api/cloud-import/analysis-jobs/:jobId/cancel
   * Cancel a running analysis job
   */
  router.post('/analysis-jobs/:jobId/cancel', (req, res) => {
    const { jobId } = req.params;
    const job = getAnalysisJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Analysis job not found' });
    }

    if (job.status !== 'analyzing') {
      return res.status(400).json({ error: 'Job is not running' });
    }

    cancelAnalysisJob(jobId);

    res.json({
      jobId: job.jobId,
      status: 'cancelled',
      message: 'Analysis job cancelled successfully'
    });
  });

  /**
   * POST /api/cloud-import/import
   * Starts a cloud import job
   * Body: {
   *   provider: 's3'|'gdrive',
   *   url: 'folder_url',
   *   files: 'all' | [{key, name, size, url}],
   *   autoCategorize: boolean
   * }
   */
  router.post('/import', collectionMiddleware, async (req, res) => {
    try {
      const { provider, url, files, autoCategorize, appendToJob } = req.body;

      if (!provider || !url || !files) {
        return res.status(400).json({ error: 'Provider, URL, and files selection are required' });
      }

    // Determine which files to import
    let filesToImport;
    if (files === 'all') {
      // Re-analyze to get full file list
      if (provider === 's3') {
        const analysis = await cloudImportService.analyzeS3Folder(url);
        filesToImport = analysis.files;
      } else if (provider === 'gdrive') {
        const analysis = await cloudImportService.analyzeGoogleDriveFolder(url);
        filesToImport = analysis.files;
      }
    } else {
      filesToImport = files;
    }

    if (!filesToImport || filesToImport.length === 0) {
      return res.status(400).json({ error: 'No files to import' });
    }

    // Check if appending to existing job (for batch uploads)
    let jobId = appendToJob;
    const { getJob, createJob, updateJobProgress } = require('../state/upload-jobs');
    
    if (appendToJob) {
      // Append to existing job
      const existingJob = getJob(appendToJob);
      if (existingJob) {
        // If a job already finished, allow appending by moving it back to processing
        if (existingJob.status === 'completed') {
          existingJob.status = 'processing';
          existingJob.endTime = null;
        }

        // Update total files count
        existingJob.totalFiles += filesToImport.length;

        // Append to processing queue (single worker consumes this)
        if (!Array.isArray(existingJob.cloudImportQueue)) {
          existingJob.cloudImportQueue = [];
        }
        existingJob.cloudImportQueue.push(...filesToImport);

        // Add new files to the files array
        for (const file of filesToImport) {
          existingJob.files.push({
            name: file.name,
            status: 'pending',
            id: null,
            error: null,
            bucket: provider === 's3' ? extractS3BucketFromUrl(file.url || url) : null
          });
        }
      } else {
        return res.status(404).json({ error: 'Job not found for appending' });
      }
    } else {
      // Create new job (createJob generates its own ID)
      const job = createJob(filesToImport.length);
      jobId = job.id; // Use the generated ID
      job.source = 'cloud';
      job.provider = provider;
      job.collectionId = req.collectionId;
      job.qdrantCollection = req.qdrantCollection;

      // Cloud-import worker state
      job.cloudImportQueue = [...filesToImport];
      job.cloudImportCursor = 0;
      job.cloudImportWorkerRunning = false;
      job.cloudImportAutoCategorize = !!autoCategorize;
      job.cloudImportUrl = url;
      
      // Initialize files array with pending status
      for (const file of filesToImport) {
        job.files.push({
          name: file.name,
          status: 'pending',
          id: null,
          error: null,
          bucket: provider === 's3' ? extractS3BucketFromUrl(file.url || url) : null
        });
      }
    }

    // Start background processing (don't await)
    processCloudImport({
      jobId,
      documentService  // Pass the already-initialized documentService
    }).catch(error => {
      console.error('Cloud import background processing error:', error);
    });

    res.json({
      jobId,
      message: appendToJob ? 'Batch appended to job' : 'Cloud import job started',
      totalFiles: filesToImport.length
    });
  } catch (error) {
    console.error('Cloud import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Background processing for cloud imports
 * Downloads files and processes them through the same pipeline as regular uploads
 */
async function processCloudImport(options) {
  const { jobId, documentService } = options;
  
  const { uploadJobs } = require('../state/upload-jobs');
  
  const job = uploadJobs.get(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }

  if (job.status === 'stopped') {
    return;
  }

  if (job.cloudImportWorkerRunning) {
    // A worker is already processing this job; it will pick up appended files.
    return;
  }

  if (!Array.isArray(job.cloudImportQueue)) {
    job.cloudImportQueue = [];
  }
  if (typeof job.cloudImportCursor !== 'number') {
    job.cloudImportCursor = 0;
  }

  job.cloudImportWorkerRunning = true;
  job.status = 'processing';

  try {
    while (job.cloudImportCursor < job.cloudImportQueue.length) {
      if (job.status === 'stopped') {
        console.log(`Job ${jobId} was stopped, skipping remaining files`);
        break;
      }

      if (job.abortController?.signal?.aborted) {
        console.log(`Job ${jobId} was cancelled, skipping remaining files`);
        break;
      }

      const index = job.cloudImportCursor;
      const fileInfo = job.cloudImportQueue[index];

      // Ensure there is a corresponding status entry
      if (!job.files[index]) {
        job.files[index] = {
          name: fileInfo?.name || 'unknown',
          status: 'pending',
          id: null,
          error: null
        };
      }

      job.currentFile = fileInfo.name;
      job.files[index].status = 'processing';
      job.currentStage = job.provider === 's3' ? 'Downloading from S3…' : 'Downloading from cloud…';

      try {
        // Download file from cloud
        let fileStream;
        if (job.provider === 's3') {
          fileStream = await cloudImportService.downloadS3File(fileInfo);
        } else if (job.provider === 'gdrive') {
          fileStream = await cloudImportService.downloadGoogleDriveFile(fileInfo);
        } else {
          throw new Error(`Unsupported provider: ${job.provider}`);
        }

        // Convert stream to buffer
        const chunks = [];
        for await (const chunk of fileStream) {
          if (job.status === 'stopped' || job.abortController?.signal?.aborted) {
            try {
              fileStream?.destroy?.();
            } catch {
              // ignore
            }
            throw new Error('Cancelled by user');
          }
          chunks.push(chunk);
        }
        const fileBuffer = Buffer.concat(chunks);

        // Create a file-like object for processing
        const file = {
          buffer: fileBuffer,
          originalname: fileInfo.name,
          mimetype: getMimeType(fileInfo.name),
          size: fileInfo.size
        };

        // Process through the same pipeline as regular uploads
        // processSingleFile handles everything: extraction, embedding, storage
        const result = await documentService.processSingleFile(
          file,
          job.qdrantCollection,
          !!job.cloudImportAutoCategorize,
          {
            signal: job.abortController?.signal,
            onStage: (stage) => {
              job.currentStage = stage;
            }
          }
        );

        job.files[index].status = 'success';
        job.files[index].id = result.id;
        job.successfulFiles++;
      } catch (error) {
        const aborted = isAbortError(error) || job.abortController?.signal?.aborted || job.status === 'stopped';
        if (aborted && job.status === 'stopped') {
          job.files[index].status = 'error';
          job.files[index].error = 'Cancelled by user';
          job.failedFiles++;
          job.errors.push({
            filename: fileInfo.name,
            error: 'Cancelled by user'
          });
          console.log(`Job ${jobId} cancelled during file: ${fileInfo.name}`);
          break;
        }

        console.error(`Failed to process ${fileInfo.name}:`, error);
        job.files[index].status = 'error';
        job.files[index].error = error.message;
        job.failedFiles++;
        job.errors.push({
          filename: fileInfo.name,
          error: error.message
        });
      } finally {
        job.processedFiles++;
        job.cloudImportCursor++;
        job.currentFile = null;
        job.currentStage = null;
      }
    }
  } finally {
    job.cloudImportWorkerRunning = false;
    job.endTime = Date.now();
    job.currentFile = null;
    job.currentStage = null;
    if (job.status !== 'stopped' && job.cloudImportCursor >= job.cloudImportQueue.length) {
      job.status = 'completed';
    }
  }
}

/**
 * Helper to get MIME type from filename
 */
function getMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    'txt': 'text/plain',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'json': 'application/json',
    'md': 'text/markdown',
    'html': 'text/html',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

  return router;
}

module.exports = { createCloudImportRoutes };
