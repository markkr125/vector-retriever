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
    
    // Results
    files: [],
    
    // Cancellation support
    abortController: new AbortController(),
    
    // Timestamps
    startTime: Date.now(),
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
  return job;
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
    // Only cleanup finished jobs (completed, cancelled, error)
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
  cancelAnalysisJob,
  failAnalysisJob,
  deleteAnalysisJob,
  cleanupOldJobs
};
