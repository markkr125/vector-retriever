const express = require('express');

function createBrowseRoutes({
  qdrantClient,
  collectionMiddleware,
  browseCache,
  cacheTtlMs
}) {
  const router = express.Router();

  // Browse
  router.get('/browse', collectionMiddleware, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '20');
      const page = parseInt(req.query.page || '1');
      const sortBy = req.query.sortBy || 'id';
      const sortOrder = req.query.sortOrder || 'asc';
      const sessionId = req.query.sessionId || null;
      const filenameFilter = req.query.filename || '';

      console.log(`Browse request: page=${page}, limit=${limit}, sortBy=${sortBy}, sortOrder=${sortOrder}, filename=${filenameFilter}, sessionId=${sessionId}`);

      // Create cache key based on sort parameters AND filename filter
      const cacheKey = `${sortBy}-${sortOrder}-${filenameFilter}`;
      let sortedIds = null;
      let newSessionId = sessionId;

      // Check if we have a valid cached session
      if (sessionId && browseCache.has(sessionId)) {
        const cached = browseCache.get(sessionId);
        // Verify cache matches current sort settings AND collection AND filename filter
        if (cached.cacheKey === cacheKey &&
            cached.collectionId === req.collectionId &&
            Date.now() - cached.timestamp < cacheTtlMs) {
          sortedIds = cached.ids;
          console.log(`Using cached browse session: ${sessionId} (${sortedIds.length} documents)`);
        } else {
          console.log(`Cache invalid, expired, or collection mismatch for session: ${sessionId}`);
        }
      }

      // If no valid cache, fetch and sort all document IDs
      if (!sortedIds) {
        console.log('Fetching and caching document IDs...');

        // Fetch all documents with payloads for sorting
        let allPoints = [];
        let nextOffset = null;

        do {
          const scrollResult = await qdrantClient.scroll(req.qdrantCollection, {
            limit: 100,
            offset: nextOffset,
            with_payload: true,
            with_vector: false
          });

          allPoints = allPoints.concat(scrollResult.points);
          nextOffset = scrollResult.next_page_offset;
        } while (nextOffset !== null && nextOffset !== undefined);

        console.log(`Fetched ${allPoints.length} documents for sorting`);

        // Apply filename filter if present (case-insensitive partial match)
        if (filenameFilter) {
          const filterLower = filenameFilter.toLowerCase();
          allPoints = allPoints.filter(point => {
            const filename = point.payload.filename || point.payload.title || '';
            return filename.toLowerCase().includes(filterLower);
          });
          console.log(`After filename filter: ${allPoints.length} documents`);
        }

        // Sort documents based on sortBy parameter
        if (sortBy === 'filename') {
          allPoints.sort((a, b) => {
            const nameA = (a.payload.filename || a.payload.title || '').toLowerCase();
            const nameB = (b.payload.filename || b.payload.title || '').toLowerCase();
            const cmp = nameA.localeCompare(nameB);
            return sortOrder === 'asc' ? cmp : -cmp;
          });
        } else if (sortBy === 'date') {
          allPoints.sort((a, b) => {
            const dateA = a.payload.date || a.payload.created_at || '';
            const dateB = b.payload.date || b.payload.created_at || '';
            const cmp = dateA.localeCompare(dateB);
            return sortOrder === 'asc' ? cmp : -cmp;
          });
        } else if (sortBy === 'category') {
          allPoints.sort((a, b) => {
            const catA = (a.payload.category || '').toLowerCase();
            const catB = (b.payload.category || '').toLowerCase();
            const cmp = catA.localeCompare(catB);
            return sortOrder === 'asc' ? cmp : -cmp;
          });
        } else if (sortBy === 'id') {
          allPoints.sort((a, b) => {
            const idA = String(a.id);
            const idB = String(b.id);
            const cmp = idA.localeCompare(idB, undefined, { numeric: true });
            return sortOrder === 'asc' ? cmp : -cmp;
          });
        }

        // Extract just the IDs for caching
        sortedIds = allPoints.map(p => p.id);

        // Generate new session ID and cache the sorted IDs
        newSessionId = `browse-${req.collectionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        browseCache.set(newSessionId, {
          ids: sortedIds,
          cacheKey: cacheKey,
          collectionId: req.collectionId,
          timestamp: Date.now()
        });

        console.log(`Created new browse session: ${newSessionId}`);
      }

      // Calculate pagination
      const total = sortedIds.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const pageIds = sortedIds.slice(offset, offset + limit);

      console.log(`Retrieving page ${page} (${pageIds.length} documents)`);

      // Retrieve only the documents for this page
      const retrievedPoints = await qdrantClient.retrieve(req.qdrantCollection, {
        ids: pageIds,
        with_payload: true,
        with_vector: false
      });

      // Map retrieved points back to match the sorted order
      const pointsMap = new Map(retrievedPoints.map(p => [String(p.id), p]));
      const results = pageIds.map(id => {
        const point = pointsMap.get(String(id));
        return {
          id: point.id,
          payload: point.payload
        };
      });

      res.json({
        success: true,
        searchType: 'browse',
        sessionId: newSessionId,
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages,
        sortBy: sortBy,
        sortOrder: sortOrder,
        results: results
      });
    } catch (error) {
      console.error('Browse error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Bookmarks
  router.get('/bookmarks', collectionMiddleware, async (req, res) => {
    try {
      const idsParam = req.query.ids || '';
      const ids = idsParam.split(',')
        .map(id => id.trim())
        .filter(id => id)
        .map(id => {
          const num = parseInt(id, 10);
          return isNaN(num) ? id : num;
        });

      if (ids.length === 0) {
        return res.json({ results: [] });
      }

      const points = await qdrantClient.retrieve(req.qdrantCollection, {
        ids: ids,
        with_payload: true,
        with_vector: false
      });

      const results = points.map(point => ({
        id: point.id,
        payload: point.payload
      }));

      res.json({ results });
    } catch (error) {
      console.error('Bookmarks error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stats
  router.get('/stats', collectionMiddleware, async (req, res) => {
    try {
      const info = await qdrantClient.getCollection(req.qdrantCollection);

      // Get sample documents to extract unique values
      const samples = await qdrantClient.scroll(req.qdrantCollection, {
        limit: 100,
        with_payload: true
      });

      const categories = new Set();
      const locations = new Set();
      const allTags = new Set();

      samples.points.forEach(point => {
        if (point.payload.category) categories.add(point.payload.category);
        if (point.payload.location) locations.add(point.payload.location);
        if (point.payload.tags) {
          point.payload.tags.forEach(tag => allTags.add(tag));
        }
      });

      res.json({
        totalDocuments: info.points_count,
        vectorSize: info.config.params.vectors.dense.size,
        categories: Array.from(categories).sort(),
        locations: Array.from(locations).sort(),
        tags: Array.from(allTags).sort()
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Document retrieval
  router.get('/document/:id', collectionMiddleware, async (req, res) => {
    try {
      const { id } = req.params;

      const pointId = isNaN(id) ? id : parseInt(id, 10);

      const points = await qdrantClient.retrieve(req.qdrantCollection, {
        ids: [pointId],
        with_payload: true
      });

      if (points.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json({
        id: points[0].id,
        score: 1.0,
        payload: points[0].payload
      });
    } catch (error) {
      console.error('Document retrieval error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Facets
  router.get('/facets', collectionMiddleware, async (req, res) => {
    try {
      let offset = null;
      const categoryCount = {};
      const locationCount = {};
      const tagCount = {};
      const piiTypeCount = {};
      let totalWithPII = 0;
      let totalNeverScanned = 0;
      const riskLevels = { low: 0, medium: 0, high: 0, critical: 0 };
      let totalPoints = 0;
      let hasMore = true;

      while (hasMore) {
        const scrollResult = await qdrantClient.scroll(req.qdrantCollection, {
          limit: 100,
          offset: offset,
          with_payload: true
        });

        scrollResult.points.forEach(point => {
          totalPoints++;

          // Count categories (including "unstructured" for is_unstructured docs)
          if (point.payload.category) {
            categoryCount[point.payload.category] = (categoryCount[point.payload.category] || 0) + 1;
          } else if (point.payload.is_unstructured === true) {
            // Documents without category but marked as unstructured get "unstructured" category
            categoryCount['unstructured'] = (categoryCount['unstructured'] || 0) + 1;
          }

          if (point.payload.location) {
            locationCount[point.payload.location] = (locationCount[point.payload.location] || 0) + 1;
          }

          if (point.payload.tags && Array.isArray(point.payload.tags)) {
            point.payload.tags.forEach(tag => {
              tagCount[tag] = (tagCount[tag] || 0) + 1;
            });
          }

          // PII aggregation
          if (point.payload.pii_detected === undefined) {
            totalNeverScanned++;
          } else if (point.payload.pii_detected === true) {
            totalWithPII++;

            if (point.payload.pii_risk_level) {
              riskLevels[point.payload.pii_risk_level] = (riskLevels[point.payload.pii_risk_level] || 0) + 1;
            }

            if (point.payload.pii_types && Array.isArray(point.payload.pii_types)) {
              point.payload.pii_types.forEach(type => {
                piiTypeCount[type] = (piiTypeCount[type] || 0) + 1;
              });
            }
          }
        });

        offset = scrollResult.next_page_offset;
        hasMore = offset !== null && offset !== undefined;
      }

      const categories = Object.entries(categoryCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      const locations = Object.entries(locationCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      const tags = Object.entries(tagCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      // Filter PII types to only include documented types from PII_DETECTION.md
      const documentedPIITypes = [
        'credit_card',
        'credit_card_last4',
        'email', 
        'phone',
        'address',
        'name',
        'bank_account',
        'ssn',
        'passport',
        'driver_license',
        'date_of_birth',
        'ip_address',
        'medical'
      ];
      
      const piiTypes = Object.entries(piiTypeCount)
        .filter(([name]) => documentedPIITypes.includes(name))
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // Add "none" count for documents without PII (scanned but clean)
      riskLevels.none = totalPoints - totalWithPII - totalNeverScanned;
      // Add "never_scanned" count
      riskLevels.never_scanned = totalNeverScanned;

      res.json({
        categories,
        locations,
        tags,
        piiStats: {
          total: totalWithPII,
          percentage: totalPoints > 0 ? ((totalWithPII / totalPoints) * 100).toFixed(1) : 0,
          riskLevels
        },
        piiTypes,
        totalDocuments: totalPoints
      });
    } catch (error) {
      console.error('Facets error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createBrowseRoutes
};
