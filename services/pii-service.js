const { isAbortError } = require('./ollama-agent');

function createPiiService({ enabled, detector }) {
  async function detectPII(content, options = {}) {
    if (!enabled || !detector) {
      return {
        hasPII: false,
        piiTypes: [],
        piiDetails: [],
        riskLevel: 'low',
        detectionMethod: 'disabled',
        scanTimestamp: new Date().toISOString(),
        processingTimeMs: 0
      };
    }

    try {
      return await detector.detect(content, options);
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) {
        throw error;
      }

      console.error('PII detection error:', error);
      return {
        hasPII: false,
        piiTypes: [],
        piiDetails: [],
        riskLevel: 'low',
        detectionMethod: 'error',
        scanTimestamp: new Date().toISOString(),
        processingTimeMs: 0
      };
    }
  }

  return {
    detectPII
  };
}

module.exports = {
  createPiiService
};
