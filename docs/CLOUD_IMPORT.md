# Cloud Import Feature

Import documents directly from cloud storage providers (AWS S3, Google Drive) into your vector database with full processing pipeline integration.

## Table of Contents
- [Overview](#overview)
- [Supported Providers](#supported-providers)
- [Getting Started](#getting-started)
- [Pause & Resume Analysis](#pause--resume-analysis)
- [AWS S3 Import](#aws-s3-import)
- [Google Drive Import](#google-drive-import)
- [Import Options](#import-options)
- [File Selection](#file-selection)
- [Progress Tracking](#progress-tracking)
- [Processing Pipeline](#processing-pipeline)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

## Overview

The Cloud Import feature allows you to:
- 📦 Import documents from public S3 buckets/folders
- 📁 Import from public Google Drive folders (optional, requires API key)
- 📊 Analyze folders before importing (file count, size, types)
- 🎯 Select specific files with advanced filters
- ⚙️ Full processing pipeline integration (embedding, PII detection, categorization)
- 📈 Real-time progress tracking

## Supported Providers

### AWS S3
- ✅ **Status**: Fully supported
- 🔓 **Authentication**: Anonymous access (public buckets only)
- 📝 **URL Formats**: 
  - `https://bucket-name.s3.amazonaws.com/folder/`
  - `https://bucket-name.s3.region.amazonaws.com/folder/`
  - `s3://bucket-name/folder/`

### Google Drive
- ✅ **Status**: Fully supported (optional, requires API key)
- 🔑 **Authentication**: Requires Google Drive API key
- 📝 **URL Format**: `https://drive.google.com/drive/folders/FOLDER_ID`
- ⚠️ **Note**: Skips Google Workspace files (Docs, Sheets, Slides) - only downloads binary files

## Getting Started

### 1. Access Cloud Import

In the web UI:
1. Click **"Add Document"** button
2. Select **"☁️ Cloud Import"** tab
3. Choose your cloud provider (S3 or Google Drive)

### 2. Analyze Folder

1. Enter your cloud storage URL
2. Click **"🔍 Analyze Folder"**
3. (Optional) Click **"⏸️ Pause & Use Current Results"** to stop early and use partial results
4. (Optional) Click **"🛑 Cancel Analysis"** to stop and discard progress
5. Review folder statistics:
   - Total files
   - Total size
   - File type breakdown

**Note:** Analysis runs as a background job and streams progress into the modal. It does not block the UI.

## Pause & Resume Analysis

Long-running folder analysis supports pausing and resuming from the last cursor.

**What pausing does**
- Stops the analysis worker via `AbortController`.
- Keeps partial counts and discovered files in memory (server-side) so the UI can proceed.
- Leaves a resumable job that can be continued shortly after.

**What resuming does**
- Reuses the same analysis job ID.
- Continues listing from the last cursor token:
   - S3: `NextContinuationToken`
   - Google Drive: `nextPageToken`
- Preserves previously accumulated stats (e.g. `fileTypes`) so the UI does not “forget” what it already found.

**TTL / persistence**
- Resume works for the same provider+URL within ~5–10 minutes.
- Resume state is in-memory only (server restart clears it).

### 3. Choose Import Option

Select how you want to import:
- **Import all files** - Bulk import entire folder
- **Import first X files** - Test with limited sample
- **Select specific files** - Advanced filtering and selection

### 4. Start Import

1. Optionally enable **"🤖 Auto-categorize using AI"**
2. Click **"📄 Add Document"**
3. Monitor progress in the upload progress modal

## AWS S3 Import

### Requirements
- Public S3 bucket with list permissions
- Files must be readable without authentication

### Supported URL Formats

```bash
# Standard format
https://my-bucket.s3.amazonaws.com/documents/

# Regional format
https://my-bucket.s3.us-east-1.amazonaws.com/data/

# S3 protocol (converted automatically)
s3://my-bucket/folder/
```

### Example Workflow

1. **Enter S3 URL**:
   ```
   https://my-public-bucket.s3.amazonaws.com/research-papers/
   ```

2. **Analyze Results**:
   ```
   Total Files: 127
   Total Size: 45.2 MB
   
   File Types:
   - .pdf: 98 files
   - .txt: 24 files
   - .docx: 5 files
   ```

3. **Select Import Option**:
   - Option A: Import all 127 files
   - Option B: Import first 10 files (testing)
   - Option C: Select specific PDFs only

4. **Import Progress**:
   ```
   Processing: research-paper-001.pdf
   ✅ research-paper-001.pdf (12.3 MB)
   ✅ research-paper-002.pdf (8.7 MB)
   ⏳ research-paper-003.pdf (15.1 MB)
   ⏱️ research-paper-004.pdf (pending)
   ```

## Google Drive Import

### Setup (Required for Google Drive)

1. **Get API Key**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project (or use existing)
   - Enable **Google Drive API**:
     - Navigate to "APIs & Services" > "Library"
     - Search for "Google Drive API"
     - Click "Enable"
   - Create credentials:
     - Go to "APIs & Services" > "Credentials"
     - Click "Create Credentials" > "API Key"
     - Copy the API key
     - **Optional**: Restrict the key to Google Drive API for security

2. **Share Your Folder**:
   - Open Google Drive
   - Right-click folder → "Share"
   - Change to "Anyone with the link" can **view**
   - Copy the folder link

3. **Configure Environment**:
   ```env
   GOOGLE_DRIVE_API_KEY=AIzaSyC_your_api_key_here
   ```

4. **Restart Server**:
   ```bash
   npm run server
   ```

### Usage

1. Enter your shared Google Drive folder URL
2. Click "🔍 Analyze Folder"
3. Review files (binary files only - skips Docs/Sheets/Slides)
4. Choose import option and start

### Example URL Format
```
https://drive.google.com/drive/folders/1a2B3c4D5e6F7g8H9i0J
```

### Supported File Types

**✅ Will Import**:
- PDFs, Word docs (.docx), text files
- Images (if vision enabled)
- Any binary file format

**❌ Will Skip**:
- Google Docs (must export manually)
- Google Sheets (must export manually)
- Google Slides (must export manually)
- Google Forms, Drawings, etc.

## Import Options

### Option 1: Import All Files

**When to use**: 
- Complete folder migration
- Trusted content with consistent quality

**Example**:
```
Import all 127 files from bucket
```

### Option 2: Import First X Files

**When to use**:
- Testing cloud import with sample data
- Validating file formats before full import
- Rate-limited processing

**Example**:
```
Import first 10 files
```

### Option 3: Select Specific Files

**When to use**:
- Cherry-picking relevant documents
- Filtering by file type, size, or date
- Complex selection criteria

**Features**:
- Search by filename
- Filter by file type (.pdf, .txt, .docx, etc.)
- Filter by size range (< 100KB, 100KB-1MB, 1MB-10MB, etc.)
- Bulk select/deselect
- Folder navigation (breadcrumbs) for subfolders
- Scales to very large folders (50K+) via paged fetching + virtual rendering

## File Selection

### Opening File Selector

1. Choose **"Select specific files"** radio option
2. Click **"Choose Files..."** button
3. File selector modal opens with full folder listing

### Folder Navigation (Subfolders)

For providers that return full paths (like S3 keys), the file selector supports folder navigation:
- Breadcrumbs show the current folder path
- Folder rows let you drill down without losing selections
- Selections persist when you move between folders

**Filters + folder navigation**
- When no filters are active, search is scoped to the current folder (breadcrumb navigation mode).
- When a filter is active (search/type/size), the file list switches to a *global filter mode* across all discovered files.
   - Folder rows are hidden (to avoid mixing "global search" with folder browsing).
   - Each file row shows its folder path so you can still see where it lives.

This avoids the confusion of paging through a single flat, recursive list when your dataset has many nested folders.

### Available Filters

**Search Filter**:
- Type: Text input
- Matches: Filename contains query (case-insensitive)
- Example: Search "2024" to find all files from 2024

**File Type Filter**:
- Type: Dropdown
- Options: All detected file extensions
- Example: Select ".pdf" to show only PDF files

**Size Range Filter**:
- Type: Dropdown
- Options:
  - < 100 KB
  - 100 KB - 1 MB
  - 1 MB - 10 MB
  - 10 MB - 100 MB
  - \> 100 MB

### Selection Features

**Bulk Actions**:
- **Select All** - Select all filtered files
- **Clear Selection** - Deselect everything

**Selection Summary**:
- Available files count (after filters)
- Selected files count
- Total size of selection

**Visual Indicators**:
- ☐ Unchecked - Not selected
- ☑ Checked - Selected
- Blue highlight - Selected row

### File Information Display

Each file shows:
- 📄 **Filename** (truncated if long)
- 📁 **Folder path** (shown when using global filter mode)
- 🏷️ **Extension** (uppercase badge)
- 📊 **Size** (human-readable format)
- 📅 **Last Modified** (if available)

### Example Selection Workflow

1. **Filter PDFs over 1MB**:
   - Set Type: `.pdf`
   - Set Size: `1 MB - 10 MB`
   - Result: 43 files match

2. **Search for specific topic**:
   - Search: `machine-learning`
   - Result: 12 files match

3. **Review and select**:
   - Browse paginated results
   - Click checkboxes or rows to select
   - Selected: 8 files, 67.3 MB

4. **Confirm selection**:
   - Click **"Import 8 Files"** button
   - Modal closes, import starts

## Progress Tracking

Cloud imports use the same progress tracking system as file uploads.

### Progress Modal Features

**Real-time Updates**:
- Current file being processed
- Current stage/action (download, text extraction, PII scan, categorization, embedding, saving)
- Files completed vs. total
- Success/error counts
- Animated progress bar

**Cloud Import Details**:
- For S3 imports, the UI displays the bucket name under the current file (helps distinguish similar filenames across buckets)

**File Status Icons**:
- ⏱️ Pending (not started yet)
- ⏳ Processing (currently downloading/processing)
- ✅ Success (completed successfully)
- ❌ Error (failed with error message)

**Actions**:
- **Stop** - Stops after current file completes
- **Close** - Closes modal (import continues in background)

### Progress Persistence

- Progress tracked in-memory on server
- Job ID saved in localStorage on client
- Survives page refresh
- **Note**: Server restart clears active jobs

### Monitoring Active Imports

If you refresh the page during an import:
1. Header shows **"Upload in progress..."** button
2. Click to reopen progress modal
3. Status resumes from last update

## Processing Pipeline

Every cloud-imported file goes through the **exact same pipeline** as regular uploads:

### 1. Download
- Stream file from cloud provider
- Convert to buffer in memory
- Create file-like object

### 2. Text Extraction
- **PDFs**: Extract text with table detection
- **DOCX**: Convert to markdown
- **Images** (if vision enabled): Extract content via vision model
- **Plain text**: Direct use

### 3. Auto-Categorization (Optional)
If `CATEGORIZATION_MODEL` set and **"🤖 Auto-categorize"** enabled:
- Extract category, location, tags
- Detect prices, ratings, coordinates
- Generate structured metadata

### 4. PII Detection (Optional)
If `PII_DETECTION_ENABLED=true`:
- Scan for sensitive information
- Detect credit cards, SSNs, emails, etc.
- Risk level assessment
- Store findings in payload

### 5. Description Generation (Optional)
If `DESCRIPTION_MODEL` set:
- Generate document summary
- Detect language
- Create searchable overview

### 6. Embedding
- Generate 768D semantic vector via Ollama
- Generate sparse vector for keyword matching
- Hybrid search support

### 7. Storage
- Insert into Qdrant collection
- Update job status
- Increment success/error counts

## API Reference

### Check Provider Availability

**Endpoint**: `GET /api/cloud-import/providers`

**Response**:
```json
{
  "s3": {
    "enabled": true,
    "requiresAuth": false
  },
  "gdrive": {
    "enabled": false,
    "requiresAuth": true,
    "reason": "GOOGLE_DRIVE_API_KEY not configured"
  }
}
```

### Analyze Folder

**Endpoint**: `POST /api/cloud-import/analyze`

**Request**:
```json
{
  "provider": "s3",
  "url": "https://bucket.s3.amazonaws.com/folder/"
}
```

**Response**:
```json
{
   "jobId": "analysis_1704461234567_0",
   "status": "analyzing",
   "resumed": false
}
```

### Get Analysis Job Status

**Endpoint**: `GET /api/cloud-import/analysis-jobs/:jobId`

**Response (analyzing)**:
```json
{
   "jobId": "analysis_1704461234567_0",
   "status": "analyzing",
   "provider": "s3",
   "url": "https://bucket.s3.amazonaws.com/folder/",
   "filesDiscovered": 40900,
   "totalSize": 2000000000,
   "fileTypes": { ".jpg": 43000 },
   "pagesProcessed": 43,
   "startTime": 1704461234567,
   "endTime": null
}
```

**Response (completed)** returns `files`:
```json
{
   "jobId": "analysis_1704461234567_0",
   "status": "completed",
   "files": [
      { "key": "folder/document1.pdf", "name": "document1.pdf", "size": 12345, "extension": ".pdf" }
   ]
}
```

### Pause Analysis Job

**Endpoint**: `POST /api/cloud-import/analysis-jobs/:jobId/pause`

**Response**:
```json
{ "jobId": "analysis_1704461234567_0", "status": "paused" }
```

### Fetch Paused Job With Partial File List

When paused, the job status endpoint omits `files` by default (to keep polling light). Request the partial file list explicitly:

**Endpoint**: `GET /api/cloud-import/analysis-jobs/:jobId?includeFiles=1`

### Find Resumable Job By URL

Used by the UI to enable **"▶️ Continue Analysis"** when the same URL is re-entered soon after pausing.

**Endpoint**: `GET /api/cloud-import/analysis-jobs/by-url?provider=s3|gdrive&url=...`

**Response**:
```json
{
   "found": true,
   "jobId": "analysis_1704461234567_0",
   "status": "paused",
   "filesDiscovered": 40900,
   "fileTypes": { ".jpg": 43000 }
}
```

### Start Import

**Endpoint**: `POST /api/cloud-import/import`

**Request (All Files)**:
```json
{
  "provider": "s3",
  "url": "https://bucket.s3.amazonaws.com/folder/",
  "files": "all",
  "autoCategorize": true
}
```

**Request (First X Files)**:
```json
{
  "provider": "s3",
  "url": "https://bucket.s3.amazonaws.com/folder/",
  "files": [
    {"key": "folder/doc1.pdf", "name": "doc1.pdf", "size": 12345},
    {"key": "folder/doc2.pdf", "name": "doc2.pdf", "size": 23456}
  ],
  "autoCategorize": false
}
```

**Response**:
```json
{
  "message": "Cloud import started",
  "jobId": "job_1704461234567_42",
  "fileCount": 127
}
```

### Monitor Progress

Uses existing upload job endpoints:

**Endpoint**: `GET /api/upload-jobs/:jobId`

For large jobs, prefer paging the file list:

**Endpoint**: `GET /api/upload-jobs/:jobId?filesLimit=0`
- Lightweight polling (avoids returning the full `files` list)

**Endpoint**: `GET /api/upload-jobs/:jobId/files?offset=0&limit=200`
- Returns a slice of file statuses: `{ filesTotal, offset, limit, files }`
- Use this for scroll-driven fetching / virtualized rendering

**For S3**:
- Bucket is not public
- Incorrect URL format
- Bucket doesn't exist
- No files in folder

**Solutions**:
1. Verify bucket is publicly accessible:
   ```bash
   aws s3 ls s3://your-bucket/folder/ --no-sign-request
   ```

2. Check URL format - should end with `/`:
   ```
   ✅ https://bucket.s3.amazonaws.com/folder/
   ❌ https://bucket.s3.amazonaws.com/folder
   ```

3. Test with AWS CLI:
   ```bash
   curl https://bucket.s3.amazonaws.com/folder/
   ```

**For Google Drive**:
- Folder not shared publicly
- Invalid API key
- Incorrect folder URL

**Solutions**:
1. Verify folder sharing:
   - Right-click folder in Drive → "Share"
   - Must be set to "Anyone with the link" can view

2. Test API key:
   ```bash
   curl "https://www.googleapis.com/drive/v3/files?key=YOUR_API_KEY"
   ```

3. Check folder ID in URL:
   ```
   ✅ https://drive.google.com/drive/folders/1a2B3c4D5e6F7g8H9i0J
   ❌ https://drive.google.com/drive/u/0/folders/...  (remove u/0)
```

## Troubleshooting

### "Failed to analyze folder"

**Common Causes**:
- Bucket is not public
- Incorrect URL format
- Bucket doesn't exist
- No files in folder

**Solutions**:
1. Verify bucket is publicly accessible:
   ```bash
   aws s3 ls s3://your-bucket/folder/ --no-sign-request
   ```

2. Check URL format - should end with `/`:
   ```
   ✅ https://bucket.s3.amazonaws.com/folder/
   ❌ https://bucket.s3.amazonaws.com/folder
   ```

3. Test with AWS CLI:
   ```bash
   curl https://bucket.s3.amazonaws.com/folder/
   ```

### "Access Denied" errors

**Issue**: S3 bucket requires authentication

**Solution**: Use public buckets only, or implement AWS credentials support (not currently supported)

### Import stuck at "Processing"

**Possible Causes**:
- Large file taking time to process
- Ollama service not responding
- Network issues downloading file
required-for-google-drive) steps

### "Invalid Google Drive API key"

**Issue**: API key is incorrect or not properly configured

**Solutions**:
1. Verify API key in `.env` file
2. Check that Google Drive API is enabled in Google Cloud Console
3. Try creating a new API key
4. Restart the server after updating `.env`

### Google Drive folder shows 0 files

**Issue**: All files are Google Workspace files (Docs/Sheets/Slides)

**Solution**: Google Workspace files must be exported manually as binary formats:
- Export Docs as .docx or .pdf
- Export Sheets as .xlsx or .csv
- Upload exported files to a regular folder
**Debugging**:
1. Check server logs for errors
2. Verify Ollama is running: `curl http://localhost:11434/api/tags`
3. Check network connectivity to S3
4. Consider stopping import and retrying with smaller batch

### Files imported but not searchable

**Issue**: Files may have failed text extraction

**Solutions**:
1. Check upload job errors for failed files
2. Verify file formats are supported
3. Check server logs for extraction errors
4. Try re-uploading specific failed files

### Google Drive shows "🔒 Locked"

**Issue**: `GOOGLE_DRIVE_API_KEY` not configured

**Solution**: Follow [Google Drive Setup](#setup-optional) steps

## Best Practices

### 1. Start Small
Test with **"Import first 10 files"** before importing entire folders

### 2. Use File Selection
For large folders, use file selector to:
- Exclude unwanted file types
- Skip oversized files
- Import priority documents first

If your dataset has many subfolders, navigate by folder (breadcrumbs) instead of relying on a flat list.

### 3. Enable Auto-Categorization
Get better metadata extraction:
```env
CATEGORIZATION_MODEL=gemma3:4b
```

### 4. Monitor Progress
Don't close browser during large imports - keep progress modal visible

### 5. Verify Results
After import completes:
- Search for imported documents
- Check document counts in collections
- Verify metadata extraction worked

### 6. Handle Errors
Review error list in progress modal:
- Check file formats
- Verify file sizes within limits
- Re-upload failed files individually if needed

## Examples

### Example 1: Import Research Papers

```
URL: https://research-bucket.s3.amazonaws.com/papers-2024/
Analysis: 85 PDFs, 234 MB total
Option: Import all files
Auto-categorize: ✅ Enabled
Result: 85 documents added, fully searchable
```

### Example 2: Selective Document Import

```
URL: https://docs-bucket.s3.amazonaws.com/legal/
Analysis: 450 mixed files, 1.2 GB total
Option: Select specific files
Filters: 
  - Type: .pdf
  - Size: < 10 MB
  - Search: "contract"
Selected: 23 files
Result: 23 contracts imported
```

### Example 3: Testing with Sample

```
URL: s3://training-data/samples/
Analysis: 1000+ files
Option: Import first 50 files
Auto-categorize: ❌ Disabled (faster)
Result: Quick import for testing
```

## Next Steps

- [Web UI Guide](WEBUI.md) - Complete UI documentation
- [File Upload](FILE_UPLOAD_IMPLEMENTATION.md) - Regular file upload system
- [PII Detection](PII_DETECTION.md) - Sensitive data scanning
- [Testing](TESTING_PLAN.md) - Testing strategies

---

**Ready to import?** Open the web UI and try it out! 🚀
