const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const pdf2md = require('@opendocsg/pdf2md');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { PIIDetectorFactory } = require('./services/pii-detector');
const { VisualizationService } = require('./services/visualization-service');
require('dotenv').config({ quiet: true });

// Polyfill Promise.withResolvers for older Node.js versions
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL;
const QDRANT_URL = process.env.QDRANT_URL;
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'documents';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const CATEGORIZATION_MODEL = process.env.CATEGORIZATION_MODEL || '';

if (!EMBEDDING_MODEL) {
  throw new Error('Missing required env var EMBEDDING_MODEL');
}

// PII Detection Configuration
const PII_DETECTION_ENABLED = process.env.PII_DETECTION_ENABLED === 'true';
const PII_DETECTION_METHOD = process.env.PII_DETECTION_METHOD || 'hybrid';
const PII_DETECTION_MODEL = process.env.PII_DETECTION_MODEL || CATEGORIZATION_MODEL || EMBEDDING_MODEL;

// Vision Model Configuration
const VISION_MODEL_ENABLED = process.env.VISION_MODEL_ENABLED === 'true';
const VISION_MODEL = process.env.VISION_MODEL || PII_DETECTION_MODEL;
const DESCRIPTION_MODEL = process.env.DESCRIPTION_MODEL || CATEGORIZATION_MODEL || EMBEDDING_MODEL;
const SUPPORTED_IMAGE_TYPES = process.env.SUPPORTED_IMAGE_TYPES || '.jpg,.jpeg,.png,.gif,.webp,.bmp';
const AUTO_GENERATE_DESCRIPTION = process.env.AUTO_GENERATE_DESCRIPTION !== 'false';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 }
});

// Initialize Qdrant client
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

// State stores + cleanup
const { browseCache, CACHE_TTL, startBrowseCacheCleanup } = require('./state/browse-cache');
startBrowseCacheCleanup();

const { TEMP_FILE_TTL, storeTempFile, getTempFile, startTempFileCleanup } = require('./state/temp-files');
startTempFileCleanup();

const { uploadJobs, createJob } = require('./state/upload-jobs');

// Core services
const { CollectionMetadataService } = require('./services/collections-metadata-service');
const collectionsService = new CollectionMetadataService(qdrantClient);

const { createCollectionMiddleware } = require('./middleware/collection');
const collectionMiddleware = createCollectionMiddleware(collectionsService);

const { createEmbeddingService } = require('./services/embedding-service');
const embeddingService = createEmbeddingService({
  axios,
  ollamaUrl: OLLAMA_URL,
  authToken: AUTH_TOKEN,
  model: EMBEDDING_MODEL
});

const { createCategorizationService } = require('./services/categorization-service');
const categorizationService = createCategorizationService({
  axios,
  ollamaUrl: OLLAMA_URL,
  authToken: AUTH_TOKEN,
  categorizationModel: CATEGORIZATION_MODEL
});

let piiDetector = null;
if (PII_DETECTION_ENABLED) {
  piiDetector = PIIDetectorFactory.create(
    PII_DETECTION_METHOD,
    OLLAMA_URL,
    AUTH_TOKEN,
    PII_DETECTION_MODEL
  );
  console.log(`PII Detection enabled using ${PII_DETECTION_METHOD} method`);
}

const { createPiiService } = require('./services/pii-service');
const piiService = createPiiService({ enabled: PII_DETECTION_ENABLED, detector: piiDetector });

// Vision and Description services
let visionService = null;
let descriptionService = null;

if (VISION_MODEL_ENABLED) {
  const { createVisionService } = require('./services/vision-service');
  visionService = createVisionService({
    axios,
    ollamaUrl: OLLAMA_URL,
    authToken: AUTH_TOKEN,
    visionModel: VISION_MODEL
  });
  console.log(`Vision processing enabled using ${VISION_MODEL}`);
}

