function createPiiService({ enabled, detector }) {
  async function detectPII(content) {
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
      return await detector.detect(content);
    } catch (error) {
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
