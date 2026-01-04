const express = require('express');

function createDocumentsRoutes({ collectionMiddleware, documentService, collectionsService, qdrantClient }) {
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

  router.post('/documents/:id/generate-description', collectionMiddleware, async (req, res) => {
    try {
      const documentId = req.params.id;
      
      // Parse document ID (could be numeric or UUID)
      let parsedId;
      const numericId = parseInt(documentId, 10);
      if (!isNaN(numericId)) {
        parsedId = numericId;
      } else {
        parsedId = documentId; // UUID string
      }

      // Fetch document from Qdrant
      const points = await qdrantClient.retrieve(req.qdrantCollection, {
        ids: [parsedId],
        with_payload: true,
        with_vector: false
      });

      if (!points || points.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = points[0];
      const payload = document.payload;

      let description = '';

      // Check if this is an image document with vision processing capability
      if (payload.document_type === 'image' && payload.vision_processed) {
        // For images, we need the vision service to re-process
        // Since we don't store the original image, we'll use text-based description as fallback
        if (documentService.visionService && payload.image_data) {
          // If image_data is stored, re-process with vision model
          const imageBuffer = Buffer.from(payload.image_data, 'base64');
          const mimeType = payload.file_type || 'image/jpeg';
          const visionResult = await documentService.visionService.processImage(imageBuffer, mimeType);
          description = visionResult.description;
        } else {
          // Fallback: use description service on extracted content
          if (documentService.descriptionService && payload.content) {
            const result = await documentService.descriptionService.generateDescription(
              payload.content,
              payload.file_type || 'image'
            );
            description = result.description;
          } else {
            return res.status(400).json({ 
              error: 'Description service not available or document has no content' 
            });
          }
        }
      } else {
        // For text documents, use description service
        if (!documentService.descriptionService) {
          return res.status(400).json({ error: 'Description service not configured' });
        }

        if (!payload.content) {
          return res.status(400).json({ error: 'Document has no content' });
        }

        const result = await documentService.descriptionService.generateDescription(
          payload.content,
          payload.file_type || 'unknown'
        );
        description = result.description;
      }

      // Update document in Qdrant with new description
      await qdrantClient.setPayload(req.qdrantCollection, {
        points: [parsedId],
        payload: {
          description: description
        }
      });

      console.log(`✓ Generated description for document ${documentId}`);

      res.json({
        success: true,
        description: description
      });

    } catch (error) {
      console.error('Error generating description:', error);
      res.status(500).json({
        error: error.message,
        details: 'Failed to generate description'
      });
    }
  });

  return router;
}

module.exports = {
  createDocumentsRoutes
};
