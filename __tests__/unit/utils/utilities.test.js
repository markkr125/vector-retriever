// Mock the utility functions from server.js for testing
// In a real refactor, these would be extracted to a separate module

/**
 * Generate sparse vector from text (token frequency)
 */
function getSparseVector(text) {
  const tokens = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
  
  const tokenFreq = {};
  tokens.forEach(token => {
    tokenFreq[token] = (tokenFreq[token] || 0) + 1;
  });
  
  const sparseMap = new Map();
  
  Object.entries(tokenFreq).forEach(([token, freq]) => {
    const hash = simpleHash(token) % 10000;
    sparseMap.set(hash, (sparseMap.get(hash) || 0) + freq);
  });
  
  const sortedEntries = Array.from(sparseMap.entries()).sort((a, b) => a[0] - b[0]);
  const indices = sortedEntries.map(([idx]) => idx);
  const values = sortedEntries.map(([, val]) => val);
  
  return { indices, values };
}

/**
 * Simple hash function
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Parse metadata from document content
 */
function parseMetadataFromContent(filename, content, providedMetadata = {}) {
  const metadata = {
    filename: filename,
    word_count: content.split(/\s+/).length,
    char_count: content.length,
    has_structured_metadata: false
  };
  
  // Merge provided metadata
  Object.assign(metadata, providedMetadata);
  
  // Check if category was already provided
  if (providedMetadata.category) {
    metadata.has_structured_metadata = true;
  }
  
  // Try to extract structured metadata from content
  const categoryMatch = content.match(/^Category:\s*(.+)/im);
  const locationMatch = content.match(/^Location:\s*(.+)/im);
  const dateMatch = content.match(/^Date:\s*(.+)/im);
  const tagsMatch = content.match(/^Tags:\s*(.+)/im);
  const priceMatch = content.match(/^Price:\s*(\d+(?:\.\d+)?)/im);
  const ratingMatch = content.match(/^Rating:\s*(\d+(?:\.\d+)?)/im);
  const statusMatch = content.match(/^Status:\s*(.+)/im);
  const coordinatesMatch = content.match(/^Coordinates:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/im);
  
  if (categoryMatch) {
    metadata.category = categoryMatch[1].trim();
    metadata.has_structured_metadata = true;
  }
  
  if (locationMatch) metadata.location = locationMatch[1].trim();
  if (dateMatch) metadata.date = dateMatch[1].trim();
  if (tagsMatch) {
    metadata.tags = tagsMatch[1].split(',').map(t => t.trim());
    metadata.has_structured_metadata = true;
  }
  if (priceMatch) {
    metadata.price = parseFloat(priceMatch[1]);
    metadata.has_structured_metadata = true;
  }
  if (ratingMatch) {
    metadata.rating = parseFloat(ratingMatch[1]);
    metadata.has_structured_metadata = true;
  }
  if (statusMatch) metadata.status = statusMatch[1].trim();
  if (coordinatesMatch) {
    metadata.coordinates = {
      lat: parseFloat(coordinatesMatch[1]),
      lon: parseFloat(coordinatesMatch[2])
    };
  }
  
  // If no structured metadata found, mark as unstructured
  if (!metadata.has_structured_metadata) {
    metadata.is_unstructured = true;
  }
  
  return metadata;
}

/**
 * Estimate token count for text
 */
function estimateTokenCount(text) {
  return Math.ceil(text.length / 4);
}

describe('getSparseVector', () => {
  test('generates consistent sparse vectors', () => {
    const text = 'hotel luxury spa Paris';
    const sparse1 = getSparseVector(text);
    const sparse2 = getSparseVector(text);
    
    expect(sparse1.indices).toEqual(sparse2.indices);
    expect(sparse1.values).toEqual(sparse2.values);
  });

  test('counts token frequencies correctly', () => {
    const text = 'hotel hotel luxury spa hotel';
    const sparse = getSparseVector(text);
    
    // Hotel should appear 3 times
    const hotelHash = simpleHash('hotel') % 10000;
    const hotelIndex = sparse.indices.indexOf(hotelHash);
    
    if (hotelIndex !== -1) {
      expect(sparse.values[hotelIndex]).toBe(3);
    }
  });

  test('filters short tokens (< 3 chars)', () => {
    const text = 'a an the hotel';
    const sparse = getSparseVector(text);
    
    // 'a' (1), 'an' (2), 'the' (3) - only 'the' and 'hotel' should be included (length > 2)
    expect(sparse.indices.length).toBe(2);
    expect(sparse.values.length).toBe(2);
  });

  test('handles empty text', () => {
    const sparse = getSparseVector('');
    expect(sparse.indices).toHaveLength(0);
    expect(sparse.values).toHaveLength(0);
  });

  test('normalizes to lowercase', () => {
    const sparse1 = getSparseVector('HOTEL');
    const sparse2 = getSparseVector('hotel');
    
    expect(sparse1.indices).toEqual(sparse2.indices);
  });

  test('removes punctuation', () => {
    const sparse = getSparseVector('hotel, luxury! spa.');
    
    // Should have 3 tokens without punctuation
    expect(sparse.indices.length).toBe(3);
  });

  test('sorts indices in ascending order', () => {
    const sparse = getSparseVector('zebra apple monkey banana');
    
    // Indices should be sorted
    for (let i = 1; i < sparse.indices.length; i++) {
      expect(sparse.indices[i]).toBeGreaterThan(sparse.indices[i - 1]);
    }
  });
});

