const express = require('express');
const { countFilteredDocuments } = require('../services/qdrant-utils');
const { getSparseVector } = require('../utils/text-utils');

function createSearchRoutes({
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
}) {
  const router = express.Router();

  // Semantic search (dense vectors only)
  router.post('/search/semantic', collectionMiddleware, async (req, res) => {
    try {
      const { query, limit = 10, offset = 0, filters, documentIds } = req.body;

      // Debug: Log filters
      if (filters) {
        console.log('Semantic search filters:', JSON.stringify(filters, null, 2));
      }
      if (documentIds) {
        console.log('Semantic search documentIds:', documentIds);
      }

      let results;
      let totalEstimate;

      // If no query provided, do a filtered scroll instead of vector search
      if (!query || query.trim() === '') {
        const scrollParams = {
          limit: parseInt(limit),
          offset: parseInt(offset),
          with_payload: true
        };

        // Build filter with documentIds if provided
        let effectiveFilters = filters;
        if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
          if (!effectiveFilters) {
            effectiveFilters = { must: [] };
          } else if (!effectiveFilters.must) {
            effectiveFilters = { ...effectiveFilters, must: [] };
          } else {
            effectiveFilters = { ...effectiveFilters, must: [...effectiveFilters.must] };
          }
          effectiveFilters.must.push({ has_id: documentIds });
        }

        if (effectiveFilters) {
          // Special handling for never_scanned filter - need to do client-side filtering
          const hasNeverScannedFilter = effectiveFilters.must_not &&
            effectiveFilters.must_not.some(f => f.key === 'pii_detected');

          if (hasNeverScannedFilter) {
            // Can't filter for missing fields in Qdrant, so fetch all and filter
            const allResults = [];
            let scrollOffset = null;
            let hasMore = true;

            while (hasMore) {
              const scrollResult = await qdrantClient.scroll(req.qdrantCollection, {
                limit: 100,
                offset: scrollOffset,
                with_payload: true,
                filter: effectiveFilters.must ? { must: effectiveFilters.must } : undefined // Apply other filters
              });

              scrollResult.points.forEach(p => {
                // Check if pii_detected field is missing
                if (p.payload.pii_detected === undefined) {
                  allResults.push(p);
                }
              });

              scrollOffset = scrollResult.next_page_offset;
              hasMore = scrollOffset !== null && scrollOffset !== undefined;
            }

            // Paginate results
            const startIdx = parseInt(offset);
            const endIdx = startIdx + parseInt(limit);
            results = allResults.slice(startIdx, endIdx).map(p => ({
              id: p.id,
              score: 1.0,
              payload: p.payload
            }));

            totalEstimate = allResults.length;
          } else {
            scrollParams.filter = effectiveFilters;
            const scrollResults = await qdrantClient.scroll(req.qdrantCollection, scrollParams);
            results = scrollResults.points.map(p => ({
              id: p.id,
              score: 1.0,
              payload: p.payload
            }));
            totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, effectiveFilters);
          }
        } else {
          const scrollResults = await qdrantClient.scroll(req.qdrantCollection, scrollParams);
          results = scrollResults.points.map(p => ({
            id: p.id,
            score: 1.0,
            payload: p.payload
          }));
          totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, filters);
        }
      } else {
        // Normal vector search
        const queryEmbedding = await embeddingService.getDenseEmbedding(query);

        const searchParams = {
          vector: {
            name: 'dense',
            vector: queryEmbedding
          },
          limit: parseInt(limit),
          offset: parseInt(offset),
          with_payload: true
        };

        // Build filter with documentIds if provided
        let effectiveFilters = filters;
        if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
          if (!effectiveFilters) {
            effectiveFilters = { must: [] };
          } else if (!effectiveFilters.must) {
            effectiveFilters = { ...effectiveFilters, must: [] };
          } else {
            effectiveFilters = { ...effectiveFilters, must: [...effectiveFilters.must] };
          }
          effectiveFilters.must.push({ has_id: documentIds });
        }

        if (effectiveFilters) {
          const hasNeverScannedFilter = effectiveFilters.must_not &&
            effectiveFilters.must_not.some(f => f.key === 'pii_detected');

          if (hasNeverScannedFilter) {
            // For never_scanned with vector search, get more results then filter
            const largeSearchParams = {
              ...searchParams,
              limit: 1000,
              filter: effectiveFilters.must ? { must: effectiveFilters.must } : undefined
            };

            const allResults = await qdrantClient.search(req.qdrantCollection, largeSearchParams);
            const filteredResults = allResults.filter(r => r.payload.pii_detected === undefined);

            const startIdx = parseInt(offset);
            const endIdx = startIdx + parseInt(limit);
            results = filteredResults.slice(startIdx, endIdx).map(r => ({
              id: r.id,
              score: r.score,
              payload: r.payload
            }));

            totalEstimate = filteredResults.length;
          } else {
            searchParams.filter = effectiveFilters;
            const searchResults = await qdrantClient.search(req.qdrantCollection, searchParams);
            results = searchResults.map(r => ({
              id: r.id,
              score: r.score,
              payload: r.payload
            }));
            totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, effectiveFilters);
          }
        } else if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
          // No filters but documentIds provided
          searchParams.filter = {
            must: [{ has_id: documentIds }]
          };
          const searchResults = await qdrantClient.search(req.qdrantCollection, searchParams);
          results = searchResults.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload
          }));
          totalEstimate = documentIds.length; // Rough estimate
        } else {
          const searchResults = await qdrantClient.search(req.qdrantCollection, searchParams);
          results = searchResults.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload
          }));
          totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, null);
        }
      }

      res.json({
        query: query || '(filtered)',
        searchType: 'semantic',
        total: totalEstimate,
        results
      });
    } catch (error) {
      console.error('Semantic search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Hybrid search (dense + sparse vectors)
  router.post('/search/hybrid', collectionMiddleware, async (req, res) => {
    try {
      const { query, limit = 10, offset = 0, denseWeight = 0.7, filters, documentIds } = req.body;

      // Debug: Log filters
      if (filters) {
        // console.log('Hybrid search filters:', JSON.stringify(filters, null, 2));
      }
      if (documentIds) {
        // console.log('Hybrid search documentIds:', documentIds);
      }

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const denseEmbedding = await embeddingService.getDenseEmbedding(query);
      const sparseVector = getSparseVector(query);

      const searchParams = {
        vector: {
          name: 'dense',
          vector: denseEmbedding
        },
        sparse_vector: {
          name: 'sparse',
          vector: sparseVector
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
        with_payload: true
      };

      // Apply filters directly if in Qdrant format, otherwise build them
      if (filters) {
        // Check if filters are already in Qdrant format (has 'must' array)
        if (filters.must && Array.isArray(filters.must)) {
          searchParams.filter = filters;
        } else {
          // Legacy format: build filters from flat object
          const qdrantFilter = { must: [] };

          if (filters.category) {
            qdrantFilter.must.push({
              key: 'category',
              match: { value: filters.category }
            });
          }

          if (filters.location) {
            qdrantFilter.must.push({
              key: 'location',
              match: { value: filters.location }
            });
          }

          if (filters.tags && filters.tags.length > 0) {
            qdrantFilter.must.push({
              key: 'tags',
              match: { any: filters.tags }
            });
          }

          if (filters.pii_detected !== undefined) {
            qdrantFilter.must.push({
              key: 'pii_detected',
              match: { value: filters.pii_detected }
            });
          }

          if (filters.pii_types && filters.pii_types.length > 0) {
            qdrantFilter.must.push({
              key: 'pii_types',
              match: { any: filters.pii_types }
            });
          }

          if (filters.pii_risk_level) {
            qdrantFilter.must.push({
              key: 'pii_risk_level',
              match: { value: filters.pii_risk_level }
            });
          }

          // Add document IDs filter if provided
          if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
            qdrantFilter.must.push({
              has_id: documentIds
            });
          }

          if (qdrantFilter.must.length > 0) {
            searchParams.filter = qdrantFilter;
          }
        }

        // If filters already in Qdrant format - add documentIds if provided
        if (filters && filters.must && Array.isArray(filters.must)) {
          if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
            searchParams.filter.must.push({
              has_id: documentIds
            });
          }
        }
      } else if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
        // No filters but documentIds provided
        searchParams.filter = {
          must: [{
            has_id: documentIds
          }]
        };
      }

      // Special handling for never_scanned filter with vector search
      const hasNeverScannedFilter = filters && filters.must_not &&
        filters.must_not.some(f => f.key === 'pii_detected');

      if (hasNeverScannedFilter) {
        // For never_scanned with vector search, we need to search all then filter
        // This is less efficient but necessary since Qdrant can't filter on missing fields
        const largeSearchParams = {
          ...searchParams,
          limit: 1000, // Get more results to filter
          filter: filters.must ? { must: filters.must } : undefined
        };

        const allResults = await qdrantClient.search(req.qdrantCollection, largeSearchParams);

        // Filter out documents that have pii_detected field
        const filteredResults = allResults.filter(r => r.payload.pii_detected === undefined);

        // Paginate
        const startIdx = parseInt(offset);
        const endIdx = startIdx + parseInt(limit);
        const results = filteredResults.slice(startIdx, endIdx);

        const totalEstimate = filteredResults.length;

        res.json({
          query,
          searchType: 'hybrid',
          denseWeight,
          total: totalEstimate,
          results: results.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload
          }))
        });
      } else {
        const results = await qdrantClient.search(req.qdrantCollection, searchParams);

        // Get total count with filter (may be null if count fails/times out)
        const totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, searchParams.filter);

        res.json({
          query,
          searchType: 'hybrid',
          denseWeight,
          total: totalEstimate !== null ? totalEstimate : results.length, // Fallback to results length
          results: results.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload
          }))
        });
      }
    } catch (error) {
      console.error('Hybrid search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Location-based search
  router.post('/search/location', collectionMiddleware, async (req, res) => {
    try {
      const { query, location, limit = 10, offset = 0 } = req.body;

      if (!query || !location) {
        return res.status(400).json({ error: 'Query and location are required' });
      }

      const queryEmbedding = await embeddingService.getDenseEmbedding(query);

      const results = await qdrantClient.search(req.qdrantCollection, {
        vector: {
          name: 'dense',
          vector: queryEmbedding
        },
        filter: {
          must: [
            { key: 'location', match: { value: location } }
          ]
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
        with_payload: true
      });

      res.json({
        query,
        location,
        searchType: 'location',
        total: results.length,
        results: results.map(r => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }))
      });
    } catch (error) {
      console.error('Location search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Geo-radius search
  router.post('/search/geo', collectionMiddleware, async (req, res) => {
    try {
      const { query, latitude, longitude, radius, limit = 10, offset = 0 } = req.body;

      if (!query || latitude === undefined || longitude === undefined || !radius) {
        return res.status(400).json({
          error: 'Query, latitude, longitude, and radius are required'
        });
      }

      const queryEmbedding = await embeddingService.getDenseEmbedding(query);

      const results = await qdrantClient.search(req.qdrantCollection, {
        vector: {
          name: 'dense',
          vector: queryEmbedding
        },
        filter: {
          must: [
            {
              key: 'coordinates',
              geo_radius: {
                center: {
                  lat: parseFloat(latitude),
                  lon: parseFloat(longitude)
                },
                radius: parseFloat(radius)
              }
            }
          ]
        },
        limit: parseInt(limit),
        offset: parseInt(offset),
        with_payload: true
      });

      res.json({
        query,
        center: { latitude, longitude },
        radius,
        searchType: 'geo',
        total: results.length,
        results: results.map(r => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }))
      });
    } catch (error) {
      console.error('Geo search error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Recommendation (find similar)
  router.post('/recommend', collectionMiddleware, async (req, res) => {
    try {
      const { documentId, limit = 10, offset = 0 } = req.body;

      if (!documentId) {
        return res.status(400).json({ error: 'Document ID is required' });
      }

      // Convert documentId to number if it's a numeric string
      const pointId = isNaN(documentId) ? documentId : parseInt(documentId, 10);

      // First, get total count of similar documents (fetch with high limit to count)
      const allSimilar = await qdrantClient.recommend(req.qdrantCollection, {
        positive: [pointId],
        limit: 100,
        with_payload: false,
        with_vector: false,
        using: 'dense'
      });

      const totalSimilar = allSimilar.length;

      // Now fetch the paginated results with payload
      const totalToFetch = parseInt(limit) + parseInt(offset);
      const results = await qdrantClient.recommend(req.qdrantCollection, {
        positive: [pointId],
        limit: totalToFetch,
        with_payload: true,
        using: 'dense'
      });

      // Slice results to apply offset and limit
      const offsetNum = parseInt(offset);
      const limitNum = parseInt(limit);
      const paginatedResults = results.slice(offsetNum, offsetNum + limitNum);

      res.json({
        documentId,
        searchType: 'recommendation',
        total: totalSimilar,
        results: paginatedResults.map(r => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }))
      });
    } catch (error) {
      console.error('Recommendation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search by document
  router.post('/search/by-document', collectionMiddleware, upload.single('file'), async (req, res) => {
    try {
      const limit = parseInt(req.body.limit) || 10;
      const offset = parseInt(req.body.offset) || 0;
      const tempFileId = req.body.tempFileId;

      let fileBuffer;
      let filename;

      // Check if using temp file ID or direct upload
      if (tempFileId) {
        const tempFile = getTempFile(tempFileId);
        if (!tempFile) {
          return res.status(404).json({
            error: 'File not found or expired',
            message: 'The uploaded file has expired. Please re-upload to search again.',
            code: 'TEMP_FILE_EXPIRED'
          });
        }
        fileBuffer = tempFile.buffer;
        filename = tempFile.filename;
        console.log(`Using temp file for search: ${tempFileId} (${filename})`);
      } else if (req.file) {
        fileBuffer = req.file.buffer;
        filename = req.file.originalname;
        console.log(`Processing uploaded file for search: ${filename}`);
      } else {
        return res.status(400).json({
          error: 'No file uploaded or temp file ID provided',
          message: 'Please provide either a file or a tempFileId'
        });
      }

      // Extract text from the file
      let content = '';
      const fileExt = filename.split('.').pop().toLowerCase();

      try {
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
          return res.status(400).json({
            error: `Unsupported file type: ${fileExt}. Supported: txt, md, pdf, docx`
          });
        }
      } catch (extractError) {
        console.error('Text extraction error:', extractError);
        return res.status(500).json({
          error: 'Failed to extract text from file',
          details: extractError.message
        });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'No text content found in file' });
      }

      console.log(`Extracted ${content.length} characters from ${filename}`);

      // Generate embedding for the content
      let embedding;
      try {
        embedding = await embeddingService.getDenseEmbedding(content);
        if (!embedding) {
          throw new Error('Failed to generate embedding');
        }
      } catch (embeddingError) {
        console.error('Embedding generation error:', embeddingError);
        return res.status(500).json({
          error: 'Failed to generate embedding',
          details: embeddingError.message
        });
      }

      // Search for similar documents using the embedding
      const totalToFetch = limit + offset;
      const searchResults = await qdrantClient.search(req.qdrantCollection, {
        vector: {
          name: 'dense',
          vector: embedding
        },
        limit: totalToFetch,
        with_payload: true,
        with_vector: false
      });

      // Apply pagination
      const paginatedResults = searchResults.slice(offset, offset + limit);

      res.json({
        searchType: 'by-document',
        sourceFile: filename,
        contentLength: content.length,
        total: searchResults.length,
        tempFileId: tempFileId || undefined,
        results: paginatedResults.map(r => ({
          id: r.id,
          score: r.score,
          payload: r.payload
        }))
      });

    } catch (error) {
      console.error('Search by document error:', error);
      res.status(500).json({
        error: error.message,
        details: 'Failed to search by document'
      });
    }
  });

  // Random documents
  router.get('/random', collectionMiddleware, async (req, res) => {
    try {
      const { limit = 10, seed, offset = 0 } = req.query;

      // Get collection info to know total count
      const info = await qdrantClient.getCollection(req.qdrantCollection);
      const totalPoints = info.points_count;

      if (totalPoints === 0) {
        return res.json({ results: [], seed: seed || Date.now() });
      }

      const requestedLimit = parseInt(limit);
      const offsetNum = parseInt(offset);

      // Use seed for reproducible randomness (or generate new one)
      const usedSeed = seed ? parseInt(seed) : Date.now();

      // Seeded random number generator (simple LCG)
      const seededRandom = (s) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
      };

      // Fetch more results than needed to randomly sample from
      const fetchLimit = Math.min(totalPoints, requestedLimit * 5);
      const maxOffset = Math.max(0, totalPoints - fetchLimit);
      const randomOffset = Math.floor(seededRandom(usedSeed) * maxOffset);

      console.log(`Random request: seed=${usedSeed}, totalPoints=${totalPoints}, requestedLimit=${requestedLimit}, offset=${offsetNum}, fetchLimit=${fetchLimit}, randomOffset=${randomOffset}`);

      // Use scroll API with random offset
      const results = await qdrantClient.scroll(req.qdrantCollection, {
        limit: fetchLimit,
        offset: randomOffset,
        with_payload: true
      });

      // Seeded shuffle using seed + offset for pagination
      const shuffled = results.points
        .map((r, idx) => ({ r, sort: seededRandom(usedSeed + idx) }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ r }) => r)
        .slice(offsetNum, offsetNum + requestedLimit);

      res.json({
        searchType: 'random',
        total: totalPoints,
        seed: usedSeed,
        results: shuffled.map(r => ({
          id: r.id,
          score: 1.0,
          payload: r.payload
        }))
      });
    } catch (error) {
      console.error('Random documents error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createSearchRoutes
};
