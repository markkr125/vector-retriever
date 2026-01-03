const express = require('express');

function createTempFilesRoutes({ upload, storeTempFile, getTempFile, tempFileTtlMs }) {
  const router = express.Router();

  router.post('/temp-files', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { id, expiresAt } = storeTempFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      res.json({
        id,
        filename: req.file.originalname,
        size: req.file.size,
        expiresAt: new Date(expiresAt).toISOString(),
        ttlSeconds: Math.floor(tempFileTtlMs / 1000)
      });
    } catch (error) {
      console.error('Temp file upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/temp-files/:id', (req, res) => {
    try {
      const file = getTempFile(req.params.id);

      if (!file) {
        return res.status(404).json({
          error: 'File not found or expired',
          message: 'Please re-upload your document to search again'
        });
      }

      res.json({
        id: file.id,
        filename: file.filename,
        size: file.buffer.length,
        uploadedAt: new Date(file.uploadedAt).toISOString(),
        expiresAt: new Date(file.expiresAt).toISOString()
      });
    } catch (error) {
      console.error('Temp file retrieval error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createTempFilesRoutes
};
