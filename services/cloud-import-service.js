const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');

/**
 * Cloud Import Service
 * Handles analysis and downloading of files from cloud storage providers
 */

// Check if Google Drive is enabled
function isGoogleDriveEnabled() {
  return !!process.env.GOOGLE_DRIVE_API_KEY;
}

  function extractGoogleApiErrorDetails(error) {
    const status =
      (typeof error?.code === 'number' ? error.code : null) ??
      (typeof error?.response?.status === 'number' ? error.response.status : null);

    const apiError = error?.response?.data?.error;
    const first = Array.isArray(apiError?.errors) ? apiError.errors[0] : null;

    return {
      status,
      reason: first?.reason || null,
      domain: first?.domain || null,
      message: first?.message || apiError?.message || error?.message || String(error),
      extendedHelp: first?.extendedHelp || null
    };
  }

/**
 * Parse S3 URL into bucket and prefix
 * Supports formats:
 * - https://bucket.s3.amazonaws.com/folder/
 * - https://bucket.s3.region.amazonaws.com/folder/
 * - s3://bucket/folder/
 */
function parseS3Url(url) {
  // Handle s3:// protocol
  if (url.startsWith('s3://')) {
    const match = url.match(/^s3:\/\/([^\/]+)(\/.*)?$/);
    if (!match) {
      throw new Error('Invalid S3 URL format');
    }
    return {
      bucket: match[1],
      prefix: match[2] ? match[2].slice(1) : '' // Remove leading slash
    };
  }

  // Handle https:// URLs
  if (url.startsWith('https://') || url.startsWith('http://')) {
    // Format: https://bucket.s3.amazonaws.com/folder/ or https://bucket.s3.region.amazonaws.com/folder/
    const match = url.match(/^https?:\/\/([^.]+)\.s3(?:[.-]([^.]+))?\.amazonaws\.com\/(.*)/);
    if (!match) {
      throw new Error('Invalid S3 URL format. Expected: https://bucket.s3.amazonaws.com/folder/');
    }
    return {
      bucket: match[1],
      region: match[2] || 'us-east-1',
      prefix: match[3] || ''
    };
  }

  throw new Error('Unsupported URL format. Use s3:// or https://');
}

/**
 * Analyze S3 folder contents with progressive updates
 * Lists all files and returns statistics
 * @param {string} s3Url - S3 bucket URL
 * @param {Object} options - Analysis options
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {AbortSignal} options.abortSignal - Signal to cancel analysis
 * @param {string} retryRegion - Region to retry with (internal)
 */
async function analyzeS3Folder(s3Url, options = {}, retryRegion = null) {
  const {
    onProgress,
    abortSignal,
    resumeFromContinuationToken,
    resumeFiles,
    resumeTotalSize,
    resumeFileTypes,
    resumePagesProcessed
  } = options;
  const { bucket, prefix, region } = parseS3Url(s3Url);

  // Use retry region if provided, otherwise parsed region, otherwise default
  const clientRegion = retryRegion || region || 'us-east-1';

  // Create S3 client with anonymous credentials (for public buckets)
  const s3Client = new S3Client({
    region: clientRegion,
    credentials: {
      accessKeyId: 'anonymous',
      secretAccessKey: 'anonymous'
    },
    // Use unsigned requests for public buckets
    signer: { sign: async (request) => request }
  });

  const files = Array.isArray(resumeFiles) ? [...resumeFiles] : [];
  let continuationToken = resumeFromContinuationToken || null;
  let totalSize = typeof resumeTotalSize === 'number' ? resumeTotalSize : 0;
  const fileTypes = resumeFileTypes && typeof resumeFileTypes === 'object' ? { ...resumeFileTypes } : {};
  let pagesProcessed = typeof resumePagesProcessed === 'number' ? resumePagesProcessed : 0;

  try {
    // List all objects in the bucket/prefix
    do {
      // Check for cancellation before each page
      if (abortSignal && abortSignal.aborted) {
        throw new Error('Analysis cancelled by user');
      }

      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      });

      const response = await s3Client.send(command);

      // Save cursor for resume (next continuation token)
      continuationToken = response.NextContinuationToken || null;

      if (response.Contents) {
        for (const item of response.Contents) {
          // Skip folders (keys ending with /)
          if (item.Key.endsWith('/')) continue;

          const fileName = path.basename(item.Key);
          const fileExt = path.extname(fileName).toLowerCase() || 'unknown';
          
          files.push({
            key: item.Key,
            name: fileName,
            extension: fileExt,
            size: item.Size || 0,
            lastModified: item.LastModified,
            url: `https://${bucket}.s3.amazonaws.com/${item.Key}`
          });

          totalSize += item.Size || 0;
          fileTypes[fileExt] = (fileTypes[fileExt] || 0) + 1;
        }
      }
      pagesProcessed++;

      // Report progress after each page
      if (onProgress) {
        onProgress({
          filesDiscovered: files.length,
          totalSize,
          fileTypes,
          pagesProcessed,
          s3ContinuationToken: continuationToken,
          files: files
        });
      }

    } while (continuationToken);

    return {
      provider: 's3',
      bucket,
      prefix,
      totalFiles: files.length,
      totalSize,
      fileTypes,
      s3ContinuationToken: continuationToken,
      files
    };

  } catch (error) {
    console.error('S3 analysis error:', error);
    
    // Handle region redirect - extract region from endpoint and retry
    if (error.Code === 'PermanentRedirect' && error.Endpoint && !retryRegion) {
      // Extract region from endpoint like "bucket.s3-eu-west-1.amazonaws.com"
      const endpointMatch = error.Endpoint.match(/\.s3[.-]([^.]+)\.amazonaws\.com/);
      if (endpointMatch && endpointMatch[1]) {
        const correctRegion = endpointMatch[1];
        console.log(`Retrying S3 request with correct region: ${correctRegion}`);
        return analyzeS3Folder(s3Url, options, correctRegion);
      }
    }
    
    if (error.name === 'NoSuchBucket') {
      throw new Error('S3 bucket not found or not accessible');
    } else if (error.name === 'AccessDenied') {
      throw new Error('Access denied. Bucket must be publicly accessible.');
    }
    throw new Error(`Failed to analyze S3 folder: ${error.message}`);
  }
}

