const express = require('express');

function createCollectionsRoutes({ collectionsService, qdrantClient }) {
  const router = express.Router();

  router.get('/collections', async (req, res) => {
    try {
      const collections = collectionsService.getAllCollections();

      // Refresh document counts in background
      for (const collection of collections) {
        collectionsService.refreshDocumentCount(collection.collectionId).catch(err => {
          console.error(`Failed to refresh count for ${collection.collectionId}:`, err);
        });
      }

      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/collections', async (req, res) => {
    try {
      const { displayName, description } = req.body;

      if (!displayName || displayName.trim().length === 0) {
        return res.status(400).json({ error: 'Display name is required' });
      }

      // Validate display name (alphanumeric, spaces, underscores, hyphens)
      if (!/^[a-zA-Z0-9 _-]+$/.test(displayName)) {
        return res.status(400).json({
          error: 'Display name can only contain letters, numbers, spaces, underscores, and hyphens'
        });
      }

      if (displayName.length > 50) {
        return res.status(400).json({ error: 'Display name must be 50 characters or less' });
      }

      // Check for duplicate display name
      const existing = collectionsService.getAllCollections();
      if (existing.some(c => c.displayName.toLowerCase() === displayName.toLowerCase())) {
        return res.status(400).json({ error: 'A collection with this name already exists' });
      }

      const collection = await collectionsService.createCollection({
        displayName,
        description: description || ''
      });

      res.status(201).json(collection);
    } catch (error) {
      console.error('Error creating collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.patch('/collections/:collectionId', async (req, res) => {
    try {
      const { collectionId } = req.params;
      const { displayName, description } = req.body;

      const metadata = collectionsService.getCollection(collectionId);
      if (!metadata) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      if (metadata.isDefault) {
        return res.status(403).json({ error: 'Cannot rename default collection' });
      }

      if (!displayName || displayName.trim().length === 0) {
        return res.status(400).json({ error: 'Display name is required' });
      }

      // Validate display name (alphanumeric, spaces, underscores, hyphens)
      if (!/^[a-zA-Z0-9 _-]+$/.test(displayName)) {
        return res.status(400).json({
          error: 'Display name can only contain letters, numbers, spaces, underscores, and hyphens'
        });
      }

      if (displayName.length > 50) {
        return res.status(400).json({ error: 'Display name must be 50 characters or less' });
      }

      // Check for duplicate display name (excluding current collection)
      const existing = collectionsService.getAllCollections();
      if (existing.some(c => c.collectionId !== collectionId && c.displayName.toLowerCase() === displayName.toLowerCase())) {
        return res.status(400).json({ error: 'A collection with this name already exists' });
      }

      const updated = await collectionsService.renameCollection(collectionId, {
        displayName,
        description
      });

      res.json(updated);
    } catch (error) {
      console.error('Error renaming collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/collections/:collectionId', async (req, res) => {
    try {
      const { collectionId } = req.params;

      const metadata = collectionsService.getCollection(collectionId);
      if (!metadata) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      if (metadata.isDefault) {
        return res.status(403).json({ error: 'Cannot delete default collection' });
      }

      await collectionsService.deleteCollection(collectionId);
      res.json({ message: 'Collection deleted successfully' });
    } catch (error) {
      console.error('Error deleting collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/collections/:collectionId/empty', async (req, res) => {
    try {
      const { collectionId } = req.params;

      const metadata = collectionsService.getCollection(collectionId);
      if (!metadata) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      await collectionsService.emptyCollection(collectionId);
      res.json({ message: 'Collection emptied successfully' });
    } catch (error) {
      console.error('Error emptying collection:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/collections/:collectionId/stats', async (req, res) => {
    try {
      const { collectionId } = req.params;

      const metadata = collectionsService.getCollection(collectionId);
      if (!metadata) {
        return res.status(404).json({ error: 'Collection not found' });
      }

      // Get detailed stats from actual Qdrant collection
      const info = await qdrantClient.getCollection(metadata.qdrantName);

      // Get categories, locations, tags from payload
      const result = await qdrantClient.scroll(metadata.qdrantName, {
        limit: 1000,
        with_payload: ['category', 'location', 'tags', 'has_structured_metadata', 'is_unstructured'],
        with_vector: false
      });

      const categories = new Set();
      const locations = new Set();
      const tags = new Set();
      let structuredCount = 0;
      let unstructuredCount = 0;

      for (const point of result.points) {
        if (point.payload.category) categories.add(point.payload.category);
        if (point.payload.location) locations.add(point.payload.location);
        if (point.payload.tags) {
          for (const tag of point.payload.tags) {
            tags.add(tag);
          }
        }
        if (point.payload.has_structured_metadata) structuredCount++;
        if (point.payload.is_unstructured) unstructuredCount++;
      }

      res.json({
        ...metadata,
        documentCount: info.points_count || 0,
        categories: Array.from(categories),
        locations: Array.from(locations),
        tags: Array.from(tags),
        structuredCount,
        unstructuredCount
      });
    } catch (error) {
      console.error('Error getting collection stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = {
  createCollectionsRoutes
};
