# Vector Retriever - AI Agent Instructions

> **📝 Meta-Instruction:** When implementing new features or fixing bugs, update this file with architectural patterns, debugging tips, and integration points. Keep it current so future AI assistants understand the system's evolution.

## Table of Contents
- [Project Purpose](#project-purpose)
- [Architecture Overview](#architecture-overview)
- [Critical Developer Workflows](#critical-developer-workflows)
- [Project-Specific Conventions](#project-specific-conventions)
- [Express API Endpoints (30 routes)](#express-api-endpoints-30-routes)
- [Vue.js UI Architecture](#vuejs-ui-architecture)
- [Integration Points](#integration-points)
- [Common Debugging Patterns](#common-debugging-patterns)
- [File Upload Processing](#file-upload-processing)
- [Testing Infrastructure](#testing-infrastructure)
- [Key Configuration (.env)](#key-configuration-env)
- [When Modifying Code](#when-modifying-code)
- [Documentation Locations](#documentation-locations)

## Project Purpose
This is a **vector database demonstration** showcasing Qdrant's advanced features: hybrid search (dense + sparse vectors), complex payload filtering, geo-queries, PII detection, **multi-collection management**, and interactive 2D document visualization with UMAP dimensionality reduction.

## Architecture Overview

### Three-Tier System with Collections
```
Vue.js Web UI (port 5173) ←→ Express API (port 3001) ←→ Qdrant DB (port 6333) + Ollama (port 11434)
                                    ↓
                          Collections System
                          - default (cannot delete)
                          - user collections (UUID-based)
                          - metadata in _system_collections
```

**Key Files:**
- `index.js` - CLI tool for embedding & search (`npm run embed`, `npm run search`)
- `server.js` - Express API server entrypoint (mounts routers + initializes services)
- `web-ui/src/App.vue` - Main Vue app with search/browse/bookmarks views + collection selector (1932 lines)
- `web-ui/src/components/CollectionSelector.vue` - Header dropdown for switching collections
- `web-ui/src/components/CollectionManagementModal.vue` - Full collection CRUD interface with search & pagination
- `web-ui/src/components/UploadProgressModal.vue` - Real-time upload progress with animated bar, file-by-file status
- `services/pii-detector.js` - Multi-method PII scanning (Ollama LLM, regex, hybrid, compromise) with Hebrew/RTL support
- `services/visualization-service.js` - UMAP 768D→2D reduction with in-memory/Redis caching

### Data Flow for Search
1. User enters query → `SearchForm.vue` → `api.js` (Axios)
2. Express `server.js` receives POST `/api/search/hybrid`
3. Server calls `getDenseEmbedding()` → Ollama API → gets 768D vector
4. Server generates sparse vector (BM25-like token frequency)
5. **Qdrant Query API with weighted formula fusion:**
   - Prefetch dense results (limit: dynamic based on page)
   - Prefetch sparse results (limit: dynamic based on page)
   - Apply formula: `denseWeight * dense_score + (1-denseWeight) * sparse_score`
   - Cap scores at 1.0 (100%)
6. Results returned with metadata → `ResultsList.vue` renders

## Critical Developer Workflows

### Initial Setup
```bash
# 1. Start Qdrant (MUST run first)
docker-compose -f qdrant-docker-compose.yml up -d

# 2. Configure environment
cp .env.example .env
# Edit .env: OLLAMA_URL, QDRANT_URL, EMBEDDING_MODEL=embeddinggemma:latest

# 3. Embed sample dataset (27 documents in sample-data/)
npm install
npm run embed  # Creates 'documents' collection with hybrid vectors

# 4. Start web UI (runs both Vite dev server + Express API)
npm run webui  # Opens http://localhost:5173 (auto-starts server on 3001)
```

### Dataset Structure (27 documents)
**Structured (21 docs):** Hotels, restaurants, attractions, technology, coworking, hospitals, universities
- Format: Header metadata (`Category: hotel\nLocation: Paris\nTags: luxury, spa\nPrice: 450\n\n[content]`)
- Filename pattern: `{category}_{type}_{location}.txt`
- Sets `has_structured_metadata=true`, extracts fields via regex

**Unstructured (6 docs):** Essays, guides, recipes without metadata
- Format: Plain text, no headers
- Filename pattern: `unstructured_{topic}_{type}.txt`
- Sets `is_unstructured=true`, infers topic from filename
- Examples: `unstructured_meditation_guide.txt`, `unstructured_sourdough_recipe.txt`

### Key NPM Scripts
- `npm run embed` - Embeds all `data/**/*.txt` files into Qdrant with hybrid vectors
- `npm run search "query"` - CLI semantic search
- `npm run hybrid "query"` - CLI hybrid search (semantic + keyword)
- `npm run webui` - Starts Vite + Express via `start-webui.sh` script
- `npm run server` - Express API only (port 3001)
- `npm run examples` - Demonstrates 7 advanced query patterns
- `npm run mixed` - Shows structured vs unstructured document handling

**Web UI Startup Script (`start-webui.sh`):**
1. Checks/installs dependencies (root + web-ui)
2. Starts Express server (`node server.js &`) → PID stored
3. Waits 3s + health check (`curl http://localhost:3001/api/health`)
4. Starts Vite dev server (`cd web-ui && npm run dev &`)
5. Trap SIGINT/SIGTERM for graceful shutdown (kills both PIDs)

**CLI Argument Pattern (`index.js`):**
```bash
node index.js embed              # Embeds all data/*.txt
node index.js search "query"     # Semantic search
node index.js hybrid "query" 10  # Hybrid with limit
node index.js location "Paris" "hotels"
node index.js geo 48.8566 2.3522 50000 "museums"
```
See `main()` function for arg parsing with `process.argv`.

## Project-Specific Conventions

### Backend Modularization (Routes/Services/State)
The backend was refactored from a single large `server.js` into:
- `routes/` - Feature routers (`express.Router()` factories) mounted under `/api`
- `services/` - Reusable services (embedding, categorization, document processing, collections metadata)
- `middleware/` - Shared middleware (notably `collectionMiddleware`)
- `state/` - In-memory stores + cleanup timers (browse cache, temp files, upload jobs)
- `utils/` - Small pure helpers (sparse vectors, metadata parsing, PDF helpers)

Entry behavior is unchanged: `npm run server` runs `server.js`.

### JavaScript Configuration (jsconfig.json)
**Purpose:** Root-level `jsconfig.json` configures IDE tooling (Vetur, IntelliSense, ESLint):
- **Path aliases**: Maps `@` to `web-ui/src/` for imports like `import api from '@/api'`
- **IntelliSense**: Enables auto-completion and code navigation
- **Project structure**: Tells VS Code which files to include/exclude
- **Type checking**: Lightweight JavaScript type inference

**When to update:**
- Adding new path aliases in Vite config
- Restructuring major directories
- Adding new file types that need IntelliSense support

**Configuration:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["web-ui/src/*"] }
  },
  "include": ["web-ui/src/**/*", "*.js", "routes/**/*.js", ...],
  "exclude": ["node_modules", "dist", "__tests__", ...]
}
```

### Vue Component CSS Organization
**CRITICAL:** All Vue components MUST have CSS in separate files, not inline `<style>` blocks.

**Rules for component creation/modification:**
1. **CSS files location**: `web-ui/src/css/ComponentName.css` (NOT in components directory)
2. **Component reference**: Use external CSS via `<style scoped src="@/css/ComponentName.css"></style>`
3. **Threshold**: ANY new component with CSS should use external files (no minimum line count)
4. **Common styles**: Consider extracting duplicate patterns (buttons, modals, badges) to `common.css`

**Example Vue component structure:**
```vue
<template>
  <!-- Component HTML -->
</template>

<script setup>
// Component logic
</script>

<style scoped src="@/css/ComponentName.css"></style>
```

**Why external CSS:**
- Maintainability: Easier to find and edit styles
- Consistency: Encourages reusable CSS patterns
- Performance: Better caching and code splitting
- Separation of concerns: Clean component structure

**Current duplication stats (as of Jan 2025):**
- 12 CSS files, 4,124 total lines
- 10.1% duplication rate (60 duplicate selectors)
- Most duplicated: `.btn` (8 files), `.badge` (6 files), modal classes (4 files)
- **Action item**: Create `common.css` for shared button, modal, badge, and animation styles

### Collections System Architecture
**Multi-tenant document isolation** - Each collection is a separate Qdrant collection with independent documents:

**Collection Metadata Storage:**
- Special `_system_collections` Qdrant collection stores metadata for all user collections
- Each collection has: `collectionId` (UUID), `displayName`, `description`, `qdrantCollectionName`, `isDefault`, `createdAt`, `documentCount`
- Default collection (ID: "default") cannot be deleted, only emptied

**Collection Naming:**
- Display name: User-friendly (e.g., "My Documents", "Work Files")
- Qdrant name: Technical identifier (`default` or `col_{uuid}`)

**Collection Middleware Pattern:**
```javascript
// server.js - All document/search endpoints use this
app.post('/api/search/hybrid', collectionMiddleware, async (req, res) => {
  // req.collectionId = UUID from query param or localStorage
  // req.collection = metadata object from _system_collections
  // req.qdrantCollection = actual Qdrant collection name
});
```

**Frontend State Management:**
```javascript
// api.js - Axios interceptor automatically adds collection to all requests
api.interceptors.request.use(config => {
  if (currentCollectionId) {
    config.params = { ...config.params, collection: currentCollectionId };
  }
  return config;
});
```

**Collection Persistence:**
- URL query param: `?collection=uuid` (highest priority)
- localStorage: `activeCollection` (fallback)
- Auto-initialized: Creates default collection if none exist
- **Early API setup**: Collection ID set in api.js BEFORE any API calls to prevent flash of default collection data

**Component Integration:**
- `CollectionSelector.vue` - Dropdown in header, shows document counts, quick actions, exposes `refresh()` method
- `CollectionManagementModal.vue` - Full CRUD with search (filters by name/description), pagination (5 per page), and inline rename editing
- `FacetBar.vue` - Watches `currentCollectionId` prop, reloads facets on change
- `ResultsList.vue` - Receives `currentCollectionId` prop, passes to visualization API
- All search/browse operations scoped to current collection

**API Endpoints for Collections:**
- `GET /api/collections` - List all collections with metadata
- `POST /api/collections` - Create new collection (validates uniqueness)
- `PATCH /api/collections/:id` - Rename collection (validates format, uniqueness, rejects default)
- `DELETE /api/collections/:id` - Delete collection (rejects default)
- `POST /api/collections/:id/empty` - Remove all documents, keep collection
- `GET /api/collections/:id/stats` - Get document count + size

**Collection Rename Feature:**
- Inline editing in CollectionManagementModal - click "✏️ Rename" to edit name + description
- Only non-default collections can be renamed
- Validation: Name must be alphanumeric with spaces/underscores/hyphens, max 50 chars
- Uniqueness check: Prevents duplicate names
- Keyboard shortcuts: Enter to save, Esc to cancel
- Visual feedback: Purple border during edit, loading state while saving

### Vector Storage Pattern (Hybrid Search)
All documents have **dual vectors** stored in Qdrant:
```javascript
{
  vector: {
    dense: [768-dim float array],  // Ollama embedding
    sparse: {
      indices: [1234, 5678, ...],   // Token hashes (0-9999)
      values: [3, 2, ...]            // Token frequencies
    }
  },
  payload: { /* metadata */ }
}
```

**Why:** Qdrant's native hybrid search fuses semantic + keyword matching. Sparse vectors use simple token hashing (`simpleHash()` in `index.js`) - not production BM25, but demonstrates the concept.

**Hybrid Search Scoring (Query API with Weighted Formula):**
Uses Qdrant's Query API with prefetch + formula-based fusion:
- **Weight parameter actively used**: `denseWeight=0.7` (70% semantic, 30% keyword)
- Adjustable via slider in UI (0.0=pure keyword, 1.0=pure semantic)
- Formula: `score = denseWeight * $score[0] + (1-denseWeight) * $score[1]`
- Scores capped at 1.0 (100%) to prevent overflow from different vector scales
- Dynamic prefetch limit: `Math.max(100, offset + limit * 2)` for deep pagination
- Score fusion executed on Qdrant server via formula query

### Metadata Structure Convention
**Structured docs** (hotels, restaurants): Rich metadata with filterable fields
```javascript
{
  category: "hotel",
  location: "Paris",
  tags: ["luxury", "spa"],
  price: 450,
  rating: 4.8,
  coordinates: { lat: 48.8566, lon: 2.3522 },
  status: "open"
}
```

**Unstructured docs** (essays, recipes): Minimal metadata
```javascript
{
  is_unstructured: true,
  has_structured_metadata: false,
  // Still searchable via semantic/hybrid search!
}
```

**Always include:** `filename`, `filepath`, `content`, `upload_date`, `document_id`

**Metadata Extraction Pattern:**
`parseMetadataFromContent()` in `utils/metadata.js` uses regex to extract from text:
```javascript
// From document headers (format: "Category: hotel")
/^Category:\s*(.+)/im  // Sets has_structured_metadata=true
/^Tags:\s*(.+)/im      // CSV → array
/^Price:\s*(\d+(?:\.\d+)?)/im  // String → float
/^Coordinates:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/im  // → {lat, lon}
```

**Unstructured Category in Facets:**
Documents with `is_unstructured: true` are automatically grouped into an "unstructured" category in the facets API (`routes/browse.js`):
```javascript
// Count categories (including "unstructured" for is_unstructured docs)
if (point.payload.category) {
  categoryCount[point.payload.category] = (categoryCount[point.payload.category] || 0) + 1;
} else if (point.payload.is_unstructured === true) {
  // Documents without category but marked as unstructured get "unstructured" category
  categoryCount['unstructured'] = (categoryCount['unstructured'] || 0) + 1;
}
```
This allows users to browse and filter by "unstructured" category in the UI.

**Optional Auto-Categorization:**
If `CATEGORIZATION_MODEL` set (e.g., `llama3.2:latest`), server sends document to Ollama Chat API for JSON extraction. System prompt requests: category, city, coordinates, tags, price, date. Result merged into metadata.

### PII Detection Multi-Method Pattern
`services/pii-detector.js` uses **factory pattern** with 5 strategies:
- `OllamaPIIDetector` - LLM-based (accurate but slow)
- `RegexPIIDetector` - Fast regex patterns (credit cards, SSN, emails)
- `HybridPIIDetector` - Combines both with **dual-agent validation**
- `CompromisePIIDetector` - NLP library for names/dates
- `AdvancedPIIDetector` - All methods combined with deduplication

**PII Type Filter Semantics (Multi-select):**
- UI multi-select for PII types is treated as **AND** across selected types (a document must contain *all* selected PII types).
- Implement this by emitting multiple filter clauses (one per type) in `filter.must` rather than a single `match.any` clause.
- Legacy flat filters (`filters.pii_types`) are also interpreted as AND in `routes/search.js`.

**Documented PII Types (filtered in UI and backend):**
- `credit_card` - Full credit card numbers (Luhn validated)
- `credit_card_last4` - Last 4 digits of credit cards (low risk)
- `email` - Email addresses
- `phone` - Phone numbers (validated with phone library)
- `address` - Physical addresses
- `name` - Personal names
- `bank_account` - Bank account numbers (IBAN)
- `ssn` - Social Security Numbers
- `passport` - Passport numbers
- `driver_license` - Driver's license numbers
- `date_of_birth` - Birth dates
- `ip_address` - IP addresses
- `medical` - Medical information (critical risk)

**Backend filtering (`routes/browse.js`):**
The `/api/facets` endpoint filters PII types to only return documented types:
```javascript
const documentedPIITypes = [
  'credit_card', 'credit_card_last4', 'email', 'phone', 'address',
  'name', 'bank_account', 'ssn', 'passport', 'driver_license',
  'date_of_birth', 'ip_address', 'medical'
];
const piiTypes = Object.entries(piiTypeCount)
  .filter(([name]) => documentedPIITypes.includes(name))
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count);
```

**Frontend PII type formatting:**
All three components (FacetBar, FacetsSidebar, PIIDetailsModal) use consistent icon/label mappings for documented types only.

**Dual-Agent Validation (Hybrid):**
1. **Detection Agent**: Ollama scans document for PII → returns findings
2. **Validation Agent**: Second Ollama call validates each finding → filters false positives (company names, order IDs, product codes)
3. Regex results added for coverage → deduplicated by `${type}:${value}`

**Anti-Loop Protection**: Tracks occurrence count per finding, stops if same item appears >3 times (critical for non-English text).

**JSON Parsing with Hebrew Support:**
Line-by-line processing to handle embedded quotes (e.g., תנ"ך):
```javascript
// Escape quotes within Hebrew text before JSON parsing
const escapedLine = line.replace(/"([^"]*)":/g, (match, key) => {
  const colonIndex = match.lastIndexOf(':');
  const valueStart = colonIndex + 1;
  if (valueStart < match.length) {
    // Find value, escape internal quotes
    return `"${key}":${escapedValue}`;
  }
  return match;
});
```

**Usage:** Set `PII_DETECTION_METHOD=hybrid` in `.env`. Server auto-scans uploads, stores `pii_scan` in payload. Results show in modal with masked values.

### Visualization Caching Strategy
`services/visualization-service.js` caches UMAP projections (expensive: 5-10s for 100 docs):
```javascript
// Strategy pattern: InMemoryCache (default) or RedisCache
VIZ_CACHE_STRATEGY=memory  // or 'redis' for distributed caching
VIZ_CACHE_TTL=3600000      // 1 hour default
```

Cache key: `viz:${collectionName}:${vectorCount}:${groupBy}`. Invalidates on document count change.

### Upload Background Processing Pattern
`server.js` implements **async upload with progress tracking**:
```javascript
// In-memory job store (Map-based)
uploadJobs.set(jobId, {
  id: jobId,
  status: 'processing',  // processing|completed|stopped|error
  totalFiles: 10,
  processedFiles: 3,
  successfulFiles: 2,
  failedFiles: 1,
  currentFile: 'document.pdf',  // Currently processing file
  currentStage: 'Embedding…',   // Current step for active file (UI hint)
  files: [  // File-level tracking with individual status
    { name: 'doc1.pdf', status: 'success', id: 12345 },
    { name: 'doc2.pdf', status: 'processing' },
    { name: 'doc3.pdf', status: 'error', error: 'Invalid format' },
    { name: 'doc4.pdf', status: 'pending' }
  ],
  errors: [{ filename: 'doc3.pdf', error: 'Invalid format' }],
  startTime: Date.now(),
  endTime: null
});
```

**Frontend Features (`UploadProgressModal.vue`):**
- Animated progress bar with diagonal stripes + shimmer effect
- Polls job status every **1 second** (not 500ms)
- File icons: ⏱️ pending, ⏳ processing, ✅ success, ❌ error
- Stop button with confirmation dialog
- Close button always visible (modal can be closed, upload continues)
- **No auto-open on refresh** - button shows "Upload in progress..." but modal stays closed
- **Polling safeguards**: Uses watchers for `props.show` and `props.jobId` to prevent duplicate intervals
- `startPolling()` calls `stopPolling()` first to ensure only one interval runs

**Large Job Scaling (50K+ files):**
- Status polling should be lightweight: `GET /api/upload-jobs/:jobId?filesLimit=0` (avoid returning the file list every second)
- File list paging: `GET /api/upload-jobs/:jobId/files?offset=0&limit=200` returns `{ filesTotal, offset, limit, files }`
- UI uses virtual rendering (fixed row height) and fetches pages on scroll; rows are cached by index to avoid re-requesting
- Scroll fetching is debounced (~150ms) to avoid spamming `/files` during continuous scrolling; in-flight page fetches are abortable via `AbortController`

**Cloud Import File Selection (Subfolders + Types):**
- Cloud analysis results should include a stable per-file path (`key`/`path`) so the UI can derive folders and display breadcrumbs.
- Cloud analysis results should include a per-file `extension` field; the file-type dropdown is derived from this.
  - Symptom if missing: file-type dropdown shows only “All Types”.
- `FileSelector.vue` supports real folder navigation (breadcrumbs + folder rows). For S3, pass `rootPrefix` so the breadcrumb/path display is relative to the analyzed prefix.

**Stage Reporting (Current Action):**
- `services/document-service.js` supports `options.onStage(stageLabel)` to report major steps (PII scan, categorization, embedding, saving)
- Upload/cloud-import workers pass `onStage` to update `job.currentStage` so the UI can display a second line under “Processing: <file>”

**RTL Text Support:**
Hebrew and other right-to-left language filenames displayed correctly:
```css
.file-name {
  unicode-bidi: plaintext;  /* Auto-detect text direction */
  direction: ltr;           /* Default LTR, overridden for RTL */
  text-align: left;
}
```

**Crash-resistant:** Job state in-memory (not persisted). Job ID persisted in localStorage to survive page refresh.

**Job ID Generation:**
```javascript
const generateJobId = () => `job_${Date.now()}_${jobIdCounter++}`;
```
Combines timestamp + auto-incrementing counter for uniqueness.

**Stop Behavior:**
- Each upload job owns an `abortController` (AbortSignal propagated through `documentService.processSingleFile(..., { signal })`).
- Stop requests set `job.status='stopped'` and call `abortController.abort()` to cancel in-flight Ollama/embedding requests where supported.
- The current file may be marked as cancelled (surfaced as an error on that file), and remaining files are skipped.

**Abortable Ollama Calls (Option C):**
- Shared helper: `services/ollama-agent.js` (`runOllamaChat`) centralizes AbortSignal + JSONL stream collection.
- Services that call `/api/chat` should use `runOllamaChat({ ..., signal })` instead of duplicating axios streaming logic.

### Pagination Pattern
**Frontend** (`ResultsList.vue`):
- Displays smart page numbers: `1 2 3 ... 8 9 10` (ellipsis for large ranges)
- Logic: Show first 3, last 3, and current ±1 when total pages >7
- Emits `page-change` event → `App.vue` updates URL + re-searches
- Per-page selector: 10, 20, 50, 100 (triggers session refresh)

**Backend** (`routes/search.js`):
- **Browse mode**: Session cache with `qdrant.retrieve()` for page IDs (see Browse Session Cache Pattern)
- **Bookmarks**: Client-side pagination with array slicing (all bookmarks loaded once)
- **Hybrid/Semantic search**: Uses `countFilteredDocuments()` for total count

**Vector Search Pagination Logic:**
For hybrid/semantic searches, pagination total is based on **filters only** (query affects ranking, not count):
```javascript
// Hybrid search - query determines ranking, filter determines count
if (searchParams.filter && searchParams.filter.must && searchParams.filter.must.length > 0) {
  // Has filters (category, location, PII types, etc.)
  // Count by filter - shows "10 out of 115 hotels"
  totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, searchParams.filter);
} else {
  // No filters - count entire collection
  // Shows "10 out of 226 documents"
  totalEstimate = await countFilteredDocuments(qdrantClient, req.qdrantCollection, null);
}
```

**Important:** `countFilteredDocuments()` must use **exact** counts in Qdrant (`exact: true`). Approximate counts can cause confusing UI totals like "5 results out of 132" when filters (notably PII) are applied.

**Why this approach:**
- ✅ Accurate counts for filtered results (e.g., "115 hotels")
- ✅ Allows pagination through all filtered documents
- ✅ Query ("order") affects ranking/relevance, not total count
- ⚠️ Can't efficiently count "documents matching query + filter" without searching all

**Bookmarks Pagination:**
- Fetches all bookmarked documents once via `qdrant.retrieve(allBookmarkIds)`
- Client-side slicing: `bookmarkedResults.slice(offset, offset + limit)`
- State: `bookmarksPage`, `bookmarksLimit`, `bookmarksTotal` in App.vue
- No server-side cache needed (bookmarks typically < 100 documents)

### Bookmarks Feature
**Implementation:**
- Star button (☆/⭐) on each result card in `ResultsList.vue`
- localStorage persistence: `Set` of document IDs, serialized as JSON array
- Toggle bookmark: Click star → updates Set → saves to localStorage → updates UI

**Backend endpoint** (`GET /api/bookmarks`):
```javascript
// Retrieves bookmarked documents by IDs
const ids = req.query.ids.split(',').map(id => {
  const parsed = parseInt(id, 10);
  return isNaN(parsed) ? id : parsed; // Handle both numeric and UUID IDs
});
const points = await qdrantClient.retrieve(COLLECTION_NAME, {
  ids: ids,
  with_payload: true,
  with_vector: false
});
```

**Features:**
- Client-side pagination (20 per page, configurable: 10/20/50/100)
- **Filename filtering**: Case-insensitive partial match in both Browse and Bookmarks modes
- Cluster filtering: Click cluster in visualization → filters bookmarks by selected IDs
- Visualization support: "Visualize Results" button with `bookmarkIds` parameter
- Sorting: Maintains order from backend retrieval (ID order)

**State management** (App.vue):
```javascript
const bookmarkedResults = ref([])         // Current page results
const fullBookmarkedResults = ref([])      // All bookmarks before filtering
const bookmarksPage = ref(1)
const bookmarksLimit = ref(20)
const bookmarksTotal = ref(0)
```

**Cluster filtering:**
- `handleFilterByIds(ids)` filters `fullBookmarkedResults` by cluster selection
- Resets pagination to page 1 when filter applied
- Clear filter button restores full results

### LocalStorage State Persistence
Critical UI state persists across refreshes:
- **Bookmarks**: `localStorage.getItem('bookmarkedDocuments')` in `ResultsList.vue` (Set → JSON array)
- **Active uploads**: `localStorage.getItem('activeUploadJobId')` in `App.vue`
  - Job ID persists across page refresh
  - Header button shows "Upload in progress..." when job active
  - **Modal does NOT auto-open** - user must click button to see progress
  - Job state verified on mount: checks if still processing, clears if completed
- **NO query/filter state saved** - these come from URL params only

### Surprise Me Button
**Location:** `SearchForm.vue` below Search button

**Functionality:**
- Generates random seed: `Date.now()` for randomization
- Emits `surpriseMe` event to App.vue
- App.vue triggers hybrid search with `randomSeed` parameter
- Backend uses seed to shuffle results before limiting

**Implementation:**
```javascript
// SearchForm.vue
const handleSurpriseMe = () => {
  emit('surpriseMe')
}

// App.vue
const handleSurpriseMe = () => {
  const seed = Date.now()
  // Trigger search with random seed
  performSearch({ randomSeed: seed, limit: 10 })
}
```

**Styling:**
- Neutral gray background (`#95a5a6`)
- Subtle hover effect (10% lighter)
- 🎲 dice emoji for visual clarity
- Non-distracting to avoid UI clutter

**URL persistence:** Random seed stored in query param: `/search?randomSeed=1234567890`

### URL State Management Pattern
`App.vue` uses URL params for all search/filter state (survives refresh):
```javascript
// URL Structure Examples:
/search?q=query&type=hybrid&weight=0.7&limit=10&page=1&filters=[...]
/search?similarTo=docId&limit=10
/search?tempFileId=temp_123&fileName=doc.pdf
/search?randomSeed=1234567890
/browse?sortBy=category&sortOrder=asc&limit=20

// PII filters (now persist in URL)
/search?filters=[{"type":"pii_risk","value":"high"}]
/search?filters=[{"type":"pii_type","value":"credit_card"}]
/search?filters=[{"type":"pii_risk","value":"never_scanned"}]
```

**View Restoration Flow (`onMounted`):**
1. Parse URL pathname → determine view (search/browse/bookmarks)
2. Check for special params: `similarTo`, `randomSeed`, `tempFileId`
3. If special param exists → execute that search type
4. Else → restore filters from `filters` param (JSON array)
5. **PII filters** get special handling during restoration:
   - `pii_risk='none'` → maps to `pii_detected=false`
   - `pii_risk='never_scanned'` → creates `must_not` clause
   - `pii_risk='low|medium|high|critical'` → maps to `pii_risk_level`
   - `pii_type` → maps to `pii_types` array match
6. Update `window.history.pushState()` when state changes

**Filter Persistence**: `filters` param = JSON-encoded array: `[{type: 'category', value: 'hotel'}]`

**Filter URL Update**: Both `handleFilterPIIType` and `handleFilterPIIRisk` update URL when filters change

### Browse Session Cache Pattern
`server.js` implements **server-side session cache** for efficient browse pagination:
```javascript
// Cache structure (Map-based, in-memory)
browseCache.set(sessionId, {
  ids: [1, 2, 3, ...],           // Sorted document IDs only (lightweight)
  cacheKey: 'filename-asc-filter',  // Sort + filter configuration: ${sortBy}-${sortOrder}-${filenameFilter}
  collectionId: 'uuid',          // Collection identifier
  timestamp: Date.now()          // For TTL expiration
});
```

**How it works:**
1. **First browse request**: Server fetches all documents, applies filename filter, sorts them, caches only IDs, returns `sessionId`
2. **Subsequent page requests**: Client sends `sessionId`, server uses cached IDs, retrieves only requested page
3. **Sort/limit/filter changes**: Client clears `sessionId`, triggers new cache session
4. **Cache invalidation**: TTL 10 minutes, auto-cleanup every 2 minutes

**Session ID format:** `browse-${collectionId}-${timestamp}-${random9chars}`

**Filename Filtering:**
- **Browse mode**: Server-side filtering with query param `?filename=searchterm`
- **Bookmarks mode**: Client-side filtering (filters `fullBookmarkedResults` before pagination)
- Case-insensitive partial matching on `filename` field
- Debounced input (300ms) in UI to reduce server requests
- Clears session cache when filter changes

**Frontend state:**
- `browseSessionId.value` - stored in App.vue
- `browseFilenameFilter.value` - filter text for Browse mode
- `bookmarksFilenameFilter.value` - filter text for Bookmarks mode
- Sent as query param: `/api/browse?sessionId=...&page=2&limit=20&filename=test`
- Cleared on sort/limit/filter change to force fresh cache
- `browseFilteredByCluster.value` - prevents reload when cluster filter active

**Performance:**
- Initial load: Fetches all docs once (scroll with batches of 100), applies filename filter
- Subsequent pages: Retrieves only 20 docs via `qdrant.retrieve(pageIds)`
- Memory: ~100KB per 10k documents (IDs only, not full payloads)

### "Never Scanned" Filter Special Handling
Qdrant **cannot filter on missing fields**. For `must_not: [{ key: 'pii_detected' }]` filter:
1. Fetch all documents with `scroll()` (limit 100 per batch)
2. Client-side filter where `payload.pii_detected === undefined`
3. Paginate filtered results

See `server.js` lines 906-940 for implementation pattern.

## Express API Endpoints (30 routes)

**Search endpoints:**
- `POST /api/search/semantic` - Dense vector search only
- `POST /api/search/hybrid` - Combined dense + sparse search (primary)
- `POST /api/search/location` - Filter by city name
- `POST /api/search/geo` - Radius search with coordinates
- `POST /api/search/by-document` - Upload file to find similar

**Browse/Stats:**
- `GET /api/browse` - Paginated all documents with sort and optional filename filter (`?filename=searchterm`)
- `GET /api/bookmarks` - Fetch by document IDs
- `GET /api/stats` - Collection stats (categories, tags, counts)
- `GET /api/facets` - Get all unique facet values

**Upload:**
- `POST /api/documents/upload` - Multi-file upload (async jobs, returns jobId immediately)
- `GET /api/upload-jobs/active` - Get currently active upload job ⚠️ MUST come before :jobId route
- `GET /api/upload-jobs/:jobId` - Get upload job status by ID
- `GET /api/upload-jobs/:jobId/files` - Paged file status slice for large jobs (use `offset` + `limit`)
- `POST /api/upload-jobs/:jobId/stop` - Stop upload (finishes current file, skips rest)

**Temp Files:**
- `POST /api/temp-files` - Store temporary file for "search by document" feature
- `GET /api/temp-files/:id` - Retrieve temporary file by ID

**PII:**
- `POST /api/documents/:id/scan-pii` - Scan single document
- `POST /api/documents/scan-all-pii` - Bulk scan with progress

**Visualization:**
- `GET /api/visualize/scatter` - 2D UMAP projection of all docs
- `POST /api/visualize/search-results` - UMAP for search results only
- `POST /api/visualize/refresh` - Clear visualization cache

**Health:**
- `GET /api/health` - Qdrant + Ollama connectivity check
- `GET /api/config` - Frontend config (PII enabled, models, etc.)

## Vue.js UI Architecture

**Component Hierarchy:**
```
App.vue (root - 1772 lines)
├── SearchForm.vue (822 lines)
│   ├── Search type selector (hybrid/semantic/by-document/location/geo)
│   ├── Dense weight slider (for hybrid)
│   ├── Advanced filters (category, price, rating, tags)
│   └── Emits: search, clear, surpriseMe
├── ResultsList.vue (1993 lines)
│   ├── Result cards with metadata + PII badges
│   ├── Pagination controls with smart ellipsis
│   ├── Browse/sort controls (for browse mode)
│   ├── Cluster visualization (inline ScatterPlot)
│   ├── Bookmark management (localStorage)
│   └── Emits: page-change, find-similar, filter-by-ids, sort-change
├── FacetsSidebar.vue (364 lines)
│   ├── Categories, locations, tags (collapsible)
│   ├── PII filters (types, risk levels)
│   ├── Bulk PII scan button
│   └── Emits: filter-category, filter-tag, filter-pii-type, filter-pii-risk
├── UploadModal.vue (798 lines)
│   ├── File upload (multiple files)
│   ├── Text input (with metadata)
│   ├── Auto-categorization toggle
│   └── Returns jobId → opens UploadProgressModal
├── UploadProgressModal.vue
│   ├── Animated progress bar (diagonal stripes + shimmer)
│   ├── File-by-file status (⏳ processing, ✅ success, ❌ error)
│   ├── Polls every 1 second
│   └── Stop button with confirmation
├── PIIDetailsModal.vue
│   ├── Shows PII findings with masked values
│   ├── Risk level indicator
│   └── Detection method + timestamp
├── ScatterPlot.vue (341 lines)
│   ├── Plotly.js 2D visualization
│   ├── Box/lasso selection enabled
│   └── Color coding by category/PII risk/date
└── ScanNotification.vue
    └── Toast notification for PII scan completion
```

**State Management:** No Vuex/Pinia - uses props/events pattern
```javascript
// App.vue → ResultsList.vue
<ResultsList @find-similar="handleFindSimilar" @filter-by-ids="handleFilterByIds" />

// ResultsList.vue → App.vue
this.$emit('find-similar', documentId);
```

**Key Component Responsibilities:**
- **App.vue**: Orchestrates all state, handles API calls, manages URL state, view switching (search/browse/bookmarks)
- **SearchForm.vue**: Search configuration, builds search params, validates input, 5 search types
- **ResultsList.vue**: Displays results, manages bookmarks (localStorage), inline visualization, pagination UI
- **FacetsSidebar.vue**: Browse-by filtering, loads facet counts from `/api/facets`, PII filters
- **UploadModal.vue**: Multi-file upload or text input, optional metadata fields, auto-categorization
- **UploadProgressModal.vue**: Real-time progress with job polling (1s interval), stop capability, file-by-file status

**Facet filtering flow:** `FacetsSidebar.vue` emits filter → `App.vue` rebuilds Qdrant filter object → calls API → re-renders results.

## Integration Points

### Ollama Embedding API
**Critical:** Model must be pulled first: `ollama pull embeddinggemma:latest`

Endpoint: `POST http://localhost:11434/api/embed`
```javascript
// Request
{ model: "embeddinggemma:latest", input: "text to embed" }

// Response
{ embeddings: [[0.123, -0.456, ...]] }  // 768 dimensions
```

**Model Context Size Detection:**
On server startup, fetches model's `num_ctx` parameter:
```bash
curl http://localhost:11434/api/show -d '{"name": "embeddinggemma:latest"}'
# Response: "num_ctx 2048" → MODEL_MAX_CONTEXT_TOKENS = 2048
```

**Document Size Validation:**
Before embedding, checks if document exceeds model context limit:
```javascript
const estimatedTokens = Math.ceil(content.length / 4); // ~4 chars per token
if (estimatedTokens > MODEL_MAX_CONTEXT_TOKENS) {
  throw new Error(`Document too large: ${estimatedTokens} tokens exceeds ${MODEL_MAX_CONTEXT_TOKENS}`);
}
```
Returns clear error to client instead of hanging. No automatic truncation to preserve document integrity.

**Error handling:** 
- `ECONNREFUSED` - Ollama service not running
- `ETIMEDOUT` - Request took >5 minutes (embedding timeout)
- Status 400 - Document exceeds model context limit
- Status 404 - Model not pulled

### Ollama Vision (Chat API with Images)
Used for image uploads when vision is enabled.

Request pattern:
- Endpoint: `POST /api/chat`
- Payload includes `messages` plus `images: [base64]` on the user message.
- The response is parsed into `# Language`, `# Description`, `# Content` sections.

### Qdrant Collection Schema
Created in `index.js:initializeCollection()`:
- Named vectors: `dense` (768D) + `sparse` (10000D)
- Payload indexes on: `category`, `location`, `tags`, `price`, `rating`, `status`, `coordinates` (geo)
- Distance metric: Cosine for dense, Dot for sparse

**Why payload indexes?** Avoid full collection scans for filters. See `createPayloadIndex()` calls.

**Qdrant filter structure:**
```javascript
filter: {
  must: [{ key: 'category', match: { value: 'hotel' } }],
  should: [{ key: 'tags', match: { any: ['luxury', 'spa'] } }],
  must_not: [{ key: 'status', match: { value: 'closed' } }]
}
```

**Geo-query:**
```javascript
filter: {
  must: [{
    key: 'coordinates',
    geo_radius: { center: { lat: 48.8566, lon: 2.3522 }, radius: 50000 }
  }]
}
```

### Vue Component Communication
**State management:** No Vuex/Pinia - uses props/events pattern:
```javascript
// App.vue → ResultsList.vue
<ResultsList 
  @find-similar="handleFindSimilar" 
  @filter-by-ids="handleFilterByIds"
  @page-change="handleBrowsePageChange"
/>

// ResultsList.vue → App.vue
this.$emit('find-similar', documentId);
this.$emit('filter-by-ids', selectedIds);
this.$emit('page-change', newPage);
```

**Navigation:**
- Three main views: Search, Browse, Bookmarks (no Clusters)
- `switchView(view)` updates `currentView.value` and URL path
- Preserves query parameters when switching views
- Active button styling with hover effects (10% lighter than active color)

**Facet filtering:** `FacetsSidebar.vue` emits filter changes → `App.vue` rebuilds query → re-searches.

**Browse cluster filtering:**
- `handleFilterByIds(ids)` sets `browseFilteredByCluster.value = true`
- Prevents server reload while cluster filter active
- Filters `fullBrowseResults` to selected IDs
- Clear filter: Sets `browseFilteredByCluster.value = false`, restores full results

### Visualization Features
**Max Documents Selector:**
- Location: Cluster controls in `ResultsList.vue`
- Options: 100, 500, 1000, 5000 documents
- Default: 1000 documents
- Purpose: Limit UMAP projection size for performance
- State: `clusterMaxDocs.value` ref in ResultsList.vue
- Passed to API: `/api/visualize/search-results?maxDocs=${clusterMaxDocs.value}`

**Visualization Availability:**
- **Search results**: "Visualize Results" button enabled when results exist
- **Browse mode**: "Visualize Results" button enabled (no query required)
- **Bookmarks**: "Visualize Results" button enabled with `bookmarkIds` parameter

**Integration:** No standalone Clusters view - visualization is inline in all views

### Document Cluster Visualization Flow
1. User clicks "Visualize" → `ResultsList.vue` calls `/api/visualize/search-results` or `/api/visualize/scatter`
2. Server checks cache key → cache miss
3. Fetches documents from Qdrant (limited by maxDocs) → extracts 768D dense vectors
4. UMAP reduces to 2D: `new UMAP({ nComponents: 2, nNeighbors: 15 })`
5. Caches result → returns `{ clusters: [{ x, y, id, category, ... }] }`
6. `ScatterPlot.vue` (in ResultsList.vue) renders with Plotly.js (box/lasso selection enabled)
7. User can select clusters → emits `cluster-selected` event with selected document IDs
8. Parent component filters results by selected IDs

**UMAP Determinism:**
Uses seeded RNG for consistent layouts:
```javascript
const seededRandom = (seed = 42) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
};
new UMAP({ random: seededRandom(12345) });
```
Full collection uses fixed seed (12345), search results use dynamic seed.

## Common Debugging Patterns

### "Collection not found" error
```bash
npm run embed  # Re-create collection with hybrid vectors + indexes
```

### "Model not found" (Ollama)
```bash
ollama pull embeddinggemma:latest
# or nomic-embed-text, mxbai-embed-large
```

### Web UI 500 errors
Check Express logs for Qdrant/Ollama connection issues:
```bash
curl http://localhost:6333/collections  # Qdrant health
curl http://localhost:11434/api/tags    # Ollama models
```

### Visualization slow/hanging
UMAP reduction is CPU-intensive (no GPU support in umap-js). Expected: ~10s for 100 docs. Use caching!

### Facets not updating on collection change
Check that component has `currentCollectionId` prop and watcher:
```javascript
// FacetBar.vue pattern
props: ['currentCollectionId'],
watch: {
  currentCollectionId: {
    handler() {
      this.loadFacets(); // Reload when collection changes
    },
    immediate: true
  }
}
```

### Collection flash on page load (seeing default collection briefly)
**Problem:** API calls happen before collection ID is set in api.js interceptor
**Solution:** Set collection in api.js immediately when determined, before any API calls:
```javascript
// App.vue initializeCollection() pattern
const targetCollectionId = urlCollection || storedCollection || null
if (targetCollectionId) {
  setCurrentCollection(targetCollectionId) // BEFORE fetchCollections()
}
const collections = await fetchCollections() // Now has correct collection
```

**Initialization flag pattern:**
```javascript
const isInitializing = ref(true)
watch(currentCollectionId, (newId, oldId) => {
  if (isInitializing.value) return // Skip watcher during initial load
  // ... reload data for collection switch
})
// In onMounted, after restoreViewFromURL:
isInitializing.value = false // Now watcher can trigger reloads
```

### Upload progress polling spam
Ensure only one polling interval active:
```javascript
// UploadProgressModal.vue pattern
watch: {
  show(newVal) {
    if (newVal && this.jobId) {
      this.startPolling(); // startPolling() must call stopPolling() first
    } else {
      this.stopPolling();
    }
  },
  jobId(newVal) {
    if (newVal && this.show) {
      this.startPolling();
    }
  }
}

### Vite alias mismatch (E2E shows red overlay)
If the UI uses imports like `@/api`, Vite must have the `@` → `src` alias configured in `web-ui/vite.config.js`.

**Symptom (Playwright/E2E):** UI never renders; Vite overlay: “Failed to resolve import \"@/api\"”.

**Fix:** Add `resolve.alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }`.
```

### Type Coercion Patterns
Always use radix parameter for `parseInt`:
```javascript
parseInt(value, 10)  // NOT parseInt(value) - avoid octal issues
parseFloat(value)    // For prices, ratings, coordinates
```

**Document ID Handling:**
Collection system introduced UUIDs alongside numeric IDs. Handle both:
```javascript
// Safe parsing for mixed ID types
const ids = req.query.ids.split(',').map(id => {
  const parsed = parseInt(id, 10);
  return isNaN(parsed) ? id : parsed; // Return string if not numeric
});
```

### Error Response Format
Consistent across all endpoints:
```javascript
res.status(400).json({ error: 'Human readable message' })  // Client errors
res.status(404).json({ error: 'Not found', code: 'SPECIFIC_CODE' })  // Not found
res.status(500).json({ error: error.message })  // Server errors
```

### Route Ordering Gotcha
**Critical:** `/api/upload-jobs/active` MUST come before `/api/upload-jobs/:jobId` or Express will match "active" as a jobId parameter.

**Why this happens:** Express routes are matched in order. Dynamic routes (`:jobId`) match any string, including "active".

**Symptoms:**
```javascript
// Console errors:
GET http://localhost:5173/api/upload-jobs/active 404 (Not Found)
AxiosError: Request failed with status code 404

// Server logs:
Job not found: active
```

**Fix:** Always define specific routes before parameterized routes:
```javascript
// ✅ CORRECT ORDER
app.get('/api/upload-jobs/active', ...)     // Specific route first
app.get('/api/upload-jobs/:jobId', ...)     // Dynamic route second

// ❌ WRONG ORDER (causes 404)
app.get('/api/upload-jobs/:jobId', ...)     // Matches "active" as jobId
app.get('/api/upload-jobs/active', ...)     // Never reached
```

**General Rule:** Specific → General (most specific routes first, dynamic routes last)

## File Upload Processing
Supports: `.txt`, `.pdf`, `.docx`, `.html`, `.md`

### Image Upload + Vision Processing
Supports (when enabled): `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`

**Enablement:** Image upload/processing is feature-flagged via env vars. The backend exposes `visionEnabled` + `supportedImageTypes` via `GET /api/config`, and the UI adjusts the upload `accept` attribute accordingly.

**Image Format Compatibility:**
Uses `sharp` library for automatic format conversion to ensure compatibility:
- **JPEG subsampling issues**: Some JPEG images with specific chroma subsampling ratios cause Ollama vision model failures
- **Solution**: All images automatically re-encoded to PNG before processing
- **Implementation**: `services/vision-service.js` uses `sharp.toFormat('png')` before base64 encoding
- **Dependency**: `sharp` v3.x (npm install sharp) - native image processing library
- **Performance**: Minimal overhead (~100-200ms for typical images), eliminates format-related errors

**Processing flow (single model call):**
- For images, the server calls Ollama Chat with an `images: [base64]` attachment and a prompt that returns 3 markdown sections:
  - `# Language` (detected language of any visible text, or `unknown`)
  - `# Description` (short but information-dense overview)
  - `# Content` (markdown “document content” suitable for embedding)
- The `# Content` section is used as the document’s `content` for embedding.

**Stored payload fields (common):**
- `document_type: 'image'` for image docs
- `description` for Overview tab
- `detected_language` when available
- `vision_processed: true` for image docs that ran through the vision model

### On-Demand Description Generation
Endpoint: `POST /api/documents/:id/generate-description`
- Generates/refreshes `payload.description` for documents that are missing it (or when user clicks refresh in UI).
- For non-image docs: uses a text-only description model over the document content.
- For images: prefers re-running vision only if raw `image_data` is available; otherwise falls back to text-only description from stored content.

**PDF Parsing Fallback Chain:**
1. Primary: `pdfjs-dist` → HTML (with table detection) → Markdown
2. Fallback 1: `@opendocsg/pdf2md` (direct PDF→Markdown)
3. Fallback 2: `pdf-parse` → basic text extraction with `processPdfText()`

**Table detection logic** (in `pdfToMarkdownViaHtml()`):
- Groups text items by Y-position (rows)
- Detects 3+ columns with large gaps (>20px)
- Converts to Markdown tables

**DOCX:** `mammoth` → Markdown (preserves headings, lists, tables)
**Temporary files:** Stored in-memory (Map) with 1-hour TTL for "search by document" feature.

**Upload Endpoint Signature:**
```javascript
// Multi-file upload support
app.post('/api/documents/upload', upload.array('files', 100), async (req, res) => {
  // Returns jobId immediately, processes files in background
});
```

**Temp File Pattern:**
1. User uploads file → `POST /api/temp-files` → returns `{tempFileId, fileName}`
2. Client stores tempFileId in URL query param for refresh persistence
3. Search by document uses tempFileId → `GET /api/temp-files/:id`
4. Cleanup: `setInterval()` removes files >1 hour old every 10 minutes

**Auto-categorization:** Optional LLM call if `CATEGORIZATION_MODEL` set

## Testing Infrastructure

### CI E2E Notes (Playwright)
- CI workflow starts a mock Ollama server for E2E to avoid depending on real models/services: `scripts/mock-ollama-server.js`.
- E2E job sets env vars (see `.github/workflows/test.yml`):
  - `OLLAMA_URL=http://127.0.0.1:11434/api/embed`
  - `EMBEDDING_MODEL=mock-embed`
  - `PII_DETECTION_ENABLED=false` (keep E2E fast/deterministic)
  - `QDRANT_URL=http://localhost:6333`
- Avoid `page.waitForLoadState('networkidle')` in E2E: Vite dev server keeps an HMR websocket open and can hang CI. Prefer `domcontentloaded` + targeted waits.
- Playwright browser install is cached in CI using `actions/cache` for `~/.cache/ms-playwright` (keyed by OS + `package-lock.json` hash). This makes the “Install Playwright browsers” step much faster on cache hits.
- Playwright generates artifacts in `playwright-report/` and `test-results/` (and CI uploads them on failure). These directories should be ignored in git.
- CI retries are controlled in `playwright.config.js` via the `retries` setting. Keep retries low in CI to fail fast when something is genuinely broken.

### Automated Tests (61 unit tests, all passing)
**Test Stack:**
- Backend: Jest 29.7.0 with Supertest 6.3.3
- Frontend: Vitest 1.1.0 with @vue/test-utils 2.4.3
- E2E: Playwright 1.40.1
- Coverage: Configured with 60-70% thresholds

**Test Structure:**
```
__tests__/
├── unit/
│   ├── services/
│   │   ├── pii-detector.test.js (30+ tests: Regex, Ollama mock, Compromise, Factory)
│   │   └── visualization-service.test.js (10 tests: Cache, UMAP with mocked Qdrant)
│   └── utils/
│       └── utilities.test.js (25+ tests: sparse vectors, hashing, metadata parsing)
├── integration/  (skeleton - marked .skip, need server.js refactoring)
├── e2e/          (Playwright tests for full flows)
└── fixtures/
    ├── documents/ (test docs with/without PII)
    └── mock-responses/ (Ollama/Qdrant mock data)
```

**Running Tests:**
```bash
npm run test              # All tests
npm run test:unit         # Backend unit tests (fast, ~1.4s) ✅ 61 passing
npm run test:integration  # Integration tests (requires Qdrant) ⚠️ Skeleton only
npm run test:frontend     # Vue component tests ⚠️ Currently skipped (need refactoring)
npm run test:e2e          # Playwright E2E (requires full stack)
npm run test:coverage     # Generate coverage report
```

**Test Status:**
- ✅ **Backend unit tests**: 61/61 passing (~1.4s) - pii-detector, visualization-service, utilities
- ✅ **Frontend unit tests**: 50/50 passing (~500ms) - SearchForm (23 tests), ResultsList (16 tests), UploadProgressModal (11 tests)
  - ScatterPlot mocked to avoid Plotly.js browser API requirements
  - API calls properly mocked (getUploadJobStatus) to prevent HTTP requests
  - window.location mocked as proper URL object
  - window.confirm mocked for dialog testing
- ⚠️ **Integration tests**: Skeleton only, marked with `.skip`, need server.js exports
- 📋 **E2E tests**: Structured but not yet run (require full application stack)

**Test Patterns:**
- **Unit tests**: Mock external dependencies (axios for Ollama, Qdrant client, API modules)
- **PII detector**: Tests all 5 methods (Regex, Ollama streaming mock, Hybrid, Compromise, Advanced)
- **Visualization**: Tests cache operations, UMAP 2D output validation with mocked data
- **Utilities**: Tests sparse vector generation, token filtering (length > 2), metadata extraction
- **Frontend components**: Use vi.mock() for child components, API mocking, async timer advancement

**Key Test Files:**
- `jest.config.js` - Backend test config (node environment, 30s timeout)
- `web-ui/vitest.config.js` - Frontend config (jsdom, Vue plugin)
- `web-ui/vitest.setup.js` - Global mocks (localStorage, window.location, window.confirm, axios, IntersectionObserver)
- `playwright.config.js` - E2E config (Chromium, screenshots on failure)
- `.env.test` - Test environment variables

### Manual Testing
- `npm run examples` - Runs 7 query patterns (location, geo, price range, etc.)
- `npm run mixed` - Tests structured + unstructured document search
- Web UI: Upload test files from `data/test_pii_*.txt`

## Key Configuration (.env)
```bash
OLLAMA_URL=http://localhost:11434/api/embed
EMBEDDING_MODEL=embeddinggemma:latest
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=documents

# Vision (optional)
VISION_MODEL_ENABLED=false
VISION_MODEL=gemma3:4b
SUPPORTED_IMAGE_TYPES=.jpg,.jpeg,.png,.gif,.webp,.bmp

# Description generation (optional)
DESCRIPTION_MODEL=

# Auto-generate overview/language at upload (non-images)
# Defaults to enabled; set to false to speed up uploads.
AUTO_GENERATE_DESCRIPTION=true

# PII Detection
PII_DETECTION_ENABLED=true
PII_DETECTION_METHOD=hybrid  # ollama|regex|hybrid|compromise|advanced
PII_DETECTION_MODEL=gemma3:4b  # Optional, defaults to EMBEDDING_MODEL

# Visualization
VIZ_CACHE_STRATEGY=memory    # memory|redis
VIZ_CACHE_TTL=3600000         # 1 hour in ms
REDIS_URL=redis://localhost:6379  # Only if VIZ_CACHE_STRATEGY=redis

# Web Server
SERVER_PORT=3001
MAX_FILE_SIZE_MB=10

# Optional Auto-Categorization
CATEGORIZATION_MODEL=        # e.g., llama3.2:latest for LLM-based metadata extraction
```

**Recommended PII Methods:**
- Development/Testing: `regex` (fast)
- Production: `hybrid` (accurate + validated)
- Maximum Coverage: `advanced` (all methods combined)

### CI E2E: Mock Ollama (Fast)
E2E tests should not depend on downloading Ollama models or running real inference in CI.

- Mock server: `scripts/mock-ollama-server.js` implements `POST /api/embed`, `POST /api/show`, and streamed `POST /api/chat`.
- Workflow: `.github/workflows/test.yml` starts the mock server in the `e2e-tests` job and sets `OLLAMA_URL=http://127.0.0.1:11434/api/embed` + `EMBEDDING_MODEL=mock-embed`.
- Default CI setting: `PII_DETECTION_ENABLED=false` for E2E to keep runs deterministic and fast.

## When Modifying Code

### Adding new search filters
1. Add filter UI in `FacetsSidebar.vue`
2. Update `buildQdrantFilter()` in `server.js`
3. Ensure field has payload index (see `initializeCollection()`)
4. **Add filter to URL query params** in `App.vue` for persistence across refreshes
   - Update URL when filter changes (use browser history API)
   - Parse URL params on component mount to restore filter state

### Adding new document types
1. Add parser in `server.js:extractTextFromFile()`
2. Update `parseMetadata()` to extract custom fields
3. Add payload indexes if filtering by new fields

### Changing embedding model
Update `.env` EMBEDDING_MODEL, re-run `npm run embed` (re-embeds all documents).

## Documentation Locations
- **Documentation convention:** Keep project documentation in `docs/` (grouped by topic). Avoid adding new top-level `*.md` files in the repo root except `README.md`.
- If you move/create docs, update links in `docs/README.md` (and root `README.md` only if it’s a primary entrypoint).
- `docs/QUICK_REFERENCE.md` - Fast command reference
- `docs/ADVANCED_QUERIES.md` - Complex filtering examples
- `docs/LOCATION_SEARCH_EXAMPLES.md` - Location/geo queries
- `docs/MIXED_DATASET.md` - Structured vs unstructured handling
- `docs/FILE_UPLOAD_IMPLEMENTATION.md` - Upload system architecture
- `docs/WEBUI_ARCHITECTURE.md` - System diagrams
- `docs/PII_DETECTION.md` - PII scanning guide
- `docs/TESTING_PLAN.md` - Testing strategy and roadmap
- `docs/TEST_IMPLEMENTATION_COMPLETE.md` - Summary of the implemented test suite

## Documentation Standards

### Table of Contents Guidelines
When creating or updating documentation files, follow these conventions:

**When to add a TOC:**
- Documents with >200 lines
- Documents with 5+ main sections (##)
- Complex multi-topic documents requiring navigation

**TOC Format:**
- Use markdown list with anchor links
- Place after document title and brief description, before first main section
- Format: `- [Section Name](#section-name)`
- For emoji sections: `- [🎯 Overview](#-overview)` (emoji preserved, rest lowercase with hyphens)

**Section Anchor Rules:**
- Convert to lowercase
- Replace spaces with hyphens
- Remove special characters (except emojis at start)
- Examples:
  - `## Key Features` → `#key-features`
  - `## 🎯 Overview` → `#-overview`
  - `## Phase 1: Unit Tests` → `#phase-1-unit-tests`

**Maintenance:**
- Update TOC when adding/removing/renaming sections
- Verify all anchor links work after structural changes
- Keep TOC synchronized with actual document structure

**Example TOC Structure:**
```markdown
# Document Title

Brief description of what this document covers.

## Table of Contents
- [Section One](#section-one)
- [Section Two](#section-two)
  - Note: Subsections (###) typically not included in TOC unless document is very long
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## Section One
...
```
