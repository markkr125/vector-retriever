# Office File Support

This document describes the Office file format support in the Vector Retriever application.

## Supported Formats

### Modern Office Formats (Pure JavaScript)
These formats work out-of-the-box without external dependencies:

- **CSV (`.csv`)** - Comma-separated values
  - Parser: `csv-parse`
  - Outputs: Markdown table format
  - Truncation: Preserves header + as many rows as fit within token limit
  
- **Excel (`.xlsx`)** - Microsoft Excel spreadsheet
  - Parser: `xlsx` (SheetJS)
  - Outputs: Sheet-by-sheet with row data
  - Truncation: Includes sheets/rows up to token limit
  
- **PowerPoint (`.pptx`)** - Microsoft PowerPoint presentation
  - Parser: `jszip` + `fast-xml-parser`
  - Extraction: Slide content + speaker notes
  - Truncation: Includes slides up to token limit
  
- **Rich Text Format (`.rtf`)** - Universal rich text format
  - Parser: `rtf-parser`
  - Outputs: Plain text extraction

### Legacy Office & OpenDocument Formats (Requires LibreOffice)
These formats require LibreOffice to be installed and enabled:

- **Legacy Microsoft Office:**
  - `.doc` - Microsoft Word 97-2003
  - `.ppt` - Microsoft PowerPoint 97-2003
  - `.xls` - Microsoft Excel 97-2003

- **OpenDocument Formats:**
  - `.odt` - OpenDocument Text
  - `.odp` - OpenDocument Presentation
  - `.ods` - OpenDocument Spreadsheet

## Configuration

### Node.js Version
Modern Office file support requires **Node.js 18+**.

### LibreOffice Setup (Optional)

To enable legacy Office and OpenDocument format support, you must:

1. **Install LibreOffice:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install libreoffice
   
   # macOS
   brew install libreoffice
   
   # Windows
   # Download from https://www.libreoffice.org/
   ```

2. **Configure environment variables in `.env`:**
   ```bash
   # Enable LibreOffice conversion
   LIBREOFFICE_ENABLED=true
   
   # Optional: Specify path if not auto-detected
   LIBREOFFICE_PATH=/usr/bin/soffice
   
   # Optional: Customize timeouts and concurrency
   LIBREOFFICE_TIMEOUT_MS=60000
   LIBREOFFICE_MAX_CONCURRENCY=2
   ```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LIBREOFFICE_ENABLED` | `false` | Enable legacy/ODF format conversion |
| `LIBREOFFICE_PATH` | auto-detect | Path to LibreOffice `soffice` binary |
| `LIBREOFFICE_TIMEOUT_MS` | `60000` | Max conversion time (milliseconds) |
| `LIBREOFFICE_MAX_CONCURRENCY` | `2` | Max simultaneous conversions |

## How It Works

### Modern Formats (CSV, XLSX, PPTX, RTF)

1. **Upload**: Files are uploaded via the web UI or API
2. **Extraction**: Pure JavaScript libraries parse the files:
   - Extract text content
   - Preserve structure (sheets, slides, tables)
   - Apply token-limit truncation
3. **Metadata**: Stores extraction summary:
   - `content_truncated`: Boolean flag
   - `included_rows`, `included_sheets`, `included_slides`: Counts
   - `total_rows`, `total_sheets`, `total_slides`: Original counts
   - `extraction_summary`: Human-readable description
4. **Embedding**: Content is embedded and stored in Qdrant

### Legacy/ODF Formats (DOC, PPT, XLS, ODF)

1. **Upload**: Files are uploaded
2. **Conversion Check**: System checks if `LIBREOFFICE_ENABLED=true`
   - If disabled: Returns clear error message with instructions
   - If enabled: Proceeds with conversion
3. **Conversion**: LibreOffice converts to modern format:
   - `.doc` → `.docx` (then mammoth extraction)
   - `.ppt` → `.pdf` (then PDF extraction)
   - `.xls` → `.csv` (then CSV parsing)
   - `.odt` → `.docx`
   - `.odp` → `.pdf`
   - `.ods` → `.csv`
4. **Extraction**: Converted file processed with existing extractors
5. **Embedding**: Content embedded and stored

### Token-Limit Truncation

For structured formats (CSV, XLSX, PPTX), extraction stops when approaching the embedding model's token limit:

- **CSV**: Stops at row boundary, includes header + as many rows as fit
- **XLSX**: Stops at sheet/row boundary, includes complete sheets
- **PPTX**: Stops at slide boundary, includes complete slides (with or without notes)

**Error Handling**: If even a minimal representation (1 row, 1 sheet, 1 slide) can't fit, the upload is rejected with a clear error message.

## API Endpoints

### Get Supported File Types

```javascript
GET /api/config

Response:
{
  "supportedUploadFileTypes": [".txt", ".json", ".pdf", ".docx", ".csv", ".xlsx", ".pptx", ".rtf", ...],
  "supportedByDocumentFileTypes": [".txt", ".md", ".pdf", ".docx", ".csv", ".xlsx", ".pptx", ".rtf", ...],
  "libreOfficeEnabled": true/false,
  ...
}
```

