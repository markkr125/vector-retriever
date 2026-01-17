const express = require('express');
const { isAbortError } = require('../services/ollama-agent');
const { processCloudImport } = require('../services/cloud-import-worker');

function clampInt(value, { min, max, fallback }) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function serializeUploadJob(job, reqQuery = {}) {
  const filesTotal = Array.isArray(job.files) ? job.files.length : 0;

  // Default to returning a window around current progress to keep payload small.
  const defaultOffset = Math.max(0, (job.processedFiles || 0) - 50);
  const filesOffset = clampInt(reqQuery.filesOffset, {
    min: 0,
    max: filesTotal,
    fallback: defaultOffset
  });

  const filesLimit = clampInt(reqQuery.filesLimit, {
    min: 0,
    max: 1000,
    fallback: 200
  });

  const files = Array.isArray(job.files)
    ? job.files.slice(filesOffset, filesOffset + filesLimit)
    : [];

  return {
    id: job.id,
    status: job.status,
    totalFiles: job.totalFiles,
    processedFiles: job.processedFiles,
    successfulFiles: job.successfulFiles,
    failedFiles: job.failedFiles,
    currentFile: job.currentFile,
    currentStage: job.currentStage,
    startTime: job.startTime,
    endTime: job.endTime,
    source: job.source,
    provider: job.provider,

    filesTotal,
    filesOffset,
    filesLimit,
    files
  };
}

function serializeUploadJobFiles(job, reqQuery = {}) {
  const filesTotal = Array.isArray(job.files) ? job.files.length : 0;
  const filesOffset = clampInt(reqQuery.offset ?? reqQuery.filesOffset, {
    min: 0,
    max: filesTotal,
    fallback: 0
  });
  const filesLimit = clampInt(reqQuery.limit ?? reqQuery.filesLimit, {
    min: 0,
    max: 1000,
    fallback: 200
  });

  const files = Array.isArray(job.files)
    ? job.files.slice(filesOffset, filesOffset + filesLimit)
    : [];

  return {
    id: job.id,
    filesTotal,
    offset: filesOffset,
    limit: filesLimit,
    files
  };
}

function createUploadsRoutes({
  upload,
  collectionMiddleware,
  uploadJobs,
  createJob,
  documentService,
  collectionsService
}) {
  const router = express.Router();

  router.post('/documents/upload', collectionMiddleware, upload.array('files', 100), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const files = req.files;
      const autoCategorize = req.body.auto_categorize === 'true';

      // Create job
      const job = createJob(files.length);

      // Initialize file statuses
      job.files = files.map(f => ({
        name: f.originalname,
        status: 'pending',
        error: null,
        id: null
      }));

      // Return job ID immediately
      res.json({
        success: true,
        jobId: job.id,
        totalFiles: files.length
      });

      // Process files asynchronously
      (async () => {
        for (let i = 0; i < files.length; i++) {
          // Check if job was stopped
          if (job.status === 'stopped') {
            console.log(`Job ${job.id} stopped. Skipping remaining files.`);
            break;
          }

          const file = files[i];
          const fileInfo = job.files[i];

          fileInfo.status = 'processing';
          job.currentFile = fileInfo.name;

          try {
            const result = await documentService.processSingleFile(
              file,
              req.qdrantCollection,
              autoCategorize,
              {
                signal: job.abortController?.signal,
                onStage: (stage) => {
                  job.currentStage = stage;
                }
              }
            );

            fileInfo.status = 'success';
            fileInfo.id = result.id;
            job.successfulFiles++;
          } catch (error) {
            const aborted = isAbortError(error) || job.abortController?.signal?.aborted;
            if (aborted && job.status === 'stopped') {
              fileInfo.status = 'error';
              fileInfo.error = 'Cancelled by user';
              job.failedFiles++;
              job.errors.push({
                filename: fileInfo.name,
                error: 'Cancelled by user'
              });
              console.log(`Job ${job.id} cancelled during file: ${fileInfo.name}`);
              break;
            }

            console.error(`Error processing file ${fileInfo.name}:`, error);

            fileInfo.status = 'error';
            fileInfo.error = error.message;
            job.failedFiles++;
            job.errors.push({
              filename: fileInfo.name,
              error: error.message
            });
          } finally {
            job.processedFiles++;
            job.currentFile = null;
            job.currentStage = null;
          }
        }

        // Mark job as complete
        if (job.status !== 'stopped') {
          job.status = 'completed';
        }
        job.endTime = Date.now();
        job.currentStage = null;

        // Update collection document count
        if (job.successfulFiles > 0) {
          await collectionsService.refreshDocumentCount(req.collectionId);
        }

        console.log(`Job ${job.id} finished: ${job.successfulFiles} successful, ${job.failedFiles} failed`);
      })();

    } catch (error) {
      console.error('Error creating upload job:', error);
      res.status(500).json({
        error: error.message,
        details: 'Failed to create upload job'
      });
    }
  });

  // NOTE: Must come before /:jobId route to avoid matching "active" as a jobId
  router.get('/upload-jobs/active', (req, res) => {
    for (const job of uploadJobs.values()) {
      if (job.status === 'processing') {
        return res.json(serializeUploadJob(job, req.query));
      }
    }

    res.json(null);
  });

  router.get('/upload-jobs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = uploadJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(serializeUploadJob(job, req.query));
  });

  // Paged file list for virtual scrolling
  router.get('/upload-jobs/:jobId/files', (req, res) => {
    const { jobId } = req.params;
    const job = uploadJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(serializeUploadJobFiles(job, req.query));
  });

  router.post('/upload-jobs/:jobId/stop', (req, res) => {
    const { jobId } = req.params;
    const job = uploadJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'processing') {
      return res.status(400).json({ error: 'Job is not processing' });
    }

    job.status = 'stopped';
    try {
      job.abortController?.abort();
    } catch {
      // ignore
    }
    console.log(`Job ${jobId} marked for stopping`);

    res.json({ success: true, message: job.abortController ? 'Job cancelled' : 'Job will stop after current file completes' });
  });

  // Resume a previously stopped (paused) cloud import upload job.
  router.post('/upload-jobs/:jobId/resume', (req, res) => {
    const { jobId } = req.params;
    const job = uploadJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'stopped') {
      return res.status(400).json({ error: 'Job is not paused' });
    }

    if (job.source !== 'cloud') {
      return res.status(400).json({ error: 'Resume is only supported for cloud import jobs' });
    }

    if (!Array.isArray(job.cloudImportQueue) || typeof job.cloudImportCursor !== 'number') {
      return res.status(400).json({ error: 'Cloud import job is missing resume state' });
    }

    if (job.cloudImportCursor >= job.cloudImportQueue.length) {
      return res.status(400).json({ error: 'Job has no remaining files to process' });
    }

    // Reset abort state and resume processing.
    try {
      job.abortController = new AbortController();
    } catch {
      // ignore
    }

    job.status = 'processing';
    job.endTime = null;
    job.currentFile = null;
    job.currentStage = null;

    processCloudImport({ jobId, documentService }).catch(error => {
      console.error('Cloud import resume processing error:', error);
    });

    return res.json({ success: true, message: 'Job resumed' });
  });

  return router;
}

module.exports = {
  createUploadsRoutes
};
