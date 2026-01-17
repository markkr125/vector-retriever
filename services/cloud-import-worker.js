const cloudImportService = require('./cloud-import-service');
const { isAbortError } = require('./ollama-agent');

/**
 * Background processing for cloud imports.
 * Downloads files and processes them through the same pipeline as regular uploads.
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

function getMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeTypes = {
    txt: 'text/plain',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    json: 'application/json',
    md: 'text/markdown',
    html: 'text/html',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  processCloudImport,
  getMimeType
};
