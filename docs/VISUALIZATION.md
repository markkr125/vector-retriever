# Document Cluster Visualization

## Overview

The Document Cluster Visualization feature provides an interactive 2D scatter plot that visualizes your document collection using dimensionality reduction. Documents with similar semantic content appear closer together, making it easy to discover patterns, clusters, and outliers in your data.

![Visualization Example](visualization-concept.png)

## Features

- **2D Scatter Plot**: View your entire document collection in a 2D space using UMAP dimensionality reduction
- **Interactive Navigation**: Click, zoom, pan, and select documents
- **Color Coding**: Visualize by category, PII risk level, or upload date
- **Multi-Selection**: Use box or lasso selection to select multiple documents at once
- **Quick Navigation**: Click any document to view similar documents
- **Smart Caching**: Fast initial load with automatic cache invalidation
- **Real-Time Stats**: See cache age, document count, and selection info

## How to Use

### Accessing Visualization

1. Click the **📊 Clusters** button in the header
2. The URL will change to `/clusters`
3. Wait for the visualization to generate (5-10 seconds for first load)

### Interacting with the Plot

#### Basic Navigation
- **Hover**: View document title, category, location, and PII risk
- **Click**: Select a document and view similar documents
- **Zoom**: Scroll wheel or pinch gesture
- **Pan**: Click and drag (when not in selection mode)

#### Selection Tools
- **Box Select** (default): Click and drag to select documents in a rectangular area
- **Lasso Select**: Use the toolbar to switch to freeform selection
- **Clear Selection**: Click "Clear" button or click outside the selection

#### Color Schemes
Use the "Color by" dropdown to change visualization:
- **Category**: Documents colored by their category (Restaurant, Hotel, Technology, etc.)
- **PII Risk**: Documents colored by PII risk level (none, low, medium, high, critical)
- **Upload Date**: Documents colored by upload date (blue = recent, red = older)

#### Selected Documents Panel
When you select multiple documents:
- View up to 10 selected documents in the panel below
- Click any document to navigate to its details
- See document metadata (category, location, PII risk)
- Clear selection with the "Clear" button

### Refreshing Data

- **Automatic**: Cache automatically refreshes after 1 hour (default)
- **Manual**: Click the **🔄 Refresh** button to force regeneration
- **On Upload**: Cache clears automatically when new documents are added

## Technical Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Vue 3)                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │  DocumentClusterView.vue                        │   │
│  │  - View management                              │   │
│  │  - Data loading                                 │   │
│  │  - Selection handling                           │   │
│  └────────────────┬────────────────────────────────┘   │
│                   │                                      │
│  ┌────────────────▼────────────────────────────────┐   │
│  │  ScatterPlot.vue                                │   │
│  │  - Plotly.js integration                        │   │
│  │  - Event handling                               │   │
│  │  - Color schemes                                │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTP
                    │
