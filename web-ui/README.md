# Web UI

Modern web interface for the Vector Retriever application.

## Table of Contents
- [Screenshots](#screenshots)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Quick Start](#quick-start)
- [Manual Start](#manual-start)
- [API Endpoints](#api-endpoints)
- [Document Upload](#document-upload)
- [Project Structure](#project-structure)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Production Build](#production-build)
- [Browser Support](#browser-support)
- [License](#license)

## Screenshots

### Main Search Interface

<img src="../docs/screenshots/webui-search.png" alt="Search Interface" width="700">

The main interface features:
- Multiple search types (Semantic, Hybrid, Location, Geo-radius)
- Advanced filtering options
- Real-time results with score indicators
- Document count and category statistics

### Browse All Documents

<img src="../docs/screenshots/webui-browase-all.png" alt="Browse All" width="700">

Browse and filter all documents in your collection:
- Sort by Document ID, Filename, Category, or Date
- Adjustable results per page (10, 20, 50, 100)
- Filename filter for quick searching
- Session-based pagination for performance

### Bookmarks

<img src="../docs/screenshots/webui-bookmarks.png" alt="Bookmarks" width="700">

Save and manage your favorite documents:
- Star any document to bookmark it
- Client-side pagination
- Filename filtering
- Visualization support

### Find Similar Documents

<img src="../docs/screenshots/webui-findsimilar.png" alt="Find Similar" width="700">

Discover related content:
- Click "Find Similar" on any document
- Semantic similarity search
- Ranked results with similarity scores
- Exclude source document from results

### Document Visualization

<img src="../docs/screenshots/webui-visualization.png" alt="Visualization" width="700">

Interactive 2D visualization of document clusters:
- UMAP dimensionality reduction (768D → 2D)
- Color coding by category, PII risk, or upload date
- Box/lasso selection for filtering
- Configurable max documents (100-5000)
- Cached for performance

### Add Document - Text Input

<img src="../docs/screenshots/webui-add-document-plan-text.png" alt="Add Document Text" width="700">

Direct text entry with optional metadata:
- Filename and content fields
- Optional metadata (category, location, tags, price, rating)
- Real-time word/character count
- Instant embedding and indexing

### Add Document - File Upload

<img src="../docs/screenshots/webui-add-document.png" alt="Add Document Upload" width="700">

Multi-file upload with automatic processing:
- Support for TXT, JSON, PDF, DOCX, DOC formats
- Drag & drop interface
- Automatic metadata extraction
- Optional auto-categorization

### Upload Progress Tracking

<img src="../docs/screenshots/webui-add-document-upload-progress.png" alt="Upload Progress" width="700">

Real-time upload monitoring:
- File-by-file progress tracking
- Animated progress bar with status icons
- Stop capability (finishes current file)
- Error handling with detailed messages

### Search by Uploaded File

<img src="../docs/screenshots/webui-search-by-uploaded-file.png" alt="Search by File" width="700">

Find similar documents by uploading a file:
- Upload any supported document format
- Automatic embedding generation
- Returns semantically similar results
- No permanent storage of uploaded file

### PII Detection & Reporting

<img src="../docs/screenshots/webui-sensitive-data-report.png" alt="PII Report" width="700">

Comprehensive privacy compliance:
- 5 detection methods (Regex, Ollama, Hybrid, Compromise, Advanced)
- 11 PII types detected (email, phone, SSN, credit card, etc.)
- Risk level classification (None, Low, Medium, High, Critical)
- Detailed findings with masked values
- Bulk scanning capabilities

## Features

- **Multiple Search Types**
  - Semantic search (dense vectors)
  - Hybrid search (semantic + keywords)
  - Location-based search
  - Geo-radius search

- **Advanced Filtering**
  - Category filter
  - Price range
  - Minimum rating
  - Tags matching
  - Document type (structured/unstructured)

- **Beautiful UI**
  - Real-time search
  - Visual score indicators
  - Expandable result cards
  - Responsive design
  - Dark-mode ready

## Technology Stack

- **Frontend**: Vue 3 (Composition API) + Vite
- **Backend**: Express.js API server
- **Styling**: Custom CSS with modern design system

## Quick Start

From the root directory:

```bash
# Install dependencies
npm install
cd web-ui && npm install && cd ..

# Start the web UI (both API and frontend)
npm run webui
```

Or use the startup script directly:

```bash
./start-webui.sh
```

The script will:
1. Check that Qdrant and Ollama are running
2. Install dependencies if needed
3. Start the API server on port 3001
4. Start the Vue dev server on port 5173
5. Open your browser to http://localhost:5173

## Manual Start

If you prefer to start services separately:

### Terminal 1 - API Server
```bash
npm run server
# or: node server.js
```

### Terminal 2 - Vue UI
```bash
cd web-ui
npm run dev
```

## API Endpoints

The Express server provides these endpoints:

- `GET /api/health` - Health check
- `GET /api/stats` - Collection statistics
- `POST /api/search/semantic` - Semantic search
- `POST /api/search/hybrid` - Hybrid search
- `POST /api/search/location` - Location-based search
- `POST /api/search/geo` - Geo-radius search
- `POST /api/documents/add` - Add document (text input)
- `POST /api/documents/upload` - Upload document file

## Document Upload

The web UI supports uploading documents in multiple formats:

### Supported File Formats

- **TXT**: Plain text files
- **JSON**: Structured data with optional metadata fields
- **PDF**: Extracts text content and page count
- **DOCX**: Microsoft Word documents (modern format)
- **DOC**: Microsoft Word documents (legacy format - best effort)

### Upload Methods

**Method 1: Text Input**
1. Click "Add Document" button
2. Select "Text Input" mode
3. Enter filename and content
4. Add optional metadata (category, location, tags, etc.)
5. Click Upload

**Method 2: File Upload**
1. Click "Add Document" button
2. Select "File Upload" mode
3. Choose file (max 10MB)
4. Optionally add/override metadata
5. Click Upload

### Metadata Extraction

The system automatically extracts metadata from file content:
- **Category**: Hotel, restaurant, attraction, technology, etc.
- **Location**: City names and geographic references
- **Tags**: Keywords and descriptive terms
- **Ratings**: Numerical ratings (0-5 scale)
- **Prices**: Price information
- **Coordinates**: Latitude/longitude if present

You can also manually specify metadata which will override automatic extraction.

## Project Structure

```
web-ui/
├── src/
│   ├── App.vue              # Main application component
│   ├── main.js              # Vue app entry point
│   ├── style.css            # Global styles
│   ├── api.js               # API client
│   └── components/
│       ├── SearchForm.vue   # Search configuration form
│       └── ResultsList.vue  # Results display
├── index.html               # HTML entry point
├── vite.config.js           # Vite configuration
└── package.json             # Dependencies

server.js                    # Express API server (root)
start-webui.sh              # Startup script (root)
```

## Development

### Hot Reload

Both the API server and Vue UI support hot reload during development:

- API changes: Restart `npm run server`
- UI changes: Automatically reloaded by Vite

### Adding Features

**New Search Type:**
1. Add router endpoint in `routes/search.js` (or create new router file)
2. Add option in `SearchForm.vue`
3. Handle response in `App.vue`

**New Filter:**
1. Add form field in `SearchForm.vue`
2. Include in `buildFilters()` function
3. Server automatically handles it

### Customization

**Colors/Theme:**
Edit CSS variables in `web-ui/src/style.css`:

```css
:root {
  --primary-color: #4f46e5;
  --secondary-color: #10b981;
  /* ... */
}
```

**API Port:**
Change `SERVER_PORT` in `.env` and proxy config in `web-ui/vite.config.js`

**UI Port:**
Change in `web-ui/vite.config.js`

## Troubleshooting

### "API server failed to start"
- Check that port 3001 is available
- Ensure Qdrant is running on port 6333
- Verify `.env` file configuration

### "Cannot connect to API"
- Check browser console for errors
- Verify API server is running: `curl http://localhost:3001/api/health`
- Check CORS settings in `server.js`

### "No results found"
- Ensure documents are embedded: `npm run embed`
- Check collection exists in Qdrant dashboard
- Verify search query syntax

## Production Build

To build for production:

```bash
cd web-ui
npm run build
```

This creates optimized static files in `web-ui/dist/`.

You can serve them with any static file server or integrate with the Express server.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

MIT
