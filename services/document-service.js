const { parseMetadataFromContent } = require('../utils/metadata');
const { pdfToMarkdownViaHtml, processPdfText } = require('../utils/pdf-utils');
const { getSparseVector, simpleHash } = require('../utils/text-utils');

function createDocumentService({
  qdrantClient,
  embeddingService,
  piiService,
  categorizationService,
  visionService,
  descriptionService,
  pdfParse,
  pdf2md,
  mammoth,
  piiDetectionEnabled,
  categorizationModel,
  visionEnabled
}) {
  async function processSingleFile(file, collectionName, autoCategorize = false) {
    // Decode base64-encoded filename (used to preserve UTF-8 for Hebrew/Arabic/etc)
    let filename = file.originalname;

    // Note: For multiple file upload, filename_encoded should be per-file
    // For now, we'll use the originalname directly and handle encoding in the client
    if (/[\x80-\xFF]/.test(filename)) {
      // Fallback: try to decode if contains non-ASCII
      try {
        const decoded = Buffer.from(filename, 'latin1').toString('utf8');
        if (!decoded.includes('\uFFFD')) {
          filename = decoded;
        }
      } catch (e) {
        console.warn('Failed to decode filename:', e.message);
      }
    }

    const fileExt = filename.split('.').pop().toLowerCase();

    console.log(`Processing file: ${filename} (${fileExt})`);

    let content = '';
    let metadata = {};

    // Parse file based on type
    switch (fileExt) {
      case 'txt':
        content = file.buffer.toString('utf8');
        break;

      case 'json':
        const jsonData = JSON.parse(file.buffer.toString('utf8'));
        // If JSON has content field, use it; otherwise stringify
        content = jsonData.content || JSON.stringify(jsonData, null, 2);
        // Extract metadata from JSON if present
        if (jsonData.metadata) metadata = jsonData.metadata;
        if (jsonData.category) metadata.category = jsonData.category;
        if (jsonData.location) metadata.location = jsonData.location;
        if (jsonData.tags) metadata.tags = jsonData.tags;
        break;

      case 'pdf':
        // Try PDF.js → HTML → Markdown approach
        console.log('Converting PDF using HTML intermediate format...');

        try {
          content = await pdfToMarkdownViaHtml(file.buffer);
          console.log('✓ PDF converted via HTML → Markdown successfully');
        } catch (htmlError) {
          console.warn('PDF via HTML conversion failed, trying @opendocsg/pdf2md:', htmlError.message);

          // Fallback 1: Try @opendocsg/pdf2md
          try {
            content = await pdf2md(file.buffer);
            console.log('✓ PDF converted with @opendocsg/pdf2md');
          } catch (pdf2mdError) {
            console.warn('pdf2md failed, using custom text processing:', pdf2mdError.message);

            // Fallback 2: Basic text extraction with processing
            const pdfData = await pdfParse(file.buffer);
            content = processPdfText(pdfData.text);
            console.log('✓ PDF processed with basic text extraction');
          }
        }

        // Get page count
        const pdfData = await pdfParse(file.buffer);
        metadata.pages = pdfData.numpages;
        break;

      case 'docx':
        // Convert to markdown to preserve headings, lists, tables, etc.
        const docxResult = await mammoth.convertToMarkdown({ buffer: file.buffer });
        content = docxResult.value;
        console.log('DOCX converted to markdown successfully');
        break;

      case 'doc':
        // Note: .doc files are harder to parse, mammoth primarily supports .docx
        // Attempting to parse as docx format and convert to markdown
        const docResult = await mammoth.convertToMarkdown({ buffer: file.buffer });
        content = docResult.value;
        console.log('DOC converted to markdown successfully');
        break;

      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'bmp':
        // Process image with vision model
        if (!visionEnabled || !visionService) {
          throw new Error('Vision processing is not enabled. Set VISION_MODEL_ENABLED=true in .env');
        }

        console.log('Processing image with vision model...');
        const mimeType = fileExt === 'jpg' ? 'image/jpeg' : `image/${fileExt}`;
        const visionResult = await visionService.processImage(file.buffer, mimeType);

        // Use extracted markdown content as document content
        content = visionResult.markdownContent;

        // Store vision-specific metadata
        metadata.detected_language = visionResult.language;
        metadata.description = visionResult.description;
        metadata.document_type = 'image';
        metadata.vision_processed = true;

        // Optionally store base64 image for future regeneration
        // metadata.image_data = file.buffer.toString('base64');

        console.log(`✓ Image processed: ${visionResult.language} detected`);
        break;

      default:
        throw new Error(`Unsupported file type: ${fileExt}. Supported: txt, json, pdf, docx, doc${visionEnabled ? ', jpg, jpeg, png, gif, webp, bmp' : ''}`);
    }

    if (!content || content.trim().length === 0) {
      throw new Error('File is empty or could not extract content');
    }

    // PII Detection - scan for sensitive information
    if (piiDetectionEnabled) {
      console.log('Scanning for PII...');
      const piiStartTime = Date.now();
      const piiResult = await piiService.detectPII(content);
      const piiDuration = ((Date.now() - piiStartTime) / 1000).toFixed(2);

      if (piiResult.hasPII) {
        metadata.pii_detected = true;
        metadata.pii_types = piiResult.piiTypes;
        metadata.pii_details = piiResult.piiDetails;
        metadata.pii_risk_level = piiResult.riskLevel;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        metadata.pii_detection_method = piiResult.detectionMethod;

        console.log(`⚠️  PII detected: ${piiResult.piiTypes.join(', ')} (${piiResult.piiDetails.length} items) [${piiDuration}s]`);
      } else {
        metadata.pii_detected = false;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        console.log(`✓ No PII detected [${piiDuration}s]`);
      }
    }

    // Automatic categorization if enabled and requested
    if (categorizationModel && autoCategorize) {
      console.log('Automatic categorization requested...');
      const catStartTime = Date.now();
      const extracted = await categorizationService.categorizeDocument(content);
      const catDuration = ((Date.now() - catStartTime) / 1000).toFixed(2);
      metadata = { ...metadata, ...extracted };
      console.log(`Categorization complete [${catDuration}s]:`, extracted);
    }

    // Parse metadata from content if it's structured
    const parsedMetadata = parseMetadataFromContent(filename, content, metadata);
    parsedMetadata.file_type = fileExt;

    // Get dense embedding
    const estimatedTokens = embeddingService.estimateTokenCount(content);
    console.log(`Generating embedding for ${filename} (${content.length} chars, ~${estimatedTokens} tokens)...`);

    // Check if content exceeds model's context limit
    if (estimatedTokens > embeddingService.getModelMaxContextTokens()) {
      const errorMsg = `Document too large: ${estimatedTokens} tokens exceeds model limit of ${embeddingService.getModelMaxContextTokens()} tokens`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const embeddingStartTime = Date.now();
    const denseEmbedding = await embeddingService.getDenseEmbedding(content);
    const embeddingDuration = ((Date.now() - embeddingStartTime) / 1000).toFixed(2);
    if (!denseEmbedding) {
      throw new Error('Failed to generate embedding');
    }
    console.log(`✓ Embedding generated successfully (${embeddingDuration}s)`);

    // Generate sparse vector
    const sparseVector = getSparseVector(content);

    // Create point ID from filename and timestamp
    const pointId = simpleHash(filename + Date.now());

    // Store in Qdrant
    await qdrantClient.upsert(collectionName, {
      points: [
        {
          id: pointId,
          vector: {
            dense: denseEmbedding,
            sparse: sparseVector
          },
          payload: {
            ...parsedMetadata,
            content: content,
            added_at: new Date().toISOString()
          }
        }
      ]
    });

    console.log(`✅ Successfully uploaded: ${filename}`);

    return {
      filename,
      id: pointId,
      fileType: fileExt,
      contentLength: content.length,
      metadata: parsedMetadata
    };
  }

  async function addDocument({ collectionName, filename, content, metadata = {} }) {
    console.log(`Adding document: ${filename}`);

    // PII Detection - scan for sensitive information
    if (piiDetectionEnabled) {
      console.log('Scanning for PII...');
      const piiResult = await piiService.detectPII(content);

      if (piiResult.hasPII) {
        metadata.pii_detected = true;
        metadata.pii_types = piiResult.piiTypes;
        metadata.pii_details = piiResult.piiDetails;
        metadata.pii_risk_level = piiResult.riskLevel;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        metadata.pii_detection_method = piiResult.detectionMethod;

        console.log(`⚠️  PII detected: ${piiResult.piiTypes.join(', ')} (${piiResult.piiDetails.length} items)`);
      } else {
        metadata.pii_detected = false;
        metadata.pii_scan_date = piiResult.scanTimestamp;
        console.log('✓ No PII detected');
      }
    }

    // Parse metadata from content
    const parsedMetadata = parseMetadataFromContent(filename, content, metadata);

    // Get dense embedding
    const denseEmbedding = await embeddingService.getDenseEmbedding(content);
    if (!denseEmbedding) {
      throw new Error('Failed to generate embedding');
    }

    // Generate sparse vector
    const sparseVector = getSparseVector(content);

    // Create point ID from filename
    const pointId = simpleHash(filename + Date.now());

    // Store in Qdrant
    await qdrantClient.upsert(collectionName, {
      points: [
        {
          id: pointId,
          vector: {
            dense: denseEmbedding,
            sparse: sparseVector
          },
          payload: {
            ...parsedMetadata,
            content: content,
            added_at: new Date().toISOString()
          }
        }
      ]
    });

    console.log(`✅ Successfully added: ${filename}`);

    return { pointId, parsedMetadata };
  }

  async function extractContentForSearchByDocument({ fileBuffer, filename }) {
    let content = '';
    const fileExt = filename.split('.').pop().toLowerCase();

    if (fileExt === 'txt' || fileExt === 'md') {
      content = fileBuffer.toString('utf-8');
    } else if (fileExt === 'pdf') {
      // Use the same PDF extraction logic as the main upload
      try {
        content = await pdfToMarkdownViaHtml(fileBuffer);
      } catch (htmlError) {
        console.warn('PDF via HTML conversion failed, trying @opendocsg/pdf2md:', htmlError.message);
        try {
          content = await pdf2md(fileBuffer);
        } catch (pdf2mdError) {
          console.warn('pdf2md failed, using basic text extraction:', pdf2mdError.message);
          const pdfData = await pdfParse(fileBuffer);
          content = processPdfText(pdfData.text);
        }
      }
    } else if (fileExt === 'docx') {
      // Use markdown conversion for better structure preservation
      const result = await mammoth.convertToMarkdown({ buffer: fileBuffer });
      content = result.value;
    } else {
      const err = new Error(`Unsupported file type: ${fileExt}. Supported: txt, md, pdf, docx`);
      err.code = 'UNSUPPORTED_FILE_TYPE';
      throw err;
    }

    return { content, fileExt };
  }

  return {
    processSingleFile,
    addDocument,
    extractContentForSearchByDocument,
    visionService,
    descriptionService
  };
}

module.exports = {
  createDocumentService
};
