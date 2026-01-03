const tempFiles = new Map();
let tempFileIdCounter = 1;

const TEMP_FILE_TTL = 60 * 60 * 1000; // 1 hour

function generateTempFileId() {
  return `temp_${Date.now()}_${tempFileIdCounter++}`;
}

function storeTempFile(fileBuffer, filename, mimetype) {
  const id = generateTempFileId();
  const expiresAt = Date.now() + TEMP_FILE_TTL;

  tempFiles.set(id, {
    id,
    buffer: fileBuffer,
    filename,
    mimetype,
    uploadedAt: Date.now(),
    expiresAt
  });

  console.log(`Stored temp file: ${id} (${filename}), expires at ${new Date(expiresAt).toISOString()}`);
  return { id, expiresAt };
}

function getTempFile(id) {
  const file = tempFiles.get(id);
  if (!file) return null;

  // Check if expired
  if (Date.now() > file.expiresAt) {
    tempFiles.delete(id);
    console.log(`Temp file expired and removed: ${id}`);
    return null;
  }

  return file;
}

function startTempFileCleanup({ ttlMs = TEMP_FILE_TTL, intervalMs = 10 * 60 * 1000 } = {}) {
  // Cleanup expired temp files
  return setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [id, file] of tempFiles.entries()) {
      if (now > file.expiresAt) {
        tempFiles.delete(id);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired temp files`);
    }
  }, intervalMs);
}

module.exports = {
  TEMP_FILE_TTL,
  tempFiles,
  storeTempFile,
  getTempFile,
  startTempFileCleanup
};
