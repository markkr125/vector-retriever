const express = require('express');

function createVisualizationRoutes({
  collectionMiddleware,
  visualizationService,
  embeddingService
}) {
  const router = express.Router();

  router.get('/visualize/scatter', collectionMiddleware, async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const limit = parseInt(req.query.limit) || 1000;

      const data = await visualizationService.getScatterData({
        collectionName: req.qdrantCollection,
        forceRefresh,
        limit
      });

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Visualization error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/visualize/search-results', collectionMiddleware, async (req, res) => {
    try {
      const { query, searchType, denseWeight, filters, limit, forceRefresh, bookmarkIds } = req.body;

      // Get query embedding if needed for semantic/hybrid search
      let queryEmbedding = null;
      if (query && (searchType === 'semantic' || searchType === 'hybrid')) {
        queryEmbedding = await embeddingService.getDenseEmbedding(query);
      }

      const data = await visualizationService.getSearchResultsVisualization({
        collectionName: req.qdrantCollection,
        query,
        searchType,
        denseWeight,
        filters,
        limit: limit || 5000,
        forceRefresh: forceRefresh || false,
        queryEmbedding,
        bookmarkIds
      });

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Search results visualization error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/visualize/refresh', collectionMiddleware, async (req, res) => {
    try {
      await visualizationService.clearCache();

      const data = await visualizationService.getScatterData({
        collectionName: req.qdrantCollection,
        forceRefresh: true,
        limit: req.body.limit || 1000
      });

      res.json({
        success: true,
        message: 'Visualization cache refreshed',
        data
      });
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.get('/visualize/stats', collectionMiddleware, async (req, res) => {
    try {
      const stats = await visualizationService.getCacheStats();

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = {
  createVisualizationRoutes
};
