# Qdrant Features Demo - Quick Reference

## ✅ Working Features

### 1. **Hybrid Search** (Semantic + Keyword)
Combines dense embeddings with sparse BM25-like vectors for superior relevance.

**Example:**
```bash
node index.js hybrid "quantum computing cryptography"
```

### 2. **Complex Payload Filtering**

#### Must/Should/Must_Not Logic
```javascript
{
  must: [{ key: 'category', match: { value: 'restaurant' } }],
  should: [
    { key: 'rating', range: { gte: 4.5 } },
    { key: 'tags', match: { any: ['fine-dining', 'romantic'] } }
  ],
  must_not: [{ key: 'status', match: { value: 'closed' } }]
}
```

#### Price Range Filtering
```javascript
{
  must: [{ key: 'price', range: { gte: 100, lte: 300 } }]
}
```

#### Tag Matching (Array Fields)
```javascript
{
  must: [
    { key: 'tags', match: { any: ['outdoor', 'adventure', 'nature'] } }
  ]
}
```

### 3. **Geo-Filtering**
Search within radius of coordinates.

**Example:** Find within 50km of NYC
```javascript
filter: {
  must: [{
    key: 'coordinates',
    geo_radius: {
      center: { lat: 40.7128, lon: -74.0060 },
      radius: 50000  // meters
    }
  }]
}
```

### 4. **Query by Example (Web UI)**
Upload a document (TXT, MD, PDF, DOCX) to find similar content.

**Features:**
- Automatic text extraction from uploaded files
- PDF parsing with multiple fallback methods
- Generate embeddings from document content
- Find semantically similar documents in the collection
- Temp file storage with 1-hour TTL for URL bookmarking
- URL persistence: Share/bookmark uploaded document searches

**Usage:**
1. Start web UI: `npm run webui`
2. Select "By Document" search type
3. Upload a document file
4. Results show documents similar to uploaded content
5. URL includes tempFileId - bookmark or share the search
6. Refresh works: temp file persists for 1 hour

**API Endpoint:**
```bash
curl -X POST http://localhost:5000/api/search/by-document \
  -F "file=@document.pdf" \
  -F "limit=10"
```

### 5. **Payload Indexes**
Fast filtering without full scans on:
- category, location, tags, status (keyword indexes)
- price, rating (float indexes)
- coordinates (geo index)

## 📊 Dataset Summary

**27 Documents Embedded:**

### Structured Documents (21)
- **Hotels (4)**: Paris, London, Tokyo, Dubai
- **Restaurants (4)**: NYC, SF, Boston, Singapore  
- **Attractions (3)**: Smithsonian, Theme Park, Yosemite
- **Technology (3)**: AI/ML, Quantum, Blockchain
- **Coworking (1)**: Barcelona tech hub
- **Medical (1)**: Boston hospital
- **Education (1)**: Cambridge University
- **Fitness (1)**: LA luxury gym
- **Cafés (1)**: Melbourne specialty coffee
- **Museums (1)**: Paris Musée d'Orsay
- **Shopping (1)**: Tokyo Akihabara electronics

### Unstructured Documents (6)
- Meditation guide (338 words)
- Sourdough recipe (424 words)
- Deep learning article (482 words)
- Climate essay (362 words)
- Business story (437 words)
- Jazz history (521 words)

## 🔧 Configuration

**Current Setup:**
- Ollama: `http://192.168.50.87:3000/ollama/api/embed`
- Model: `embeddinggemma:latest` (768 dimensions)
- Qdrant: `http://192.168.50.87:6333`
- Collection: `documents`

## 🎯 Example Queries

```bash
# Semantic search
npm run search "luxury accommodation with spa"

# Hybrid search (best results)
npm run hybrid "romantic fine dining italian"

# Full demo (all search types)
npm run demo

# Advanced filtering examples
npm run examples

# Mixed dataset demonstrations
npm run mixed

# Or use node directly
node index.js search "your query"
node index.js hybrid "your query"
node index.js location "Paris" "hotels"
node index.js geo 48.8566 2.3522 50000 "museums"
```

## 💡 Key Takeaways

1. **Hybrid search** provides better results than pure semantic or keyword alone
2. **Payload indexes** enable fast filtering on structured metadata
3. **Complex filters** support business logic (must/should/must_not)
4. **Geo-queries** work seamlessly with coordinate data
5. **Sparse vectors** capture exact keyword matches
6. **Dense vectors** understand semantic meaning and synonyms
7. **Mixed datasets** allow structured + unstructured documents to coexist
8. **Semantic search works equally well** on both document types
9. **Query by Example** enables document-based similarity search with URL persistence

## 🚀 Performance Notes

- Vector dimension: 768 (embeddinggemma:latest)
- Sparse vector dimension: 10,000 (hashed tokens)
- 27 documents embedded successfully (21 structured + 6 unstructured)
- All payload fields indexed for fast filtering
- 100ms delay between embeddings to avoid rate limiting
- Unstructured documents searchable without metadata requirements