/**
 * Download file from S3
 * Returns a readable stream
 */
async function downloadS3File(fileInfo, retryRegion = null) {
  const { bucket, region } = parseS3Url(fileInfo.url);

  // Use retry region if provided, otherwise parsed region, otherwise default
  const clientRegion = retryRegion || region || 'us-east-1';

  // Use same configuration as analyzeS3Folder for public buckets
  const s3Client = new S3Client({
    region: clientRegion,
    credentials: {
      accessKeyId: 'anonymous',
      secretAccessKey: 'anonymous'
    },
    // Use unsigned requests for public buckets
    signer: { sign: async (request) => request }
  });

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fileInfo.key
    });

    const response = await s3Client.send(command);
    return response.Body; // This is a readable stream
  } catch (error) {
    // Handle region redirect - extract region from endpoint and retry
    if (error.Code === 'PermanentRedirect' && error.Endpoint && !retryRegion) {
      const endpointMatch = error.Endpoint.match(/\.s3[.-]([^.]+)\.amazonaws\.com/);
      if (endpointMatch && endpointMatch[1]) {
        const correctRegion = endpointMatch[1];
        console.log(`Retrying S3 download with correct region: ${correctRegion}`);
        return downloadS3File(fileInfo, correctRegion);
      }
    }
    
    console.error(`Failed to download ${fileInfo.name}:`, error);
    throw new Error(`Failed to download file: ${error.message}`);
  }
}

/**
 * Parse Google Drive folder URL to extract folder ID
 * Supports formats:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
 */
function parseGoogleDriveFolderUrl(url) {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error('Invalid Google Drive folder URL. Expected: https://drive.google.com/drive/folders/FOLDER_ID');
  }
  return match[1];
}

/**
 * Analyze Google Drive folder contents with progressive updates
 * Lists all files and returns statistics
 * @param {string} shareLink - Google Drive folder share link
 * @param {Object} options - Analysis options
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {AbortSignal} options.abortSignal - Signal to cancel analysis
 */
