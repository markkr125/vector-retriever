const express = require('express');

function createConfigHealthRoutes({
  maxFileSizeMB,
  categorizationEnabled,
  piiDetectionEnabled,
  piiDetectionMethod,
  qdrantClient
}) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({
      maxFileSizeMB,
      categorizationEnabled,
      piiDetectionEnabled,
      piiDetectionMethod
    });
  });

  router.get('/health', async (req, res) => {
    try {
      const collections = await qdrantClient.getCollections();
      res.json({
        status: 'ok',
        qdrant: 'connected',
        collections: collections.collections.map(c => c.name)
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = {
  createConfigHealthRoutes
};
