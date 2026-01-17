# Cloud Import Safety Limits

This document describes the safety limits and confirmation dialogs added to the cloud import feature to prevent accidental bulk imports of large datasets.

## Overview

The cloud import feature now includes:
1. **Configurable limits** for maximum documents and total size
2. **Confirmation dialog** for "Import all files" option
3. **Smart defaults** (prioritizes "Import first X files" for testing)
4. **Visual separation** (increased margin for auto-categorize section)

## Environment Variables

### MAX_CLOUD_IMPORT_DOCS
- **Type**: Integer
- **Default**: 1000
- **Purpose**: Maximum number of documents that can be imported in a single cloud import operation
- **Behavior**: If user selects more documents, the import is automatically capped at this limit (no error thrown)

### MAX_CLOUD_IMPORT_SIZE_MB
- **Type**: Integer
- **Default**: 500 (MB)
- **Purpose**: Maximum total size (in megabytes) for a cloud import operation
- **Behavior**: If total size exceeds this limit, import is blocked with an error message

## UI Changes

### 1. Default Import Option
**Changed from**: "Import all files" (dangerous for large folders)
**Changed to**: "Import first 10 files" (safer for testing)

Rationale: Users should intentionally opt-in to bulk imports, not accidentally trigger them.

### 2. Confirmation Dialog for "Import All"
When user selects "Import all files" and clicks submit, a confirmation dialog appears showing:
- Total data size (formatted as GB or MB)
- Number of documents to import
- Warning if document count will be capped due to limit

Example messages:
- Normal: `"This will import 505.25 MB of data and 489 documents. Are you sure you wish to proceed?"`
- Capped: `"This will import 1.2 GB of data and 1000 documents (capped at 1000 documents due to limit). Are you sure you wish to proceed?"`

### 3. Size Limit Validation
Before import starts, total size is validated against `MAX_CLOUD_IMPORT_SIZE_MB`:
- If exceeded: Error message displays actual size vs. limit
- Import is blocked (won't proceed)
- Example: `"Total size (1.2 GB) exceeds maximum allowed (500 MB). Please reduce the number of files."`

### 4. Document Count Capping
If selected files exceed `MAX_CLOUD_IMPORT_DOCS`:
- Import automatically caps at limit
- No error thrown (graceful handling)
- User is informed in confirmation dialog if cap applies
- Example: 2000 files selected → only first 1000 imported

## Implementation Details

### Frontend (UploadModal.vue)

**State Variables:**
```javascript
const maxCloudImportDocs = ref(1000)
const maxCloudImportSizeMB = ref(500)
const importOption = ref('first') // Changed from 'all'
```

**Config Fetching:**
Limits loaded from `/api/config` on component mount:
```javascript
const fetchConfig = async () => {
  const response = await api.get('/config')
  maxCloudImportDocs.value = response.data.maxCloudImportDocs || 1000
  maxCloudImportSizeMB.value = response.data.maxCloudImportSizeMB || 500
}
```

**Validation Logic:**
1. Calculate total size and count based on import option
2. Check size limit → block if exceeded
3. Check document count → cap at limit (don't fail)
4. For "import all" → show confirmation dialog
5. Proceed with capped file list

### Backend

**server.js:**
```javascript
const MAX_CLOUD_IMPORT_DOCS = parseInt(process.env.MAX_CLOUD_IMPORT_DOCS || '1000', 10);
const MAX_CLOUD_IMPORT_SIZE_MB = parseInt(process.env.MAX_CLOUD_IMPORT_SIZE_MB || '500', 10);
```

**routes/config-health.js:**
Exposes limits in `/api/config` response:
```javascript
res.json({
  maxFileSizeMB,
  maxCloudImportDocs,
  maxCloudImportSizeMB,
  // ... other config
});
```

## Configuration Examples

### Development/Testing (Strict)
```bash
MAX_CLOUD_IMPORT_DOCS=100
MAX_CLOUD_IMPORT_SIZE_MB=50
```

### Production (Moderate)
```bash
MAX_CLOUD_IMPORT_DOCS=1000
MAX_CLOUD_IMPORT_SIZE_MB=500
```

### Enterprise (Permissive)
```bash
MAX_CLOUD_IMPORT_DOCS=10000
MAX_CLOUD_IMPORT_SIZE_MB=5000
```

## Error Messages

### Size Limit Exceeded
```
Total size (1.2 GB) exceeds maximum allowed (500 MB). Please reduce the number of files.
```

### Confirmation Dialog (Normal)
```
This will import 505.25 MB of data and 489 documents. Are you sure you wish to proceed?
```

### Confirmation Dialog (Capped)
```
This will import 1.2 GB of data and 1000 documents (capped at 1000 documents due to limit). Are you sure you wish to proceed?
```

## User Flow

1. **User analyzes cloud folder** → sees analysis results (489 files, 505 MB)
2. **Default selection**: "Import first 10 files" (safe)
3. **User changes to "Import all"** → clicks submit
4. **System validates**:
   - Size: 505 MB < 500 MB limit? ✅ Pass
   - Count: 489 < 1000 limit? ✅ No capping needed
5. **Confirmation dialog** appears with size/count
6. **User confirms** → import proceeds
7. **If user had 2000 files**:
   - Count: 2000 > 1000 limit → automatically caps at 1000
   - Dialog: "...1000 documents (capped at 1000 documents due to limit)"

## Benefits

1. **Safety First**: Default to testing mode (first 10 files)
2. **Informed Decisions**: Users see exact size/count before bulk import
3. **Resource Protection**: Prevents server overload from massive imports
4. **Graceful Handling**: Document count cap doesn't fail, just limits
5. **Clear Feedback**: Explicit error messages when limits exceeded

## Related Files

- `/web-ui/src/components/UploadModal.vue` - Frontend validation and confirmation
- `/web-ui/src/css/UploadModal.css` - Visual spacing improvements
- `/server.js` - Environment variable loading
- `/routes/config-health.js` - Config API endpoint
- `/.env.example` - Default limit values

## Testing

To test the limits:

1. **Test default behavior**:
   - Analyze folder with 100+ files
   - Verify "Import first 10 files" is selected by default

2. **Test confirmation dialog**:
   - Select "Import all files"
   - Click submit
   - Verify dialog shows correct size and count

3. **Test size limit**:
   - Set `MAX_CLOUD_IMPORT_SIZE_MB=1` in .env
   - Try importing folder > 1 MB
   - Verify error message blocks import

4. **Test document cap**:
   - Set `MAX_CLOUD_IMPORT_DOCS=50` in .env
   - Analyze folder with 100+ files
   - Select "Import all"
   - Verify confirmation shows "(capped at 50 documents due to limit)"

5. **Test visual spacing**:
   - Open cloud import tab
   - Analyze folder
   - Verify auto-categorize section has clear separation from import options
