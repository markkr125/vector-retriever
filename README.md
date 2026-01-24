# 🔍 Vector Retriever

<div align="left">
  <img src="docs/images/puppy-transparent.png" alt="Vector Retriever Logo" width="120"/>
</div>

General purpose vector database application showcasing **Qdrant's powerful features** with Ollama embeddings. This project demonstrates hybrid search, complex payload filtering, geo-queries, PII detection, and interactive document visualization.

## 📑 Table of Contents

- [Key Features Demonstrated](#-key-features-demonstrated)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Docker Deployment](#-docker-deployment)
- [Web UI](#-web-ui)
- [Basic Usage](#-basic-usage)
- [Usage Examples](#-usage-examples)
- [Advanced Search Examples](#-advanced-search-examples)
- [Dataset Structure](#-dataset-structure)
- [Configuration](#-configuration)
- [Architecture](#️-architecture)
- [Learning Resources](#-learning-resources)
- [Example Output](#-expected-output-examples)
- [Customization](#️-customization)
- [Troubleshooting](#-troubleshooting)
- [Project Structure](#-project-structure)
- [Next Steps](#-next-steps)

## 📚 Additional Documentation

- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Fast command reference and key features
- **[Complete Summary](docs/SUMMARY.md)** - Comprehensive project overview
- **[Cloud Import Guide](docs/CLOUD_IMPORT.md)** - Import from S3/Google Drive with advanced filtering
- **[Hybrid Search Implementation](docs/HYBRID_SEARCH_IMPLEMENTATION.md)** - Technical guide to weighted fusion, score normalization, and deep pagination
- **[Mixed Dataset Guide](docs/MIXED_DATASET.md)** - Handling structured + unstructured documents
- **[Location Search Examples](docs/LOCATION_SEARCH_EXAMPLES.md)** - City and geo-radius queries
- **[Advanced Queries](docs/ADVANCED_QUERIES.md)** - Complex filtering patterns
- **[Document Cluster Visualization](docs/VISUALIZATION.md)** - Interactive 2D visualization guide
- **[File Upload System](docs/FILE_UPLOAD_IMPLEMENTATION.md)** - Upload jobs, multi-file processing, and supported formats
- **[Office File Support](docs/OFFICE_FILE_SUPPORT.md)** - CSV/XLSX/PPTX/RTF + optional LibreOffice conversion for legacy Office/ODF

## 🌟 Key Features Demonstrated

### 1. **Native Hybrid Search**
- Combines **dense vectors** (semantic/embedding-based) with **sparse vectors** (keyword/BM25-like)
- **Weighted formula fusion** with explicit control via UI slider
- Adjustable balance: 0.0 (pure keyword) to 1.0 (pure semantic), default 0.7
- **Dynamic prefetch limits** supporting deep pagination through all results
- Scores capped at 100% for clean, consistent display across all pages
- Demonstrates how semantic understanding enhances keyword matching

### 2. **Document Cluster Visualization** 🆕
- **Interactive 2D scatter plots** of your entire document collection
- **UMAP dimensionality reduction** (768D → 2D) for semantic clustering
- **Smart caching** with in-memory or Redis backend
- **Color coding** by category, PII risk, or upload date
- **Multi-select** with box/lasso selection tools
- **Click-to-explore** similar documents instantly
- See [Visualization Guide](docs/VISUALIZATION.md) for details

### 3. **Advanced Payload Filtering**
- **Complex conditions**: `must`, `should`, `must_not` operators
- **Nested field filtering**: Arrays, objects, and deep structures
- **Numeric range queries**: Price, ratings, dates
- **Geo-filtering**: Radius searches with coordinates
- **Tag matching**: ANY/ALL semantics for array fields
- **Payload indexing**: Fast filtered searches without full collection scans

### 4. **Rich Metadata Support**
Each document includes structured metadata:
- Category, location, tags, ratings
- Prices, dates, status fields
- Geographic coordinates for geo-queries
- Custom fields for domain-specific filtering

### 5. **Mixed Dataset Handling**
- **Structured documents**: Rich metadata with category, location, tags, prices, ratings
- **Unstructured documents**: Plain text without metadata (essays, articles, notes)
- **Seamless coexistence**: Both types searchable with semantic/hybrid search
- **Flexible filtering**: Filter by document type (`is_unstructured`, `has_structured_metadata`)
- **Real-world scenario**: Handles heterogeneous document collections naturally

### 6. **Upload Deduplication (Per Collection)**
- Re-uploading the same file automatically **updates** the existing document (no prompt)
- Uses stable IDs (cloud imports prefer provider IDs/keys; local uploads fall back to filename)
- Preserves original `added_at` and sets `last_updated` on updates (shown in the Web UI)

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **Docker** and **Docker Compose** (for running Qdrant locally)
- **Ollama** with an embedding model installed

## 🚀 Quick Start

### 1. Start Qdrant Vector Database

Run Qdrant locally using Docker Compose:

```bash
# Start Qdrant container
docker-compose -f qdrant-docker-compose.yml up -d

# Verify it's running
curl http://localhost:6333/collections
```

Qdrant will be available at:
- REST API & Dashboard: `http://localhost:6333`
- gRPC: `localhost:6334`
- Storage: `./qdrant_storage` (persistent)

To stop Qdrant:
```bash
docker-compose -f qdrant-docker-compose.yml down
```

### 2. Install Ollama and Models

Ollama provides the AI models for this project. You'll need:

**Required: Embedding Model** (for vector search)
```bash
# Install Ollama (see https://ollama.ai)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull an embedding model (REQUIRED)
# For general use and small-medium documents:
ollama pull embeddinggemma:latest

# For large documents (>2K tokens) or multilingual content:
ollama pull qwen3-embedding:0.6b

# Other options:
# ollama pull nomic-embed-text      # 768 dimensions, lightweight
# ollama pull mxbai-embed-large     # 1024 dimensions, high accuracy
```

**Optional: Chat Model** (for PII detection and auto-categorization)
```bash
# If you want PII detection or auto-categorization features:
ollama pull gemma3:4b              # Recommended (best results for both)
# or: ollama pull llama3.2:latest  # Good alternative
# or: ollama pull gemma2:2b         # Lightweight option
```

> **Note:** Chat models are only needed if you enable `PII_DETECTION_ENABLED=true` or set a `CATEGORIZATION_MODEL` in your `.env` file.

### 3. Setup Project

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env to match your setup
# Update Qdrant URL to http://localhost:6333 if running locally
# Update Ollama URL if needed (default: http://localhost:11434/api/embed)
```

### 4. Embed Documents

```bash
npm run embed
```

This will:
- Create a Qdrant collection with hybrid search support (dense + sparse vectors)
- Set up payload indexes for fast filtering
- Process all `.txt` files in the `sample-data/` directory
- Generate both semantic embeddings and keyword-based sparse vectors
- Store documents with rich metadata

### 5. Run Searches

**Semantic Search** (dense vectors only):
```bash
npm run search "luxury hotels with excellent service"
```

**Hybrid Search** (semantic + keyword):
```bash
npm run hybrid "italian restaurant with wine cellar"
```

**Location Search** (filter by city):
```bash
node index.js location Paris "art museum"
node index.js location Boston "medical treatment"
```

**Geo-Radius Search** (within distance):
```bash
node index.js geo 48.8566 2.3522 50000 "tourist attractions"
# Searches within 50km of Paris coordinates
```

**Interactive Demo** (showcases all features):
```bash
npm run demo
```

**Advanced Examples** (complex filtering):
```bash
node examples/examples.js
```

## 🐳 Docker Deployment

Deploy the entire stack with Docker Compose for production use.

### Prerequisites

- Docker with Docker Compose v2
- GPU support (optional but recommended):
  - **NVIDIA**: Requires [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
  - **AMD/Intel**: Requires Vulkan drivers (`sudo apt install mesa-vulkan-drivers`)

### Quick Start (Recommended)

Use the auto-detect script - it automatically selects the right compose file for your GPU:

```bash
# Configure your models in .env
cp .env.example .env
# Edit .env to set EMBEDDING_MODEL and other model settings

# Start with auto-detected GPU (recommended)
./docker/start.sh

# Other commands
./docker/start.sh stop      # Stop services
./docker/start.sh logs      # View logs
./docker/start.sh models    # List installed models
./docker/start.sh pull-status  # Check model download progress
```

### Manual Start

```bash
# Choose based on your GPU:
docker compose -f docker/docker-compose.yml up -d         # NVIDIA GPU
docker compose -f docker/docker-compose.vulkan.yml up -d  # AMD/Intel GPU (Vulkan)
docker compose -f docker/docker-compose.cpu.yml up -d     # No GPU (CPU only)
```

### Access Points

- **Web UI**: http://localhost:8080
- **API**: http://localhost:3001
- **Qdrant Dashboard**: http://localhost:6333/dashboard

### First Start: Wait for Model Downloads

⚠️ On first startup, Ollama downloads models in the background. This can take several minutes. If you get "model not found" or 400 errors, wait for downloads to complete:

```bash
./docker/start.sh models       # Check what's installed
./docker/start.sh pull-status  # Check download progress
```

See [docker/README.md](docker/README.md) for detailed Docker documentation, GPU setup, and troubleshooting.

## 🌐 Web UI

A modern web interface is available for interactive searching!

### Start Web UI

```bash
# One command to start everything
npm run webui
```

This will:
1. Start the API server (port 3001)
2. Start the Vue.js frontend (port 5173)
3. Open your browser to http://localhost:5173

### Features

- **Multiple Search Types**: Semantic, Hybrid, Location, Geo-radius
- **Advanced Filtering**: Category, price range, ratings, tags, document type
- **Cloud Import**: Direct import from AWS S3 buckets with file selection and filtering
- **Interactive Results**: Expandable cards with full metadata
- **Real-time Search**: Instant results as you type
- **Beautiful UI**: Modern, responsive design

### Manual Start

Start services separately:

```bash
# Terminal 1: API Server
npm run server

# Terminal 2: Vue UI
cd web-ui && npm run dev
```

See [web-ui/README.md](web-ui/README.md) for detailed documentation.

## 📖 Basic Usage

### Command Line Interface

**Semantic Search** (dense vectors only):
```bash
npm run search "luxury hotels with excellent service"
```

**Hybrid Search** (semantic + keyword):
```bash
npm run hybrid "italian restaurant with wine cellar"
```

**Advanced Examples** (complex filtering):
```bash
node examples/examples.js
```

## 📖 Usage Examples

### Basic Semantic Search
```bash
node index.js search "artificial intelligence and machine learning"
```

### Hybrid Search (Best Results)
```bash
node index.js hybrid "romantic fine dining restaurants"
```

### Run Comprehensive Demo
```bash
node index.js demo
```

The demo showcases:
1. **Semantic search** - Pure embedding-based retrieval
2. **Hybrid search** - Combined semantic + keyword matching
3. **Complex filtering** - Must/should/must_not conditions
4. **Price range filtering** - Numeric range queries
5. **Tag-based filtering** - Array field matching
6. **Geo-filtering** - Radius-based location searches

## 🎯 Advanced Search Examples

### Complex Filtering with Must/Should/Must_Not

```javascript
await filteredSearch('great food and atmosphere', {
  must: [
    { key: 'category', match: { value: 'restaurant' } }
  ],
  should: [
    { key: 'rating', range: { gte: 4.5 } },
    { key: 'tags', match: { any: ['fine-dining', 'romantic'] } }
  ],
  must_not: [
    { key: 'status', match: { value: 'closed' } }
  ]
}, 5);
```

**Results**: Restaurants with high ratings OR specific tags, excluding closed venues.

### Price Range Filter

```javascript
await filteredSearch('nice place to stay', {
  must: [
    { key: 'price', range: { gte: 100, lte: 300 } }
  ]
}, 5);
```

**Results**: Accommodations in the $100-$300 price range.

### Tag Matching (Array Fields)

```javascript
await filteredSearch('outdoor activities', {
  must: [
    { key: 'tags', match: { any: ['outdoor', 'adventure', 'nature'] } }
  ]
}, 5);
```

**Results**: Items tagged with at least one of the specified tags.

### Geo-Filtered Search

```javascript
await geoSearch('tourist attractions', 40.7128, -74.0060, 50000, 5);
```

**Results**: Attractions within 50km of New York City coordinates.

## 📁 Dataset Structure

The `sample-data/` directory contains **27 documents** with both structured and unstructured formats:

**21 Structured Documents (with rich metadata):**

```
sample-data/
├── Hotels (4): Paris, London, Tokyo, Dubai
├── Restaurants (4): NYC, Boston, SF, Singapore
├── Attractions (3): Museums, Theme Parks, National Parks
├── Technology (3): AI, Quantum, Blockchain
├── Coworking (1): Barcelona tech hub
├── Medical (1): Boston hospital
├── Education (1): Cambridge University
├── Fitness (1): LA luxury gym
├── Cafés (1): Melbourne specialty coffee
└── Shopping (1): Tokyo Akihabara electronics
```

**6 Unstructured Documents (plain text, no metadata headers):**

```
sample-data/
├── unstructured_meditation_guide.txt - Mindfulness essay
├── unstructured_sourdough_recipe.txt - Bread making guide
├── unstructured_deep_learning.txt - AI/ML technical article
├── unstructured_climate_essay.txt - Environmental piece
├── unstructured_business_story.txt - Corporate narrative
└── unstructured_jazz_history.txt - Music history essay
```

### Metadata Format

**Structured documents** include metadata at the top:

```
Category: hotel
Location: Paris
Date: 2025-01-15
Tags: luxury, spa, fine-dining, romantic, city-center
Price: 450.00
Rating: 4.8
Status: open
Coordinates: 48.8566, 2.3522

[Document content...]
```

**Unstructured documents** are plain text without headers, automatically tagged with:
- `is_unstructured: true`
- `has_structured_metadata: false`
- Auto-detected topic from content
- Word/character counts

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

#### Required Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434/api/embed` | Ollama API endpoint for embeddings |
| `EMBEDDING_MODEL` | `embeddinggemma:latest` | Embedding model name (must be pulled first) |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector database URL |
| `COLLECTION_NAME` | `documents` | Name of the Qdrant collection to use |

#### Web Server (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `3001` | Port for the Express API server |
| `MAX_FILE_SIZE_MB` | `10` | Maximum upload file size in megabytes |

#### LibreOffice Conversion (Optional - Legacy Office / OpenDocument)

Some legacy formats (Word 97-2003, PowerPoint 97-2003, Excel 97-2003, and OpenDocument) require LibreOffice for conversion.

```env
# LibreOffice Conversion (optional - for legacy Office and OpenDocument formats)
LIBREOFFICE_ENABLED=false  # Set to 'true' to enable support for .doc, .ppt, .xls, .odt, .odp, .ods files
LIBREOFFICE_PATH=  # Optional: path to LibreOffice soffice binary (auto-detected if not set)
LIBREOFFICE_TIMEOUT_MS=60000  # Conversion timeout in milliseconds (default: 60000 = 60 seconds)
LIBREOFFICE_MAX_CONCURRENCY=2  # Maximum concurrent LibreOffice conversions (default: 2)
```

See [Office File Support](docs/OFFICE_FILE_SUPPORT.md) for supported formats, conversion behavior, and troubleshooting.

#### PII Detection (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PII_DETECTION_ENABLED` | `false` | Enable automatic PII scanning on uploads |
| `PII_DETECTION_METHOD` | `hybrid` | Detection method: `ollama`, `regex`, `hybrid`, `compromise`, `advanced` |
| `PII_DETECTION_MODEL` | _(uses EMBEDDING_MODEL)_ | Chat model for LLM-based PII detection (recommended: `gemma3:4b`) |

> **💡 PII Detection:** Set to `true` to automatically scan uploaded documents for sensitive information (SSN, credit cards, emails, etc.). Requires a chat model. See [PII Detection Guide](docs/PII_DETECTION.md) for details.

#### Auto-Categorization (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `CATEGORIZATION_MODEL` | _(disabled)_ | Chat model for automatic metadata extraction (recommended: `gemma3:4b`) |

> **💡 Auto-Categorization:** Set a model to automatically extract category, location, tags, and other metadata from uploaded documents using LLM.

#### Vision & Image Processing (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `VISION_MODEL_ENABLED` | `false` | Enable image upload and processing with vision models |
| `VISION_MODEL` | `gemma3:4b` | Vision model for image analysis (must support vision/multimodal) |
| `DESCRIPTION_MODEL` | _(uses CATEGORIZATION_MODEL)_ | Model for generating document descriptions |
| `SUPPORTED_IMAGE_TYPES` | `.jpg,.jpeg,.png,.gif,.webp,.bmp` | Comma-separated list of supported image file extensions |
| `AUTO_GENERATE_DESCRIPTION` | `true` | Automatically generate overview and language detection at upload time |

> **💡 Vision Processing:** Enable to upload and process images (`.jpg`, `.png`, etc.). The vision model extracts descriptions, detects language, and generates searchable content. Set `AUTO_GENERATE_DESCRIPTION=false` to speed up uploads by skipping automatic description generation.

#### Visualization Cache (Advanced)

| Variable | Default | Description |
|----------|---------|-------------|
| `VIZ_CACHE_STRATEGY` | `memory` | Cache strategy: `memory` (in-RAM) or `redis` (external) |
| `VIZ_CACHE_TTL` | `3600000` | Cache time-to-live in milliseconds (1 hour) |
| `REDIS_URL` | `redis://localhost:6379` | Redis URL (only needed if strategy is `redis`) |

#### Authentication (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_TOKEN` | _(none)_ | Optional authentication token for Ollama API |

### Supported Embedding Models

**Any embedding model from Ollama is supported!** The table below shows popular recommendations, but you can use any model from the [Ollama Library](https://ollama.com/search?c=embedding).

> **💡 Performance Tip:** Larger models generally produce better quality embeddings and search results. The tradeoff is slower embedding speed and more disk space.

#### Recommended Models

| Model | Model Size | Context Window | Dimensions | Parameters | Best For |
|-------|-----------|----------------|------------|------------|----------|
| `qwen3-embedding:0.6b` | 639MB | **32K tokens** | 768-4096 (flexible) | 596M | **Large documents, long-form content, code** |
| `embeddinggemma:latest` | 622MB | 2K tokens | 768 | 308M | General purpose, 100+ languages |
| `nomic-embed-text` | 274MB | 2K tokens | 768 | 137M | Lightweight, general purpose |
| `mxbai-embed-large` | 670MB | 512 tokens | 1024 | 335M | High accuracy, short documents |

#### Choosing the Right Model

**Context Window Limits:**
- Documents exceeding a model's context window will be rejected with an error
- Most documents are <2K tokens (~8,000 characters)
- For large documents (PDFs, research papers, long articles), use `qwen3-embedding:0.6b`

**Recommendations:**
- **Default**: `embeddinggemma:latest` - Good balance of speed, quality, and size
- **Large Documents**: `qwen3-embedding:0.6b` - 16x larger context window (32K vs 2K tokens)
- **Lightweight**: `nomic-embed-text` - Smallest model size, good performance
- **Accuracy**: `mxbai-embed-large` - Best quality for short texts, but limited context

**Dimension Compatibility:**
- If using a model with dimensions other than 768, you must update the collection schema
- See the Troubleshooting section for "Wrong vector dimensions"

**Using Other Models:**
- Browse available models at [ollama.com/search?c=embedding](https://ollama.com/search?c=embedding)
- Pull any model: `ollama pull <model-name>`
- Update your `.env` file: `EMBEDDING_MODEL=<model-name>`
- Re-embed your documents: `npm run embed`

> **⚠️ Important:** When changing models, you must re-embed all documents as embeddings from different models are not compatible.

> **💡 Tip:** The application automatically detects your model's context limit on startup and validates document sizes before embedding.

### Optional Features Setup

#### Enable PII Detection

To scan documents for personally identifiable information:

1. Pull a chat model: `ollama pull gemma3:4b`
2. Update `.env`:
   ```env
   PII_DETECTION_ENABLED=true
   PII_DETECTION_METHOD=advanced
   PII_DETECTION_MODEL=gemma3:4b
   ```
3. Restart the server: `npm run server`

See [PII Detection Documentation](docs/PII_DETECTION.md) for detailed configuration.

#### Enable Auto-Categorization

To automatically extract metadata from uploads:

1. Pull a chat model: `ollama pull gemma3:4b`
2. Update `.env`:
   ```env
   CATEGORIZATION_MODEL=gemma3:4b
   ```
3. Restart the server

The system will now extract categories, locations, tags, prices, and dates from uploaded documents.

## 🏗️ Architecture

### Qdrant Collection Structure

```javascript
{
  vectors: {
    dense: {
      size: 768,              // Semantic embeddings
      distance: 'Cosine'
    }
  },
  sparse_vectors: {
    sparse: {                 // Keyword-based vectors
      index: { on_disk: false }
    }
  }
}
```

### Payload Indexes

For fast filtered searches, the following indexes are created:

- `category` (keyword index)
- `location` (keyword index)
- `tags` (keyword index)
- `price` (float index)
- `rating` (float index)
- `status` (keyword index)
- `coordinates` (geo index)

### Hybrid Search Process

1. **Text → Dense Vector**: Ollama generates semantic embedding
2. **Text → Sparse Vector**: Simple tokenization with frequency counts
3. **Query Qdrant**: Both vectors sent simultaneously
4. **Score Fusion**: Qdrant combines scores for optimal ranking
5. **Results**: Documents ranked by combined relevance

## 🎓 Learning Resources

### Qdrant Features Demonstrated

1. **Hybrid Search**: [Documentation](https://qdrant.tech/documentation/concepts/hybrid-queries/)
2. **Payload Filtering**: [Documentation](https://qdrant.tech/documentation/concepts/filtering/)
3. **Geo-Filtering**: [Documentation](https://qdrant.tech/documentation/concepts/filtering/#geo)
4. **Sparse Vectors**: [Documentation](https://qdrant.tech/articles/sparse-vectors/)

### Why Hybrid Search?

- **Semantic search** excels at understanding intent and meaning
- **Keyword search** ensures exact term matching (names, codes, IDs)
- **Hybrid** combines both for superior relevance

**Example**: Query "Paris luxury hotel spa"
- **Semantic**: Finds related concepts (wellness, treatment, massage)
- **Keyword**: Ensures "Paris" and "spa" appear in text
- **Hybrid**: Best of both worlds

## 📊 Expected Output Examples

### Semantic Search
```
🔍 Semantic Search: "artificial intelligence and machine learning"

Results:
1. Score: 0.8723
   File: technology_ai_development.txt
   Category: technology
   Content: Artificial intelligence continues revolutionizing industries...

2. Score: 0.7654
   File: technology_quantum_computing.txt
   Category: technology
   Content: Quantum computing harnesses quantum mechanical phenomena...
```

### Hybrid Search
```
🔍 Hybrid Search: "luxury hotels with excellent service"
   (Dense weight: 0.7, Sparse weight: 0.3)

Results:
1. Score: 0.9234
   File: hotel_luxury_paris.txt
   Category: hotel
   Tags: luxury, spa, fine-dining, romantic, city-center
   Content: The Grand Hotel Lumière stands as a beacon of elegance...
```

### Filtered Search
```
🔍 Filtered Search: "great food and atmosphere"
   Filters: {
     "must": [{"key": "category", "match": {"value": "restaurant"}}],
     "should": [{"key": "rating", "range": {"gte": 4.5}}],
     "must_not": [{"key": "status", "match": {"value": "closed"}}]
   }

Found 3 results:
1. Score: 0.8456
   File: restaurant_italian_newyork.txt
   Category: restaurant
   Price: $85
   Rating: 4.7/5
   Location: New York
```

## 🛠️ Customization

### Adding Custom Documents

**Structured documents** (with metadata) - Create `.txt` files in `sample-data/`:

```
Category: your_category
Location: city_name
Tags: tag1, tag2, tag3
Price: 99.99
Rating: 4.5
Status: open
Coordinates: 40.7128, -74.0060

Your document content here...
```

**Unstructured documents** (plain text) - Simply add `.txt` files without headers:

```
Just write your content directly. No metadata needed.
The system will automatically extract topic, word count,
and mark it as unstructured.

Perfect for essays, articles, notes, or any plain text content.
```

### Searching Mixed Datasets

```bash
# Search ONLY structured documents
node index.js search "luxury hotels" --filter '{"must":[{"key":"has_structured_metadata","match":{"value":true}}]}'

# Search ONLY unstructured documents  
node index.js search "meditation" --filter '{"must":[{"key":"is_unstructured","match":{"value":true}}]}'

# Search ALL documents (default)
node index.js search "technology innovation"
```

**Or use the mixed examples script**:
```bash
node examples/mixed_examples.js
```

This demonstrates:
- Filtering by document type
- Dataset statistics
- Side-by-side structured vs unstructured results
- How both types work equally well for semantic search

### Adjusting Search Parameters

Edit functions in `index.js`:

- **Dense/Sparse weight**: Modify `denseWeight` parameter (0.0 to 1.0)
- **Result limit**: Change `limit` parameter
- **Filter conditions**: Customize filter objects

## 🐛 Troubleshooting

### "Collection already exists" error
```bash
# Delete existing collection via Qdrant API
curl -X DELETE http://192.168.50.87:6333/collections/documents
# Then re-run embed
npm run embed
```

### Wrong vector dimensions
Update the collection size in `index.js` to match your model:
```javascript
dense: {
  size: 768,  // Change based on your model
  distance: 'Cosine'
}
```

### Ollama connection issues
```bash
# Check Ollama is running
ollama list

# Test embedding endpoint
curl http://localhost:11434/api/embed -d '{
  "model": "nomic-embed-text",
  "input": "test"
}'
```

## 📝 Project Structure

```
vector-retriever/
├── index.js                          # CLI tool (embed/search/hybrid/examples)
├── server.js                         # Express API entrypoint (mounts routers + initializes services)
├── routes/                           # Express routers (mounted under /api)
├── services/                         # Core services (embedding, document processing, PII, visualization)
├── middleware/                       # Shared middleware (collection handling)
├── state/                            # In-memory state stores + cleanup timers
├── utils/                            # Pure helpers (metadata parsing, sparse vectors, PDF helpers)
├── examples/                         # Example scripts
│   ├── examples.js                   # 7 advanced filtering examples
│   └── mixed_examples.js             # Structured vs unstructured demos
├── start-webui.sh                    # Web UI startup script
├── scripts/                          # Dev/test helper scripts
├── __tests__/                        # Unit/integration/e2e tests
├── package.json                      # Dependencies
├── .env                              # Configuration (gitignored)
├── .env.example                      # Template configuration
├── .gitignore                        # Git ignore rules
├── README.md                         # This file (you are here)
├── docs/                             # Additional documentation
│   ├── SUMMARY.md                    # Complete project overview
│   ├── QUICK_REFERENCE.md            # Fast command reference
│   ├── MIXED_DATASET.md              # Mixed dataset handling guide
│   ├── LOCATION_SEARCH_EXAMPLES.md   # Location/geo query examples
│   ├── ADVANCED_QUERIES.md           # Complex filtering patterns
│   └── VISUALIZATION.md              # Document cluster visualization
├── web-ui/                           # Vue.js web interface
│   ├── src/
│   │   ├── App.vue                   # Main Vue component
│   │   ├── main.js                   # Vue entry point
│   │   ├── style.css                 # Global styles
│   │   ├── api.js                    # API client
│   │   └── components/
│   │       ├── SearchForm.vue        # Search form component
│   │       └── ResultsList.vue       # Results display component
│   ├── index.html                    # HTML entry point
│   ├── vite.config.js                # Vite configuration
│   ├── package.json                  # UI dependencies
│   └── README.md                     # Web UI documentation
└── sample-data/                      # Document corpus (27 files)
    ├── hotel_*.txt                   # Structured hotels (4)
    ├── restaurant_*.txt              # Structured restaurants (4)
    ├── attraction_*.txt              # Structured attractions (3)
    ├── technology_*.txt              # Structured tech (3)
    ├── coworking_*.txt               # Structured coworking (1)
    ├── hospital_*.txt                # Structured medical (1)
    ├── university_*.txt              # Structured education (1)
    ├── gym_*.txt                     # Structured fitness (1)
    ├── cafe_*.txt                    # Structured cafes (1)
    ├── museum_*.txt                  # Structured museums (1)
    ├── shopping_*.txt                # Structured shopping (1)
    └── unstructured_*.txt            # Plain text essays (6)
```

## 🚀 Next Steps

1. **Add more documents**: Expand the dataset with domain-specific content

2. **Implement reranking**: Add a second-stage reranker for even better results
   - **Two-stage approach**: Vector search retrieves top 100 candidates (fast), then a cross-encoder model re-scores them (accurate)
   - **Why it works**: Vector search excels at recall (finding relevant documents), cross-encoders excel at precision (perfect ranking)
   - **The tradeoff**: Cross-encoders process query + document together, making them too slow for millions of docs but perfect for re-ranking finalists
   - **Models to use**: `cross-encoder/ms-marco-MiniLM-L-6-v2` or Cohere's rerank API

3. **Batch processing**: Handle large document collections efficiently

4. **Custom sparse vectors**: Integrate proper BM25 or SPLADE models
   - **Current limitation**: This project uses simple token hashing for demonstration (counts word frequencies)
   - **BM25**: Classic algorithm that's smarter - considers term rarity, document length, and term frequency with proper weighting
   - **SPLADE**: Neural sparse vectors that learn semantic importance (e.g., "car" can boost "automobile" even if word doesn't appear)
   - **Libraries**: Use `rank-bm25` (Python) or integrate SPLADE via sentence-transformers for production systems

5. **Production deployment**: Docker Compose setup with monitoring

6. **Document analysis preview**: "Analyze Document" screen
   - Preview document content without adding it to the collection
   - Show key information: summary, entities, topics, language detection
   - Display metadata extraction preview (categories, tags, dates, pii)
   - Quick decision tool: "Should I add this document?"

7. - **Batch processing**: Background import with progress tracking and error handling

## 📄 License

MIT

---

**Happy searching! 🔍**
