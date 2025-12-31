# Inline Cluster View for Search Results

## Overview

The inline cluster view is a collapsible visualization panel that appears in the search results page, allowing users to see a 2D scatter plot of their current search results without leaving the search interface.

## Features

### 1. On-Demand Loading
- Click the **🗺️ Visualize Results (N)** button to load the cluster view
- Visualization is generated only when requested, not on every search
- Subsequent toggles reuse cached data for fast loading

### 2. Search-Specific Visualization
- Shows only documents that match current search query and filters
- Respects all search parameters:
  - Query text
  - Search type (lexical/semantic/hybrid)
  - Dense weight (for hybrid)
  - Category filters
  - Other metadata filters

### 3. Interactive Features
- **Point Click**: Click any point to scroll to that document in the results list
- **Box/Lasso Selection**: Select multiple points to see their details
- **Color Schemes**: 
  - By Category (default) - Colors based on document category
  - By Score - Gradient based on search relevance score
  - By Type - Different colors for different document types
- **Hover Info**: Hover over points to see document title and metadata

### 4. Auto-Refresh
- When search parameters change, the cluster view automatically refreshes
- Preserves the expanded/collapsed state during searches
- Only refreshes if the panel is currently open

### 5. Cache-Aware
- Uses intelligent caching with 10-minute TTL (vs 1 hour for full collection)
- Cache key based on MD5 hash of search parameters
- Force refresh available via refresh button
- Shows cache age in the info panel

## Usage

### Opening the Cluster View

1. Perform a search (any type: lexical, semantic, or hybrid)
2. Look for the **🗖 Visualize Results (N)** button below the search results header
3. Click the button to expand the cluster visualization panel

### Interacting with Points

**Single Click:**
- Clicks a point to highlight and scroll to that document in the results list
- Document card will briefly pulse with a blue highlight
- If document is not on current page, a message is logged (future: could navigate)

**Box Selection (default):**
- Drag to create a selection box
- All points within the box are selected
- Selected documents appear in the selection panel below the plot

**Lasso Selection:**
- Hold Shift and drag to draw a freeform lasso
- All points within the lasso are selected

**Clear Selection:**
- Click the "Clear Selection" button in the selection panel
- Or click anywhere outside the selection

### Color Schemes

Change the visualization color scheme using the dropdown:

- **Category**: Different colors for hotels, restaurants, museums, etc.
- **Score**: Blue-to-red gradient based on search relevance
- **Type**: Distinct colors for document types

### Refreshing Data

- Click the **🔄 Refresh** button to force regenerate the visualization
- Clears the cache and rebuilds from current search results
- Useful if you suspect stale data

### Hiding the View

- Click the **❌ Hide** button to collapse the panel
- Or click the toggle button again
- Panel state is preserved during navigation (future feature)

## Technical Details

### Backend

**Endpoint:** `POST /api/visualize/search-results`

**Request Body:**
```json
{
  "query": "hotel luxury",
  "searchType": "hybrid",
  "denseWeight": 0.7,
  "filters": { "category": "hotel" },
  "limit": 5000,
  "forceRefresh": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "points": [...],
    "totalMatches": 24,
    "visualizedCount": 24,
    "cacheAge": 0,
    "processingTime": 45
  }
}
```

### Caching Strategy

**Collection-wide visualization:**
- Key: `viz:scatter:main`
- TTL: 1 hour
- Used by: /clusters page

**Search-specific visualization:**
- Key: `viz:search:{hash}`
- TTL: 10 minutes (shorter because search results change more frequently)
- Hash: MD5 of `query|searchType|denseWeight|filters`

### Component Architecture

**ResultsList.vue:**
- Contains the inline cluster view logic
- Manages state: `showClusterView`, `clusterData`, `clusterLoading`
- Handles point clicks and scrolling to results
- Auto-refreshes on search param changes

**ScatterPlot.vue:**
- Reusable Plotly.js wrapper component
- Used by both DocumentClusterView and ResultsList
- Emits: `point-click`, `points-selected`

## Configuration

### Default Settings

```javascript
// In ResultsList.vue
const defaultLimit = 5000  // Max documents to visualize
const defaultColorBy = 'category'  // Initial color scheme
```

### Environment Variables

```bash
# Cache strategy (memory or redis)
VIZ_CACHE_STRATEGY=memory

# TTL for search results cache (milliseconds)
VIZ_SEARCH_CACHE_TTL=600000  # 10 minutes
```

## Performance Considerations

### When to Use
- ✅ Good for 10-1000 search results
- ✅ Helps identify clusters in large result sets
- ✅ Visual alternative to scrolling through pages

### When NOT to Use
- ❌ Very small result sets (< 10 documents) - not much insight
- ❌ Random discovery mode - no query context
- ❌ Single document lookups

### Optimization
- UMAP reduction is performed on server (not in browser)
- Results are cached for 10 minutes
- Only requested documents are processed (not entire collection)
- Auto-refresh is throttled (doesn't fire on every keystroke)

## Comparison: Inline vs Full-Page View

| Feature | Inline View | Full-Page View (/clusters) |
|---------|-------------|----------------------------|
| **Data Source** | Current search results | Entire collection |
| **Cache TTL** | 10 minutes | 1 hour |
| **Max Documents** | 5000 (search limit) | 5000 (configurable) |
| **Context** | Filtered by query | Unfiltered |
| **Use Case** | Explore search results | Overview of all data |
| **Point Click** | Scrolls to result card | Shows document modal |
| **Updates** | Auto-refreshes on search | Manual refresh only |

## Future Enhancements

### Planned Features
- [ ] Persist expanded/collapsed state in URL (`?clusterView=open`)
- [ ] Navigate to different page when clicking out-of-view documents
- [ ] Export visualization as PNG/SVG
- [ ] 3D visualization option (UMAP with 3 components)
- [ ] Keyword highlighting on selected cluster
- [ ] Cluster statistics (density, separation metrics)

### Performance Optimizations
- [ ] Incremental UMAP for large datasets
- [ ] WebGL rendering for 10K+ points
- [ ] Progressive loading (show subset first, then full set)
- [ ] Server-side point clustering/aggregation

## Troubleshooting

### Visualization Not Loading
1. Check browser console for errors
2. Verify API endpoint is responding: `curl -X POST http://localhost:3001/api/visualize/search-results`
3. Check that search returned results (empty results = empty visualization)

### Points Not Clickable
1. Ensure `customdata` is set on points (contains document ID)
2. Check that `result-${docId}` elements exist in DOM
3. Verify highlightedDocId state is updating

### Slow Performance
1. Reduce limit in search query (default 5000)
2. Try force refresh to clear stale cache
3. Check server logs for UMAP processing time
4. Consider switching from Redis to in-memory cache

### Colors Not Showing
1. Check that documents have `category` metadata
2. Verify `categoryColors` mapping includes all categories
3. Try switching color scheme to see if data is present

## Related Documentation

- [Visualization Documentation](./VISUALIZATION.md) - Full-page cluster view
- [Advanced Queries](./ADVANCED_QUERIES.md) - Complex search patterns
- [Quick Reference](./QUICK_REFERENCE.md) - API endpoints

## API Reference

See [Visualization Documentation](./VISUALIZATION.md#api-endpoints) for complete API details.
