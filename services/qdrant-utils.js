async function countFilteredDocuments(qdrantClient, collectionName, filters) {
  try {
    if (!filters) {
      const collectionInfo = await qdrantClient.getCollection(collectionName);
      return collectionInfo.points_count;
    }

    // Use count API with filter
    // Note: Qdrant count can be slow with complex filters
    const countResult = await qdrantClient.count(collectionName, {
      filter: filters,
      exact: false // Use approximate count for speed
    });

    return countResult.count;
  } catch (error) {
    console.error('Error counting documents:', error.message);
    // Return null to indicate count failed - frontend can handle this
    return null;
  }
}

module.exports = {
  countFilteredDocuments
};