┌───────────────────▼─────────────────────────────────────┐
│                Backend (Express.js)                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │  API Endpoints                                  │   │
│  │  - GET /api/visualize/scatter                   │   │
│  │  - POST /api/visualize/refresh                  │   │
│  │  - GET /api/visualize/stats                     │   │
│  └────────────────┬────────────────────────────────┘   │
│                   │                                      │
│  ┌────────────────▼────────────────────────────────┐   │
│  │  VisualizationService                           │   │
│  │  - UMAP dimensionality reduction                │   │
│  │  - Cache management (Memory or Redis)           │   │
│  │  - Data transformation                          │   │
│  └────────────────┬────────────────────────────────┘   │
│                   │                                      │
│  ┌────────────────▼────────────────────────────────┐   │
│  │  Cache Strategy (Interface)                     │   │
│  │  ┌────────────────┐  ┌────────────────┐        │   │
│  │  │  InMemoryCache │  │   RedisCache   │        │   │
│  │  │  - Fast access │  │  - Distributed │        │   │
│  │  │  - TTL based   │  │  - Persistent  │        │   │
│  │  └────────────────┘  └────────────────┘        │   │
│  └────────────────┬────────────────────────────────┘   │
└───────────────────┼─────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────┐
│                  Qdrant Vector DB                        │
│  - 768D dense vectors (embeddings)                      │
│  - Document metadata                                     │
│  - Scroll API for bulk retrieval                        │
└─────────────────────────────────────────────────────────┘
```

### Dimensionality Reduction

The visualization uses **UMAP** (Uniform Manifold Approximation and Projection) to reduce 768-dimensional embedding vectors to 2D coordinates:

**Why UMAP?**
- Preserves both local and global structure
- Faster than t-SNE for large datasets
- Better at maintaining cluster relationships
- Handles non-linear patterns well

**Parameters:**
```javascript
{
  nComponents: 2,           // Output dimensions
  nNeighbors: 15,          // Local neighborhood size
  minDist: 0.1,            // Minimum distance between points
  spread: 1.0              // Effective scale of embedded points
}
```

### Caching Strategy

The service supports two caching strategies via `VIZ_CACHE_STRATEGY` environment variable:

#### In-Memory Cache (Default)
```javascript
VIZ_CACHE_STRATEGY=memory
VIZ_CACHE_TTL=3600000  # 1 hour
```

**Pros:**
- Ultra-fast access (~1ms)
- No external dependencies
- Simple setup

**Cons:**
- Lost on server restart
- Not shared across instances
- Limited by RAM

**Memory Usage:**
- 100 documents ≈ 50 KB
- 1,000 documents ≈ 520 KB
- 10,000 documents ≈ 5.2 MB

#### Redis Cache
```javascript
VIZ_CACHE_STRATEGY=redis
REDIS_URL=redis://localhost:6379
VIZ_CACHE_TTL=3600000  # 1 hour
```

**Pros:**
- Persistent across restarts
- Shared across instances
- Distributed architecture

**Cons:**
- Requires Redis server
- Slightly slower (~5-10ms)
- Additional infrastructure

**When to Use Redis:**
- Multiple server instances
- High-availability requirements
- Large document collections (>100K)
- Frequent server restarts

### API Endpoints

#### GET /api/visualize/scatter

Returns cached or generates new 2D scatter plot data.

**Query Parameters:**
- `refresh` (boolean): Force cache refresh
- `limit` (integer): Max documents to visualize (default: 5000, range: 100-50000)

**Response:**
```json
{
  "success": true,
  "data": {
    "points": [
      {
        "id": "doc_123",
        "x": 1.234,
        "y": -2.456,
        "title": "Document Title",
        "category": "Technology",
        "location": "San Francisco",
        "tags": ["AI", "ML"],
        "piiRisk": "low",
        "date": "2025-12-30T10:00:00.000Z",
        "snippet": "First 150 characters..."
      }
    ],
    "metadata": {
      "totalDocuments": 100,
      "visualizedDocuments": 100,
      "generatedAt": 1735560000000,
      "method": "umap",
      "parameters": {
        "nNeighbors": 15,
        "minDist": 0.1
      },
      "processingTime": {
        "umap": 4523
      }
    },
    "fromCache": true,
    "cacheAge": 120000
  }
}
```

#### POST /api/visualize/refresh

Force clear cache and regenerate visualization.

**Request Body:**
```json
{
  "limit": 1000
}
```

**Response:** Same as `/api/visualize/scatter`

#### GET /api/visualize/stats

Get cache statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "strategy": "memory",
    "entries": 1,
    "memoryUsage": 52480
  }
}
```

### Performance Characteristics

| Operation | In-Memory Cache | Redis Cache | No Cache |
|-----------|----------------|-------------|----------|
| First Load | ~5-10s | ~5-10s | ~5-10s |
| Cache Hit | ~1ms | ~5-10ms | N/A |
| Cache Miss | ~5-10s | ~5-10s | ~5-10s |
| Memory (100 docs) | 50 KB | 0 KB | 0 KB |
| Memory (10K docs) | 5.2 MB | 0 KB | 0 KB |

**UMAP Processing Time:**
- 100 documents: ~2-3 seconds
- 1,000 documents: ~5-8 seconds
- 10,000 documents: ~30-45 seconds

### Cache Invalidation

