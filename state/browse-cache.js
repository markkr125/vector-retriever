const browseCache = new Map();

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function startBrowseCacheCleanup({ ttlMs = CACHE_TTL, intervalMs = 2 * 60 * 1000, logger = console } = {}) {
  // Cleanup expired cache entries
  return setInterval(() => {
    const now = Date.now();
    for (const [key, value] of browseCache.entries()) {
      if (now - value.timestamp > ttlMs) {
        browseCache.delete(key);
        logger.log(`Cleaned up expired browse cache: ${key}`);
      }
    }
  }, intervalMs);
}

module.exports = {
  browseCache,
  CACHE_TTL,
  startBrowseCacheCleanup
};
