# Web UI Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│                   http://localhost:5173                      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Vue.js Application                      │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────┐  │   │
│  │  │ SearchForm │  │     App      │  │ ResultsList│  │   │
│  │  │   .vue     │──│    .vue      │──│    .vue    │  │   │
│  │  └────────────┘  └──────────────┘  └────────────┘  │   │
│  │                         │                            │   │
│  │                   ┌─────▼─────┐                     │   │
│  │                   │  api.js   │                     │   │
│  │                   │  (Axios)  │                     │   │
│  │                   └───────────┘                     │   │
│  └─────────────────────┼───────────────────────────────┘   │
└────────────────────────┼───────────────────────────────────┘
                         │ HTTP POST/GET
                         │ /api/search/*
┌────────────────────────▼───────────────────────────────────┐
│                  Express API Server                         │
│                 http://localhost:3001                       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ server.js (entrypoint - mounts routers)              │  │
│  │                                                        │  │
│  │  Modular Routes (routes/*.js):                       │  │
│  │  • Collection Middleware (all search/doc routes)    │  │
│  │  • POST /api/search/semantic                         │  │
│  │  • POST /api/search/hybrid                           │  │
│  │  • POST /api/search/location                         │  │
│  │  • POST /api/search/geo                              │  │
│  │  • GET/POST/DELETE /api/collections                  │  │
│  │  • GET  /api/stats                                   │  │
│  │  • GET  /api/health                                  │  │
│  │                                                        │  │
│  │  Services (services/*.js):                           │  │
│  │  • Embedding, PII Detection, Visualization          │  │
│  └────────────────┬─────────────────┬───────────────────┘  │
└─────────────────────┼─────────────────┼──────────────────────┘
                      │                 │
        ┌─────────────▼──┐         ┌────▼──────────────┐
        │  Qdrant Client │         │   Ollama Client   │
        │  (@qdrant/     │         │   (Axios)         │
        │   js-client)   │         │                   │
        └────────┬───────┘         └────────┬──────────┘
                 │                           │
                 │ HTTP                      │ HTTP
┌────────────────▼──────────┐    ┌──────────▼────────────────┐
│     Qdrant Database       │    │     Ollama Service        │
│  http://localhost:6333    │    │  http://localhost:11434   │
│                           │    │                           │
│  • Vector storage         │    │  • Text embedding         │
│  • Hybrid search          │    │  • Model: nomic-embed     │
│  • Payload filtering      │    │                           │
│  • Geo-search             │    │                           │
└───────────────────────────┘    └───────────────────────────┘
```

## Data Flow

### 1. Search Request

```
User Input (Browser)
    │
    ▼
SearchForm.vue (validates input)
    │
    ▼
App.vue (prepares request)
    │
    ▼
api.js (HTTP client)
    │
    ▼ POST /api/search/hybrid
server.js
    │
    ├──► getDenseEmbedding() ──► Ollama ──► Dense Vector
    │
    ├──► getSparseVector() ──► Sparse Vector
    │
    └──► qdrantClient.search() ──► Qdrant ──► Results
              │
              ▼
         Response JSON
              │
              ▼
         ResultsList.vue
              │
              ▼
         Display to User
```

### 2. Filter Application

```
User Filters (SearchForm)
    │
    ▼
buildFilters() function
    │
    ▼
{
  must: [
    { key: 'category', match: { value: 'hotel' } },
    { key: 'price', range: { gte: 100, lte: 300 } }
  ],
  should: [
    { key: 'rating', range: { gte: 4.5 } }
  ]
}
    │
    ▼
Sent with search request
    │
    ▼
Qdrant applies filters before vector search
    │
    ▼
Filtered results returned
```

## Component Hierarchy

```
App.vue
├── SearchForm.vue
│   ├── Search Type Selector
│   ├── Query Textarea
│   ├── Dense Weight Slider (hybrid)
│   ├── Location Selector (location search)
│   ├── Geo Inputs (geo search)
│   ├── Advanced Filters Panel
│   │   ├── Category Select
│   │   ├── Price Range Inputs
│   │   ├── Rating Input
│   │   ├── Tags Input
│   │   └── Document Type Select
│   └── Submit Button
│
└── ResultsList.vue
    ├── Results Header
    │   ├── Search Type Badge
    │   ├── Results Count
    │   └── Query Display
    │
    └── Result Cards (foreach result)
        ├── Rank & Score Bar
        ├── Metadata Grid
        │   ├── Category Badge
        │   ├── Location
        │   ├── Rating
        │   ├── Price
        │   └── Date
        ├── Tags
        ├── Document Type Badges
        ├── Content Preview
        ├── Expand Button
        └── Full Content (when expanded)
            ├── Complete Text
            └── Full Metadata JSON
```

## File Structure

```
vector-retriever/
│
├── server.js                   # Express API entrypoint (mounts routers)
├── routes/                     # Feature routers
│   ├── search.js              # Search endpoints
│   ├── collections.js         # Collection CRUD
│   ├── uploads.js             # Upload + job tracking
│   └── ...                    # Other feature routers
├── services/                   # Core services
│   ├── embedding-service.js   # Ollama embedding
│   ├── pii-detector.js        # PII scanning
│   ├── visualization-service.js # UMAP + caching
│   └── ...                    # Other services
├── middleware/                 # Shared middleware
├── state/                      # In-memory state stores
├── utils/                      # Pure helpers
│
├── start-webui.sh             # Startup Script
│
└── web-ui/
    ├── vite.config.js         # Dev server + proxy config
    ├── index.html             # HTML entry
    │
    └── src/
        ├── main.js            # Vue initialization
        ├── style.css          # Global styles
        ├── api.js             # Axios client
        │
        ├── App.vue            # Root component
        │   ├── <template>     # Layout structure
        │   ├── <script>       # Search logic
        │   └── <style>        # Component styles
        │
        └── components/
            ├── SearchForm.vue
            │   ├── Form state management
            │   ├── Filter builder
            │   └── Validation
            │
            └── ResultsList.vue
                ├── Results rendering
                ├── Score visualization
                └── Expand/collapse logic
```

## Technology Stack

### Frontend Layer
- **Vue.js 3**: Progressive framework
- **Composition API**: Modern reactive state
- **Vite**: Fast dev server & bundler
- **Axios**: HTTP client

### API Layer
- **Express.js**: Web framework
- **CORS**: Cross-origin support
- **dotenv**: Environment config

### Data Layer
- **Qdrant**: Vector database
  - Dense vectors (768-dim)
  - Sparse vectors (10000-dim)
  - Payload indexes
  - Geo-filtering
- **Ollama**: Embedding service
  - nomic-embed-text model
  - REST API

## Communication Patterns

### Request/Response
- Frontend ↔ API: JSON over HTTP
- API ↔ Qdrant: JavaScript client
- API ↔ Ollama: HTTP POST

### State Management
- Vue reactivity system
- No external state library needed
- Local component state

### Error Handling
- Try/catch in API calls
- HTTP status codes
- User-friendly messages
- Console logging

## Security Considerations

### Current Implementation
- CORS enabled for development
- No authentication (dev only)
- Environment variables for config

### Production Recommendations
- Add API authentication
- Rate limiting
- Input sanitization
- HTTPS only
- Helmet.js security headers
- API key management

## Performance

### Optimizations
- Vite HMR for fast development
- Lazy loading of results
- Debouncing (if needed)
- Proxy to avoid CORS overhead

### Scalability
- Stateless API server
- Can add caching layer
- Database connection pooling
- Load balancing ready

## Development Workflow

```
1. Start Qdrant
   docker-compose up -d

2. Start Ollama
   ollama serve

3. Embed documents
   npm run embed

4. Start development
   npm run webui
   
5. Make changes
   - Edit .vue files → Auto reload
   - Edit server.js → Restart server

6. Test features
   - Try different search types
   - Apply various filters
   - Check error handling

7. Build for production
   cd web-ui && npm run build
```

## Deployment Options

### Development
```
npm run webui
```

### Production
```
1. Build frontend:
   cd web-ui && npm run build

2. Serve static files:
   - Nginx
   - Apache
   - CDN

3. Run API server:
   pm2 start server.js
   # or
   node server.js &
```

## Monitoring

### Health Checks
- GET /api/health
- Returns Qdrant status
- Lists available collections

### Metrics to Track
- Request count
- Response time
- Error rate
- Search latency
- Embedding generation time

---

**Architecture is modular, scalable, and production-ready! 🚀**