async function analyzeGoogleDriveFolder(shareLink, options = {}) {
  if (!isGoogleDriveEnabled()) {
    throw new Error('Google Drive API key not configured. Set GOOGLE_DRIVE_API_KEY in .env');
  }

  const {
    onProgress,
    abortSignal,
    resumeFromPageToken,
    resumeFiles,
    resumeTotalSize,
    resumeFileTypes,
    resumePagesProcessed
  } = options;
  const folderId = parseGoogleDriveFolderUrl(shareLink);

  // Initialize Google Drive API with API key
  const drive = google.drive({
    version: 'v3',
    auth: process.env.GOOGLE_DRIVE_API_KEY
  });

  const files = Array.isArray(resumeFiles) ? [...resumeFiles] : [];
  let totalSize = typeof resumeTotalSize === 'number' ? resumeTotalSize : 0;
  const fileTypes = resumeFileTypes && typeof resumeFileTypes === 'object' ? { ...resumeFileTypes } : {};
  let pageToken = resumeFromPageToken || null;
  let pagesProcessed = typeof resumePagesProcessed === 'number' ? resumePagesProcessed : 0;

  try {
    // List all files in the folder
    do {
      // Check for cancellation before each page
      if (abortSignal && abortSignal.aborted) {
        throw new Error('Analysis cancelled by user');
      }

      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
        fields: 'nextPageToken, files(id, name, size, mimeType, modifiedTime, webContentLink)',
        pageSize: 100,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (response.data.files) {
        for (const file of response.data.files) {
          // Skip Google Workspace files (Docs, Sheets, etc.) that can't be directly downloaded
          if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            continue;
          }

          const fileExt = path.extname(file.name).toLowerCase() || 'unknown';
          const fileSize = parseInt(file.size || 0, 10);

          files.push({
            id: file.id,
            name: file.name,
            size: fileSize,
            mimeType: file.mimeType,
            lastModified: file.modifiedTime,
            extension: fileExt
          });

          totalSize += fileSize;
          fileTypes[fileExt] = (fileTypes[fileExt] || 0) + 1;
        }
      }

      pageToken = response.data.nextPageToken;
      pagesProcessed++;

      // Report progress after each page
      if (onProgress) {
        onProgress({
          filesDiscovered: files.length,
          totalSize,
          fileTypes,
          pagesProcessed,
          gdrivePageToken: pageToken || null,
          files: files
        });
      }

    } while (pageToken);

    return {
      provider: 'gdrive',
      folderId,
      totalFiles: files.length,
      totalSize,
      fileTypes,
      gdrivePageToken: pageToken || null,
      files
    };

  } catch (error) {
    console.error('Google Drive analysis error:', error);
    
    const details = extractGoogleApiErrorDetails(error);

    if (details.status === 404) {
      throw new Error('Google Drive folder not found. Make sure the folder exists and the URL is correct.');
    }

    // Google can return 403 for many reasons; distinguish API-disabled from permissions.
    if (details.status === 403 && details.reason === 'accessNotConfigured') {
      throw new Error(
        `Google Drive API is not enabled for your Google Cloud project (accessNotConfigured). ` +
          `Enable the Drive API in Google Cloud Console and retry. Details: ${details.message}`
      );
    }

    if (details.status === 403) {
      throw new Error(
        'Access denied. Folder must be shared as "Anyone with the link can view" (or your API key must have access).'
      );
    }

    if ((details.message || '').toLowerCase().includes('api key')) {
      throw new Error('Invalid Google Drive API key. Check your GOOGLE_DRIVE_API_KEY environment variable.');
    }

    throw new Error(`Failed to analyze Google Drive folder: ${details.message}`);
  }
}

/**
 * Download file from Google Drive
 * Returns a readable stream
 */
async function downloadGoogleDriveFile(fileInfo) {
  if (!isGoogleDriveEnabled()) {
    throw new Error('Google Drive API key not configured');
  }

  const drive = google.drive({
    version: 'v3',
    auth: process.env.GOOGLE_DRIVE_API_KEY
  });

  try {
    const response = await drive.files.get({
      fileId: fileInfo.id,
      alt: 'media',
      supportsAllDrives: true
    }, {
      responseType: 'stream'
    });

    return response.data; // This is a readable stream
  } catch (error) {
    console.error(`Failed to download ${fileInfo.name}:`, error);
    
    const details = extractGoogleApiErrorDetails(error);

    if (details.status === 403 && details.reason === 'accessNotConfigured') {
      throw new Error(
        `Google Drive API is not enabled for your Google Cloud project (accessNotConfigured). ` +
          `Enable the Drive API in Google Cloud Console and retry. Details: ${details.message}`
      );
    }

    if (details.status === 403) {
      throw new Error(`Access denied for file ${fileInfo.name}. File must be publicly accessible.`);
    }

    throw new Error(`Failed to download file: ${details.message}`);
  }
}

module.exports = {
  isGoogleDriveEnabled,
  analyzeS3Folder,
  downloadS3File,
  analyzeGoogleDriveFolder,
  downloadGoogleDriveFile
};