const { createDescriptionService } = require('./services/description-service');
descriptionService = createDescriptionService({
  axios,
  ollamaUrl: OLLAMA_URL,
  authToken: AUTH_TOKEN,
  descriptionModel: DESCRIPTION_MODEL
});

// Visualization
const VIZ_CACHE_STRATEGY = process.env.VIZ_CACHE_STRATEGY || 'memory';
const visualizationService = new VisualizationService(qdrantClient, COLLECTION_NAME, VIZ_CACHE_STRATEGY);
console.log(`Visualization cache strategy: ${VIZ_CACHE_STRATEGY}`);

// Document processing
const { createDocumentService } = require('./services/document-service');
const documentService = createDocumentService({
  qdrantClient,
  embeddingService,
  piiService,
  categorizationService,
  visionService,
  descriptionService,
  pdfParse,
  pdf2md,
  mammoth,
  piiDetectionEnabled: PII_DETECTION_ENABLED,
  categorizationModel: CATEGORIZATION_MODEL,
  visionEnabled: VISION_MODEL_ENABLED,
  autoGenerateDescription: AUTO_GENERATE_DESCRIPTION
});

const { pdfToMarkdownViaHtml, processPdfText } = require('./utils/pdf-utils');

// Routes
const { createConfigHealthRoutes } = require('./routes/config-health');
app.use(
  '/api',
  createConfigHealthRoutes({
    maxFileSizeMB: MAX_FILE_SIZE_MB,
    categorizationEnabled: Boolean(CATEGORIZATION_MODEL),
    piiDetectionEnabled: PII_DETECTION_ENABLED,
    piiDetectionMethod: PII_DETECTION_METHOD,
    visionEnabled: VISION_MODEL_ENABLED,
    visionModel: VISION_MODEL,
    supportedImageTypes: SUPPORTED_IMAGE_TYPES.split(','),
    qdrantClient
  })
);

const { createCollectionsRoutes } = require('./routes/collections');
app.use('/api', createCollectionsRoutes({ collectionsService, qdrantClient }));

const { createTempFilesRoutes } = require('./routes/temp-files');
app.use(
  '/api',
  createTempFilesRoutes({
    upload,
    storeTempFile,
    getTempFile,
    tempFileTtlMs: TEMP_FILE_TTL
  })
);

const { createUploadsRoutes } = require('./routes/uploads');
app.use(
  '/api',
  createUploadsRoutes({
    upload,
    collectionMiddleware,
    uploadJobs,
    createJob,
    documentService,
    collectionsService
  })
);

const { createDocumentsRoutes } = require('./routes/documents');
app.use(
  '/api',
  createDocumentsRoutes({
    collectionMiddleware,
    documentService,
    collectionsService,
    qdrantClient
  })
);

const { createSearchRoutes } = require('./routes/search');
app.use(
  '/api',
  createSearchRoutes({
    qdrantClient,
    collectionMiddleware,
    upload,
    embeddingService,
    documentService,
    getTempFile,
    pdfParse,
    pdf2md,
    mammoth,
    pdfToMarkdownViaHtml,
    processPdfText
  })
);

const { createBrowseRoutes } = require('./routes/browse');
app.use(
  '/api',
  createBrowseRoutes({
    qdrantClient,
    collectionMiddleware,
    browseCache,
    cacheTtlMs: CACHE_TTL
  })
);

const { createPiiRoutes } = require('./routes/pii');
app.use(
  '/api',
  createPiiRoutes({
    collectionMiddleware,
    qdrantClient,
    piiDetectionEnabled: PII_DETECTION_ENABLED,
    piiService
  })
);

const { createVisualizationRoutes } = require('./routes/visualization');
app.use(
  '/api',
  createVisualizationRoutes({
    collectionMiddleware,
    visualizationService,
    embeddingService
  })
);

// Start server
async function startServer() {
  try {
    await collectionsService.initialize();
    console.log('✅ Collections metadata service initialized');

    await embeddingService.fetchModelContextSize();

    app.listen(PORT, () => {
      console.log(`🚀 API Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log('🗂️  Collections support enabled');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
