function createCollectionMiddleware(collectionsService) {
  return function collectionMiddleware(req, res, next) {
    try {
      // Get collection ID from query params or use default
      let collectionId = req.query.collection;

      if (!collectionId) {
        // Use default collection
        const defaultCollection = collectionsService.getDefaultCollection();
        if (!defaultCollection) {
          return res.status(500).json({
            error: 'No default collection found. Please create a collection first.'
          });
        }
        collectionId = defaultCollection.collectionId;
      }

      // Resolve collection metadata
      const metadata = collectionsService.getCollection(collectionId);
      if (!metadata) {
        return res.status(404).json({
          error: 'Collection not found',
          code: 'COLLECTION_NOT_FOUND',
          collectionId
        });
      }

      // Attach to request
      req.collection = metadata;
      req.collectionId = collectionId;
      req.qdrantCollection = metadata.qdrantName;

      next();
    } catch (error) {
      console.error('Collection middleware error:', error);
      res.status(500).json({ error: error.message });
    }
  };
}

module.exports = {
  createCollectionMiddleware
};
