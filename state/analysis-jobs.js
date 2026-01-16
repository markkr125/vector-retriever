/**
 * Analysis Jobs State Management
 * Stores in-memory state for cloud folder analysis jobs
 */

// In-memory store for analysis jobs
const analysisJobs = new Map();

// Auto-increment counter for job IDs
let jobIdCounter = 0;

/**
 * Generate unique job ID
 */
function generateJobId() {
  return `analysis_${Date.now()}_${jobIdCounter++}`;
}

/**
 * Create new analysis job
 */
function createAnalysisJob(provider, url) {
  const jobId = generateJobId();
  const job = {
    jobId,
    status: 'analyzing',
    provider,
    url,
    
    // Progressive statistics
    filesDiscovered: 0,
    totalSize: 0,
    fileTypes: {},
    pagesProcessed: 0,

    // Resumable cursor state
    s3ContinuationToken: null,
    gdrivePageToken: null,
    
    // Results
    files: [],
    
    // Cancellation support
    abortController: new AbortController(),
    
    // Timestamps
    startTime: Date.now(),
    lastUpdatedAt: Date.now(),
    endTime: null,
    
    // Error tracking
    error: null
  };
  
  analysisJobs.set(jobId, job);
  return job;
}

/**
 * Get analysis job by ID
 */
function getAnalysisJob(jobId) {
  return analysisJobs.get(jobId);
}

/**
 * Update analysis job progress
 */
function updateAnalysisProgress(jobId, updates) {
  const job = analysisJobs.get(jobId);
  if (!job) return null;
  
  Object.assign(job, updates);
  job.lastUpdatedAt = Date.now();
  return job;
}

function markJobPaused(jobId) {
  const job = analysisJobs.get(jobId);
  if (!job) return null;

  // Trigger abort signal to stop work quickly.
  job.abortController.abort();
  job.status = 'paused';
  job.endTime = Date.now();
  job.lastUpdatedAt = Date.now();
  return job;
}

function resumePausedJob(jobId) {
  const job = analysisJobs.get(jobId);
  if (!job) return null;

  job.status = 'analyzing';
  job.endTime = null;
  job.error = null;
  job.abortController = new AbortController();
  job.lastUpdatedAt = Date.now();
  return job;
}

function findRecentResumableJobByUrl(provider, url, { maxAgeMs = 10 * 60 * 1000 } = {}) {
  if (!provider || !url) return null;
  const now = Date.now();

  let best = null;
  for (const job of analysisJobs.values()) {
    if (job.provider !== provider) continue;
    if (job.url !== url) continue;

    // Prefer paused jobs; allow attaching to in-flight analyzing jobs too.
    if (job.status !== 'paused' && job.status !== 'analyzing') continue;

    const ts = job.status === 'paused' && job.endTime ? job.endTime : job.lastUpdatedAt || job.startTime;
    if (ts && now - ts > maxAgeMs) continue;

    if (!best) {
      best = job;
      continue;
    }

    const bestTs = best.status === 'paused' && best.endTime ? best.endTime : best.lastUpdatedAt || best.startTime;
    if ((ts || 0) > (bestTs || 0)) {
      best = job;
    }
  }

  return best;
}

/**
 * Mark job as completed
 */
function completeAnalysisJob(jobId, files, totalSize, fileTypes) {
  const job = analysisJobs.get(jobId);
  if (!job) return null;
  
  job.status = 'completed';
  job.files = files;
  job.filesDiscovered = files.length;
  job.totalSize = totalSize;
  job.fileTypes = fileTypes;
  job.endTime = Date.now();
  job.lastUpdatedAt = Date.now();
  
  return job;
}

/**
 * Mark job as cancelled
 */
function cancelAnalysisJob(jobId) {
  const job = analysisJobs.get(jobId);
  if (!job) return null;
  
  // Trigger abort signal
  job.abortController.abort();
  job.status = 'cancelled';
  job.endTime = Date.now();
  job.lastUpdatedAt = Date.now();
  
  return job;
}

/**
 * Mark job as failed
 */
function failAnalysisJob(jobId, error) {
  const job = analysisJobs.get(jobId);
  if (!job) return null;
  
  job.status = 'error';
  job.error = error.message || String(error);
  job.endTime = Date.now();
  job.lastUpdatedAt = Date.now();
  
  return job;
}

/**
 * Delete analysis job
 */
function deleteAnalysisJob(jobId) {
  analysisJobs.delete(jobId);
}

/**
 * Clean up old completed/cancelled/error jobs
 * Removes jobs older than specified time (default: 10 minutes)
 */
function cleanupOldJobs(maxAge = 10 * 60 * 1000) {
  const now = Date.now();
  const jobsToDelete = [];
  
  for (const [jobId, job] of analysisJobs.entries()) {
    // Cleanup finished jobs (completed, cancelled, paused, error)
    // For paused jobs, endTime is used as the "paused at" timestamp.
    if (job.status !== 'analyzing' && job.endTime) {
      const age = now - job.endTime;
      if (age > maxAge) {
        jobsToDelete.push(jobId);
      }
    }
  }
  
  jobsToDelete.forEach(jobId => {
    console.log(`[Analysis Jobs] Cleaning up old job: ${jobId}`);
    analysisJobs.delete(jobId);
  });
  
  return jobsToDelete.length;
}

// Setup automatic cleanup every 2 minutes
const CLEANUP_INTERVAL = 2 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const cleaned = cleanupOldJobs();
  if (cleaned > 0) {
    console.log(`[Analysis Jobs] Cleaned up ${cleaned} old jobs`);
  }
}, CLEANUP_INTERVAL);

// Prevent Node.js from hanging
cleanupTimer.unref();

module.exports = {
  analysisJobs,
  generateJobId,
  createAnalysisJob,
  getAnalysisJob,
  updateAnalysisProgress,
  completeAnalysisJob,
  markJobPaused,
  resumePausedJob,
  findRecentResumableJobByUrl,
  cancelAnalysisJob,
  failAnalysisJob,
  deleteAnalysisJob,
  cleanupOldJobs
};
