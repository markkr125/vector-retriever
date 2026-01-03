const express = require('express');

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
            const result = await documentService.processSingleFile(file, req.qdrantCollection, autoCategorize);

            fileInfo.status = 'success';
            fileInfo.id = result.id;
            job.successfulFiles++;
          } catch (error) {
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
          }
        }

        // Mark job as complete
        if (job.status !== 'stopped') {
          job.status = 'completed';
        }
        job.endTime = Date.now();

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
        return res.json(job);
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

    res.json(job);
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
    console.log(`Job ${jobId} marked for stopping`);

    res.json({ success: true, message: 'Job will stop after current file completes' });
  });

  return router;
}

module.exports = {
  createUploadsRoutes
};
