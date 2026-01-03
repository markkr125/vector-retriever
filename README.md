# Vector Retriever

General purpose vector database application showcasing **Qdrant's powerful features** with Ollama embeddings. This project demonstrates hybrid search, complex payload filtering, geo-queries, PII detection, and interactive document visualization.

## 📑 Table of Contents

- [Key Features Demonstrated](#-key-features-demonstrated)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
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
- **[Mixed Dataset Guide](docs/MIXED_DATASET.md)** - Handling structured + unstructured documents
- **[Location Search Examples](docs/LOCATION_SEARCH_EXAMPLES.md)** - City and geo-radius queries
- **[Advanced Queries](docs/ADVANCED_QUERIES.md)** - Complex filtering patterns
- **[Document Cluster Visualization](docs/VISUALIZATION.md)** - Interactive 2D visualization guide

## 🌟 Key Features Demonstrated

### 1. **Native Hybrid Search**
- Combines **dense vectors** (semantic/embedding-based) with **sparse vectors** (keyword/BM25-like)
- Automatic score fusion for optimal relevance
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

### 2. Install Ollama and Embedding Model

```bash
# Install Ollama (see https://ollama.ai)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull an embedding model
ollama pull embeddinggemma:latest
# or: ollama pull nomic-embed-text
# or: ollama pull mxbai-embed-large
# or: ollama pull bge-large
```

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
- Process all `.txt` files in the `data/` directory
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
node examples.js
```

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
node examples.js
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

The `data/` directory contains **27 documents** with both structured and unstructured formats:

**21 Structured Documents (with rich metadata):**

```
data/
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
data/
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

`.env` file configuration:

```env
# Ollama API
OLLAMA_URL=http://localhost:11434/api/embed
AUTH_TOKEN=                    # Optional authentication
MODEL=nomic-embed-text         # Embedding model name

# Qdrant
QDRANT_URL=http://192.168.50.87:6333
COLLECTION_NAME=documents
```

### Supported Embedding Models

- `nomic-embed-text` - 768 dimensions (recommended)
- `mxbai-embed-large` - 1024 dimensions
- `bge-large` - 1024 dimensions
- `snowflake-arctic-embed` - 1024 dimensions

**Note**: Update the vector size in `index.js` (line ~137) if using models with different dimensions.

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

**Structured documents** (with metadata) - Create `.txt` files in `data/`:

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
node mixed_examples.js
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
├── examples.js                       # 7 advanced filtering examples
├── mixed_examples.js                 # Structured vs unstructured demos
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
└── data/                             # Document corpus (27 files)
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
3. **Batch processing**: Handle large document collections efficiently
4. **Custom sparse vectors**: Integrate proper BM25 or SPLADE models
5. **Multi-language support**: Handle non-English documents
6. **Production deployment**: Docker Compose setup with monitoring

## 📄 License

MIT

---

**Happy searching! 🔍**
