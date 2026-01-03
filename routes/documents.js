const express = require('express');

function createDocumentsRoutes({ collectionMiddleware, documentService, collectionsService }) {
  const router = express.Router();

  router.post('/documents/add', collectionMiddleware, async (req, res) => {
    try {
      const { filename, content, metadata = {} } = req.body;

      if (!filename || !content) {
        return res.status(400).json({ error: 'Filename and content are required' });
      }

      const { pointId, parsedMetadata } = await documentService.addDocument({
        collectionName: req.qdrantCollection,
        filename,
        content,
        metadata
      });

      // Update collection document count
      await collectionsService.refreshDocumentCount(req.collectionId);

      res.json({
        success: true,
        message: `Document "${filename}" added successfully`,
        id: pointId,
        metadata: parsedMetadata
      });
    } catch (error) {
      console.error('Error adding document:', error);
      res.status(500).json({
        error: error.message,
        details: 'Failed to add document'
      });
    }
  });

  return router;
}

module.exports = {
  createDocumentsRoutes
};
