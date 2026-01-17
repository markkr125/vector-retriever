const uploadJobs = new Map();
let jobIdCounter = 1;

function generateJobId() {
  return `job_${Date.now()}_${jobIdCounter++}`;
}

function createJob(totalFiles) {
  const jobId = generateJobId();
  const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const job = {
    id: jobId,
    status: 'processing', // processing, completed, stopped, error
    totalFiles,
    processedFiles: 0,
    successfulFiles: 0,
    failedFiles: 0,
    currentFile: null,
    currentStage: null,
    abortController,
    files: [], // { name, status: 'pending'|'processing'|'success'|'error', error?, id? }
    errors: [],
    startTime: Date.now(),
    endTime: null
  };
  uploadJobs.set(jobId, job);
  return job;
}

function getJob(jobId) {
  return uploadJobs.get(jobId);
}

function updateJobProgress(jobId, updates) {
  const job = uploadJobs.get(jobId);
  if (job) {
    Object.assign(job, updates);
  }
  return job;
}

module.exports = {
  uploadJobs,
  createJob,
  getJob,
  updateJobProgress
};
