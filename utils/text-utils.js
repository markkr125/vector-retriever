function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Generate a stable document hash for deduplication.
 * Uses cloud identifiers (s3Key, driveId) if available, otherwise falls back to filename.
 * This ensures consistent IDs across re-uploads of the same file.
 * 
 * @param {string} filename - Base filename
 * @param {string} [s3Key] - S3 object key (e.g., 'folder/subfolder/file.pdf')
 * @param {string} [driveId] - Google Drive file ID
 * @returns {number} Stable hash for document identification
 */
function generateDocumentHash(filename, s3Key = null, driveId = null) {
  // Priority: driveId > s3Key > filename
  // Cloud identifiers are more stable than filenames
  const identifier = driveId || s3Key || filename;
  return simpleHash(identifier);
}

function getSparseVector(text) {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  const tokenFreq = {};
  tokens.forEach(token => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });

  const sparseMap = new Map();

  Object.entries(tokenFreq).forEach(([token, freq]) => {
    const hash = simpleHash(token) % 10000;
    sparseMap.set(hash, (sparseMap.get(hash) || 0) + freq);
  });

  const sortedEntries = Array.from(sparseMap.entries()).sort((a, b) => a[0] - b[0]);
  const indices = sortedEntries.map(([idx]) => idx);
  const values = sortedEntries.map(([, val]) => val);

  return { indices, values };
}

module.exports = {
  simpleHash,
  generateDocumentHash,
  getSparseVector
};
