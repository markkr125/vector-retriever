const express = require('express');

function createPiiRoutes({
  collectionMiddleware,
  qdrantClient,
  piiDetectionEnabled,
  piiService
}) {
  const router = express.Router();

  router.post('/documents/:id/scan-pii', collectionMiddleware, async (req, res) => {
    try {
      if (!piiDetectionEnabled) {
        return res.status(400).json({
          success: false,
          error: 'PII detection is not enabled on this server'
        });
      }

      const docId = parseInt(req.params.id);

      // Retrieve document from Qdrant
      const docs = await qdrantClient.retrieve(req.qdrantCollection, {
        ids: [docId],
        with_payload: true,
        with_vector: false
      });

      if (!docs || docs.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Document not found'
        });
      }

      const doc = docs[0];

      console.log(`Scanning document ${doc.payload.filename} for PII...`);

      const piiResult = await piiService.detectPII(doc.payload.content);

      // Update document in Qdrant (only PII fields)
      await qdrantClient.setPayload(req.qdrantCollection, {
        points: [docId],
        payload: {
          pii_detected: piiResult.hasPII,
          pii_types: piiResult.piiTypes || [],
          pii_details: piiResult.piiDetails || [],
          pii_risk_level: piiResult.riskLevel || 'low',
          pii_scan_date: piiResult.scanTimestamp,
          pii_detection_method: piiResult.detectionMethod
        }
      });

      const message = piiResult.hasPII
        ? `⚠️ Found ${piiResult.piiTypes.length} type(s) of sensitive data in ${piiResult.piiDetails.length} location(s)`
        : '✓ No sensitive data detected';

      res.json({
        success: true,
        piiDetected: piiResult.hasPII,
        message: message,
        piiTypes: piiResult.piiTypes,
        riskLevel: piiResult.riskLevel,
        detailsCount: piiResult.piiDetails.length,
        filename: doc.payload.filename
      });

    } catch (error) {
      console.error('PII scan error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  router.post('/documents/scan-all-pii', collectionMiddleware, async (req, res) => {
    try {
      if (!piiDetectionEnabled) {
        return res.status(400).json({
          success: false,
          error: 'PII detection is not enabled on this server'
        });
      }

      let scanned = 0;
      let withPII = 0;
      let errors = 0;
      let skipped = 0;
      const force = req.body.force === true;

      console.log('Starting bulk PII scan...');

      // Stream all documents
      let offset = null;
      let hasMore = true;

      while (hasMore) {
        const scrollResult = await qdrantClient.scroll(req.qdrantCollection, {
          limit: 50,
          with_payload: true,
          with_vector: false,
          offset: offset
        });

        if (!scrollResult.points || scrollResult.points.length === 0) {
          hasMore = false;
          break;
        }

        for (const point of scrollResult.points) {
          // Skip if already scanned and not forced
          if (point.payload.pii_scan_date && !force) {
            const lastScan = new Date(point.payload.pii_scan_date);
            const hoursSinceLastScan = (Date.now() - lastScan) / 1000 / 60 / 60;

            if (hoursSinceLastScan < 24) {
              skipped++;
              continue;
            }
          }

          try {
            console.log(`Scanning: ${point.payload.filename}`);
            const piiResult = await piiService.detectPII(point.payload.content);

            await qdrantClient.setPayload(req.qdrantCollection, {
              points: [point.id],
              payload: {
                pii_detected: piiResult.hasPII,
                pii_types: piiResult.piiTypes || [],
                pii_details: piiResult.piiDetails || [],
                pii_risk_level: piiResult.riskLevel || 'low',
                pii_scan_date: piiResult.scanTimestamp,
                pii_detection_method: piiResult.detectionMethod
              }
            });

            scanned++;
            if (piiResult.hasPII) {
              withPII++;
              console.log(`  ⚠️  Found PII: ${piiResult.piiTypes.join(', ')}`);
            }

          } catch (err) {
            console.error(`Error scanning ${point.id}:`, err.message);
            errors++;
          }
        }

        offset = scrollResult.next_page_offset;
        if (!offset) {
          hasMore = false;
        }
      }

      const message = `Scanned ${scanned} documents, found PII in ${withPII}${skipped > 0 ? ` (skipped ${skipped} recently scanned)` : ''}`;
      console.log(`✓ Bulk scan complete: ${message}`);

      res.json({
        success: true,
        message: message,
        stats: {
          scanned,
          withPII,
          errors,
          skipped,
          percentageWithPII: scanned > 0 ? ((withPII / scanned) * 100).toFixed(1) : 0
        }
      });

    } catch (error) {
      console.error('Bulk scan error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = {
  createPiiRoutes
};