Cache is automatically cleared when:
1. **TTL Expires**: Default 1 hour (`VIZ_CACHE_TTL`)
2. **Manual Refresh**: User clicks refresh button
3. **Document Count Changes**: New uploads detected
4. **Server Restart**: In-memory cache only

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Visualization Cache Strategy
VIZ_CACHE_STRATEGY=memory  # 'memory' (default) or 'redis'
VIZ_CACHE_TTL=3600000      # Cache TTL in milliseconds (1 hour)
REDIS_URL=redis://localhost:6379  # Required if using Redis
```

### Frontend Configuration

No additional configuration needed. The visualization automatically:
- Detects API URL from `VITE_API_URL` or defaults to `http://localhost:3001`
- Adapts to screen size responsively
- Handles errors gracefully with retry options

## Troubleshooting

### Visualization Not Loading

**Symptom:** Spinner indefinitely or error message

**Solutions:**
1. Check backend server is running (`http://localhost:3001`)
2. Check collection has documents (need at least 1)
3. Check browser console for errors
4. Try manual refresh with the 🔄 button

### Slow Generation

**Symptom:** Taking >30 seconds to generate

**Solutions:**
1. Reduce document count with `limit` parameter
2. Enable Redis cache for better performance
3. Check server CPU/memory usage
4. Consider sampling large collections

### Cache Not Updating

**Symptom:** New documents not appearing

**Solutions:**
1. Click manual refresh button
2. Wait for TTL to expire (default 1 hour)
3. Restart server (clears in-memory cache)
4. Check `VIZ_CACHE_TTL` setting

### Redis Connection Errors

**Symptom:** "Redis connection failed" errors

**Solutions:**
1. Verify Redis is running: `redis-cli ping`
2. Check `REDIS_URL` environment variable
3. Test connection: `redis-cli -u redis://localhost:6379`
4. Fall back to memory cache: `VIZ_CACHE_STRATEGY=memory`

### Points Overlapping

**Symptom:** Many points stacked on top of each other

**Solutions:**
1. Adjust UMAP parameters in `services/visualization-service.js`:
   - Increase `minDist` for more spread (0.1 → 0.3)
   - Decrease `nNeighbors` for looser clustering (15 → 10)
2. Try different color schemes to distinguish overlapping categories
3. Zoom in on dense clusters

## Best Practices

### For Small Collections (<100 docs)
- Use in-memory cache
- Keep default UMAP parameters
- Visualize all documents

### For Medium Collections (100-1,000 docs)
- Use in-memory or Redis cache
- Default settings work well
- Consider filtering by category first

### For Large Collections (>1,000 docs)
- Use Redis cache for production
- Set visualization limit to 1,000 or sample strategically
- Increase cache TTL to reduce regeneration frequency
- Consider LRU eviction for very large collections

### For Production Deployments
- Use Redis cache for multi-instance setups
- Monitor cache memory usage
- Set reasonable TTL (1-24 hours)
- Enable error tracking
- Consider CDN for static assets

## Future Enhancements

Potential improvements for future versions:

- **3D Visualization**: Option for 3D scatter plots with WebGL
- **Hierarchical Clustering**: Automatic cluster detection and labeling
- **Incremental Updates**: Add new documents without full regeneration
- **Export Options**: Download plot as PNG/SVG
- **Custom Filters**: Filter documents before visualization
- **Similarity Lines**: Draw connections between similar documents
- **Animation**: Smooth transitions when changing color schemes
- **Cluster Statistics**: Show cluster sizes and characteristics
- **Search in Plot**: Highlight documents matching search query
- **Time-Series View**: Animate document additions over time

## Related Documentation

- [Advanced Queries](ADVANCED_QUERIES.md) - Learn about recommendation and similarity search
- [Mixed Dataset](MIXED_DATASET.md) - Understanding the test dataset
- [Quick Reference](QUICK_REFERENCE.md) - API quick reference
- [Summary](SUMMARY.md) - Project overview

## Technical References

- [UMAP Algorithm](https://umap-learn.readthedocs.io/) - Dimensionality reduction theory
- [Plotly.js](https://plotly.com/javascript/) - Interactive plotting library
- [Redis](https://redis.io/docs/) - Caching documentation
- [Qdrant](https://qdrant.tech/documentation/) - Vector database docs
