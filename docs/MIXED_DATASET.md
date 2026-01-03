# Mixed Dataset Handling

## Overview

Vector Retriever demonstrates a **powerful real-world capability**: handling heterogeneous document collections where some documents have rich structured metadata while others are plain text without any metadata.

## Dataset Composition

**Total: 27 Documents**

### Structured Documents (21)
Documents with metadata headers containing:
- `Category`: hotel, restaurant, attraction, technology, etc.
- `Location`: City name
- `Tags`: Array of descriptive tags
- `Price`: Numeric price value
- `Rating`: Numeric rating (1-5)
- `Status`: open/closed/temporary
- `Coordinates`: Geo coordinates for location queries

### Unstructured Documents (6)
Plain text files without metadata:
- `unstructured_meditation_guide.txt` - Mindfulness practices
- `unstructured_sourdough_recipe.txt` - Bread making guide
- `unstructured_deep_learning.txt` - AI/ML technical article
- `unstructured_climate_essay.txt` - Environmental writing
- `unstructured_business_story.txt` - Corporate narrative
- `unstructured_jazz_history.txt` - Music history essay

## Automatic Metadata Detection

The system automatically:
- **Detects document type** based on presence of metadata headers
- **Extracts basic stats** for unstructured docs (word count, character count)
- **Infers topic** from filename for unstructured docs
- **Tags appropriately**: 
  - `is_unstructured: true` for plain text
  - `has_structured_metadata: true` for formatted docs

## Search Capabilities

### 1. Semantic Search Works on Both Types

```bash
node index.js search "artificial intelligence neural networks"
```

**Result**: Returns both structured tech documents AND unstructured deep learning essay, ranked by semantic relevance.

### 2. Hybrid Search Enhances Both

```bash
node index.js hybrid "bread baking sourdough recipe"
```

**Result**: Unstructured sourdough recipe ranks highly due to strong keyword + semantic matching.

### 3. Filter by Document Type

**Only structured documents**:
```bash
node index.js search "luxury hotels" --filter '{"must":[{"key":"has_structured_metadata","match":{"value":true}}]}'
```

**Only unstructured documents**:
```bash
node index.js search "meditation mindfulness" --filter '{"must":[{"key":"is_unstructured","match":{"value":true}}]}'
```

### 4. Advanced Filtering (Structured Only)

Complex filters work only on structured documents:

```bash
# Hotels in Paris under $500
node examples/examples.js  # Example 1

# Restaurants with rating >= 4.5
node examples/examples.js  # Example 2
```

Unstructured documents lack these fields, so they won't match such filters.

## Running Mixed Examples

```bash
node examples/mixed_examples.js
```

This script demonstrates:
1. **Search ONLY unstructured** - Filters to plain text documents
2. **Search ONLY structured** - Filters to metadata-rich documents
3. **Search ALL** - Mixed results from both types
4. **Topic comparison** - Shows how unstructured essays compete with structured docs
5. **Dataset statistics** - Counts and categories
6. **Hybrid effectiveness** - Both types benefit from keyword matching

## Use Cases

### When to Use Structured Documents
- E-commerce products (prices, ratings, categories)
- Business listings (location, hours, amenities)
- Real estate (coordinates, price ranges, features)
- Medical records (categories, dates, statuses)

### When to Use Unstructured Documents
- Research papers and articles
- Blog posts and essays
- Meeting notes and summaries
- Knowledge base articles
- Email archives
- Literary content

### Why Mix Both?
Real-world applications often have:
- **Legacy content** without structured metadata
- **User-generated content** in free-form text
- **Imported documents** from various sources
- **Mixed content types** (structured + narrative)

## Benefits of This Approach

✅ **Flexible**: Handle any document format
✅ **Scalable**: Add documents without enforcing strict schemas
✅ **Practical**: Mirrors real-world data scenarios
✅ **Searchable**: All content is semantically searchable
✅ **Filterable**: Structured documents enable advanced queries
✅ **Future-proof**: Easy to add metadata to unstructured docs later

## Implementation Details

### Parsing Logic

```javascript
function parseMetadata(content) {
  const lines = content.split('\n');
  
  // Check for structured metadata
  const hasMetadata = lines.some(line => 
    line.startsWith('Category:') || 
    line.startsWith('Tags:')
  );
  
  if (hasMetadata) {
    // Parse structured metadata
    return {
      category: extractValue('Category'),
      tags: extractArray('Tags'),
      // ... other fields
      has_structured_metadata: true,
      is_unstructured: false
    };
  } else {
    // Handle unstructured document
    const topic = extractTopicFromFilename(filename);
    const wordCount = content.split(/\s+/).length;
    
    return {
      category: 'unstructured',
      topic: topic,
      word_count: wordCount,
      has_structured_metadata: false,
      is_unstructured: true
    };
  }
}
```

### Vector Generation

Both document types get:
- **Dense vectors**: Semantic embeddings from Ollama (768 dimensions)
- **Sparse vectors**: BM25-like keyword vectors (10000 dimensions)

No difference in vector generation—only payload metadata differs.

## Best Practices

1. **Start simple**: Begin with unstructured documents
2. **Add metadata incrementally**: Enhance important documents over time
3. **Use filters wisely**: Filter by `has_structured_metadata` when needed
4. **Leverage semantic search**: Works equally well on both types
5. **Monitor performance**: Track which documents users find most valuable

## Testing Mixed Searches

```bash
# Test 1: Technology query (should return both types)
node index.js search "machine learning artificial intelligence"
# Expected: Both structured tech docs AND unstructured deep learning essay

# Test 2: Cooking query (unstructured should win)
node index.js hybrid "sourdough bread recipe baking"
# Expected: Unstructured sourdough recipe ranks first

# Test 3: Location query (structured only)
node index.js location Paris "luxury hotels"
# Expected: Only structured Paris hotels (unstructured docs have no location)

# Test 4: Statistics
node examples/mixed_examples.js
# Expected: 21 structured + 6 unstructured = 27 total
```

## Conclusion

This mixed dataset approach provides:
- **Maximum flexibility** for real-world scenarios
- **No forced schemas** on plain text content
- **Advanced filtering** when metadata is available
- **Universal semantic search** across all content types
- **Seamless coexistence** of structured and unstructured data

Perfect for building production RAG systems, document search engines, and knowledge bases where content comes from diverse sources with varying structure levels.