describe('simpleHash', () => {
  test('generates consistent hashes', () => {
    const hash1 = simpleHash('hotel');
    const hash2 = simpleHash('hotel');
    
    expect(hash1).toBe(hash2);
  });

  test('generates different hashes for different strings', () => {
    const hash1 = simpleHash('hotel');
    const hash2 = simpleHash('restaurant');
    
    expect(hash1).not.toBe(hash2);
  });

  test('returns positive integers', () => {
    const hash = simpleHash('test');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hash)).toBe(true);
  });

  test('handles empty string', () => {
    const hash = simpleHash('');
    expect(hash).toBe(0);
  });

  test('handles special characters', () => {
    const hash = simpleHash('test@example.com');
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});

describe('parseMetadataFromContent', () => {
  test('extracts structured metadata from headers', () => {
    const content = `Category: hotel
Location: Paris
Tags: luxury, spa
Price: 450
Rating: 4.8

Luxury hotel description`;
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.category).toBe('hotel');
    expect(metadata.location).toBe('Paris');
    expect(metadata.tags).toEqual(['luxury', 'spa']);
    expect(metadata.price).toBe(450);
    expect(metadata.rating).toBe(4.8);
    expect(metadata.has_structured_metadata).toBe(true);
    expect(metadata.is_unstructured).toBeUndefined();
  });

  test('extracts coordinates', () => {
    const content = `Category: hotel
Coordinates: 48.8566, 2.3522

Hotel description`;
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.coordinates).toEqual({
      lat: 48.8566,
      lon: 2.3522
    });
  });

  test('marks unstructured documents', () => {
    const content = 'This is just plain text without any metadata headers.';
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.is_unstructured).toBe(true);
    expect(metadata.has_structured_metadata).toBe(false);
  });

  test('merges provided metadata', () => {
    const content = 'Plain text';
    const providedMetadata = {
      category: 'essay',
      custom_field: 'value'
    };
    
    const metadata = parseMetadataFromContent('test.txt', content, providedMetadata);
    
    expect(metadata.category).toBe('essay');
    expect(metadata.custom_field).toBe('value');
    expect(metadata.has_structured_metadata).toBe(true);
  });

  test('calculates word and character counts', () => {
    const content = 'Hello world test';
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.word_count).toBe(3);
    expect(metadata.char_count).toBe(16);
  });

  test('handles status field', () => {
    const content = `Category: hotel
Status: open

Hotel description`;
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.status).toBe('open');
  });

  test('handles date field', () => {
    const content = `Category: event
Date: 2024-01-15

Event description`;
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.date).toBe('2024-01-15');
  });

  test('trims whitespace from extracted values', () => {
    const content = `Category:   hotel   
Location:   Paris   

Description`;
    
    const metadata = parseMetadataFromContent('test.txt', content);
    
    expect(metadata.category).toBe('hotel');
    expect(metadata.location).toBe('Paris');
  });
});

describe('estimateTokenCount', () => {
  test('estimates tokens from character count', () => {
    const text = 'This is a test sentence.';
    const count = estimateTokenCount(text);
    
    // ~4 chars per token
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(text.length);
  });

  test('handles empty string', () => {
    const count = estimateTokenCount('');
    expect(count).toBe(0);
  });

  test('approximates 4 characters per token', () => {
    const text = 'a'.repeat(400); // 400 chars
    const count = estimateTokenCount(text);
    
    expect(count).toBe(100); // 400 / 4 = 100
  });
});
