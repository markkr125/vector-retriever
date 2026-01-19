const express = require('express');

function createConfigHealthRoutes({
  maxFileSizeMB,
  maxCloudImportDocs,
  maxCloudImportSizeMB,
  categorizationEnabled,
  piiDetectionEnabled,
  piiDetectionMethod,
  visionEnabled,
  visionModel,
  supportedImageTypes,
  libreOfficeEnabled,
  qdrantClient
}) {
  const router = express.Router();

  // Build supported file types lists
  const baseUploadTypes = ['.txt', '.json', '.pdf', '.docx', '.csv', '.xlsx', '.pptx', '.rtf'];
  const baseByDocumentTypes = ['.txt', '.md', '.pdf', '.docx', '.csv', '.xlsx', '.pptx', '.rtf'];
  
  const supportedUploadFileTypes = [...baseUploadTypes];
  const supportedByDocumentFileTypes = [...baseByDocumentTypes];
  
  if (visionEnabled) {
    supportedUploadFileTypes.push(...supportedImageTypes.map(type => type.startsWith('.') ? type : `.${type}`));
  }
  
  if (libreOfficeEnabled) {
    const legacyTypes = ['.doc', '.ppt', '.xls', '.odt', '.odp', '.ods'];
    supportedUploadFileTypes.push(...legacyTypes);
    supportedByDocumentFileTypes.push(...legacyTypes);
  }

  router.get('/config', (req, res) => {
    res.json({
      maxFileSizeMB,
      maxCloudImportDocs,
      maxCloudImportSizeMB,
      categorizationEnabled,
      piiDetectionEnabled,
      piiDetectionMethod,
      visionEnabled,
      visionModel,
      supportedImageTypes: visionEnabled ? supportedImageTypes : [],
      libreOfficeEnabled,
      supportedUploadFileTypes,
      supportedByDocumentFileTypes
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