The frontend automatically derives file input `accept` attributes from these lists.

### Upload Documents

```javascript
POST /api/documents/upload

// Modern formats work immediately
// Legacy/ODF formats require LIBREOFFICE_ENABLED=true

Response (immediate):
{
  "jobId": "job_1234567890_1"
}

// Poll for status
GET /api/upload-jobs/:jobId
```

## Metadata Fields

### Extraction Summary Fields

All structured format extractions include metadata fields:

```javascript
{
  // CSV
  "total_rows": 1000,
  "included_rows": 100,
  "content_truncated": true,
  "extraction_summary": "Included 100 of 1000 rows due to token limit",
  
  // XLSX
  "total_sheets": 5,
  "included_sheets": 2,
  "included_rows": 150,
  "sheet_names": ["Sheet1", "Sheet2", "Sheet3", ...],
  "content_truncated": true,
  "extraction_summary": "Included 2 of 5 sheets (150 rows total) due to token limit",
  
  // PPTX
  "total_slides": 50,
  "included_slides": 20,
  "included_notes_slides": 15,
  "content_truncated": true,
  "extraction_summary": "Included 20 of 50 slides (15 with speaker notes) due to token limit",
  
  // RTF
  "document_type": "rtf"
}
```

## Security Considerations

### LibreOffice Conversion Safety

LibreOffice conversion is protected by:

1. **Timeouts**: Conversions time out after `LIBREOFFICE_TIMEOUT_MS` (default 60s)
2. **Concurrency Limits**: Max `LIBREOFFICE_MAX_CONCURRENCY` conversions at once (default 2)
3. **Temp File Cleanup**: Automatic cleanup of temporary conversion files
4. **Process Isolation**: Each conversion runs in a separate process

### Resource Usage

- **Modern formats**: Minimal overhead, in-memory parsing
- **Legacy/ODF formats**: Moderate overhead, spawns LibreOffice process per conversion
- **Memory**: File contents held in memory during processing (respects `MAX_FILE_SIZE_MB`)

## Troubleshooting

### "Unsupported file type" Error

**Modern formats (CSV, XLSX, PPTX, RTF):**
- Ensure file extension matches (case-insensitive)
- Check file is not corrupted

**Legacy/ODF formats (DOC, PPT, XLS, ODF):**
```
Error: Legacy .doc files require LibreOffice conversion.
Set LIBREOFFICE_ENABLED=true in .env to enable support.
```

**Solution**: Enable LibreOffice as described in Configuration section.

### "Document too large" Error

```
Error: Document too large: 15000 tokens exceeds model limit of 8192 tokens
```

**Causes:**
- CSV with very long rows or many columns
- XLSX with dense data sheets
- PPTX with very long slide text

**Solutions:**
1. Split file into smaller parts
2. Remove unnecessary sheets/slides
3. Use a model with larger context window (set `EMBEDDING_MODEL` in .env)

### LibreOffice Conversion Errors

**"LibreOffice not found":**
- Verify LibreOffice is installed: `which soffice` (Linux/Mac) or `where soffice` (Windows)
- Set `LIBREOFFICE_PATH` explicitly in `.env`

**"Conversion timed out":**
- Increase `LIBREOFFICE_TIMEOUT_MS` for large files
- Check system resources (CPU/RAM)

**"Conversion queue full":**
- Too many concurrent uploads
- Wait for current conversions to complete
- Increase `LIBREOFFICE_MAX_CONCURRENCY` if system can handle it

## Implementation Details

### File Structure

- **`services/libreoffice-converter.js`**: LibreOffice conversion service with concurrency control
- **`utils/office-extractors.js`**: Pure-JS extractors for CSV, XLSX, PPTX, RTF
- **`services/document-service.js`**: Main document processing orchestrator
- **`routes/config-health.js`**: API endpoint for supported file types
- **`services/cloud-import-worker.js`**: MIME type mappings for cloud imports

### Libraries Used

- **`csv-parse`**: CSV parsing with correct quote/escape handling
- **`xlsx`**: Excel spreadsheet reading (SheetJS Community Edition)
- **`jszip`**: PPTX/XLSX unzip for OOXML formats
- **`fast-xml-parser`**: XML parsing for PPTX/DOCX internals
- **`rtf-parser`**: RTF to plain text conversion

### Testing

Test files and coverage for new formats:
```bash
# Run all tests
npm run test

# Unit tests for extractors
npm run test:unit

# E2E tests with file uploads
npm run test:e2e
```

## Future Enhancements

Potential improvements:

- [ ] Streaming extraction for very large files
- [ ] Parallel sheet/slide processing
- [ ] Custom truncation strategies (e.g., "first N + last M rows")
- [ ] Image extraction from PPTX/DOCX
- [ ] Formula evaluation in XLSX
- [ ] Native `.doc` parsing (without LibreOffice)
