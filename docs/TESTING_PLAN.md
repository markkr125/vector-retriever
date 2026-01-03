# Testing Plan for Vector Retriever

## Table of Contents
- [Overview](#overview)
- [Current State](#current-state)
- [Testing Stack Recommendations](#testing-stack-recommendations)
- [Test Structure](#test-structure)
- [Phase 1: Unit Tests (Service Layer)](#phase-1-unit-tests-service-layer)
- [Phase 2: Integration Tests (API Endpoints)](#phase-2-integration-tests-api-endpoints)
- [Phase 3: Frontend Unit Tests (Vue Components)](#phase-3-frontend-unit-tests-vue-components)
- [Phase 4: End-to-End Tests](#phase-4-end-to-end-tests)
- [Phase 5: Test Infrastructure](#phase-5-test-infrastructure)
- [Phase 6: Test Data and Fixtures](#phase-6-test-data-and-fixtures)
- [Implementation Timeline](#implementation-timeline)
- [NPM Scripts to Add](#npm-scripts-to-add)
- [Coverage Goals](#coverage-goals)
- [Key Testing Principles](#key-testing-principles)
- [Challenges and Solutions](#challenges-and-solutions)
- [Success Metrics](#success-metrics)
- [Next Steps](#next-steps)
- [Maintenance Strategy](#maintenance-strategy)

## Overview
This document outlines a comprehensive testing strategy for the Vector Retriever project, covering backend API, frontend Vue.js components, service modules, and integration tests.

## Current State
- ✅ **Automated tests implemented** (Jest backend unit/integration, Vitest frontend unit, Playwright E2E)
- **Complex system** with 40+ API endpoints, multi-collection management, PII detection, visualization
- **Multiple layers**: CLI tools, Express API (`server.js` + modular `routes/`/`services/`), Vue.js UI, service modules

## Testing Stack Recommendations

### Backend Testing
- **Framework**: Jest 29.x
- **HTTP Testing**: Supertest
- **Mocking**: Jest built-in mocks + nock (for HTTP)
- **Test DB**: Qdrant test instance or in-memory mock
- **Coverage**: jest-coverage

### Frontend Testing
- **Framework**: Vitest (Vite-native, faster than Jest for Vue)
- **Component Testing**: @vue/test-utils + Vitest
- **E2E Testing**: Playwright or Cypress
- **Mocking**: vi.mock() from Vitest

### Integration Testing
- **Framework**: Jest with supertest
- **Services**: Docker Compose for Qdrant + Ollama test containers
- **Strategy**: Separate test collections per test suite

## Test Structure

```
vector-retriever/
├── __tests__/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── pii-detector.test.js
│   │   │   ├── visualization-service.test.js
│   │   ├── utils/
│   │   │   └── utilities.test.js
│   ├── integration/
│   │   ├── api/
│   │   │   ├── search.test.js
│   │   │   ├── upload.test.js
│   │   │   ├── collections.test.js
│   ├── e2e/
│   │   ├── search-flow.spec.js
│   │   ├── upload-flow.spec.js
│   │   └── collection-management.spec.js
│   │   ├── collection-management.spec.js
│   │   └── visualization.spec.js
│   └── fixtures/
│       ├── documents/
│       │   ├── test_hotel.txt
│       │   ├── test_essay.txt
│       │   ├── test.pdf
│       │   └── test_pii.txt
│       ├── mock-responses/
│       │   ├── ollama-embedding.json
│       │   └── qdrant-search-results.json
│       └── test-collections.js
│
├── web-ui/
│   └── __tests__/
│       ├── unit/
│       │   ├── components/
│       │   │   ├── SearchForm.test.js
│       │   │   ├── ResultsList.test.js
│       │   │   ├── CollectionSelector.test.js
│       │   │   ├── FacetBar.test.js
│       │   │   └── UploadProgressModal.test.js
│       │   └── api.test.js
│       └── e2e/
│           ├── search.spec.js
│           ├── upload.spec.js
│           └── collections.spec.js
│
├── jest.config.js               # Backend Jest config
├── jest.setup.js                # Global test setup
├── web-ui/vitest.config.js      # Frontend Vitest config
└── playwright.config.js         # E2E config
```

## Phase 1: Unit Tests (Service Layer)

### 1.1 PII Detector Tests (`__tests__/unit/services/pii-detector.test.js`)
**Priority: HIGH** - Complex multi-method system with Hebrew/RTL support

**Test Coverage:**
- [ ] RegexPIIDetector patterns (SSN, credit cards, emails, phone numbers)
- [ ] OllamaPIIDetector LLM integration (mocked Ollama responses)
- [ ] HybridPIIDetector dual-agent validation
- [ ] CompromisePIIDetector NLP extraction
- [ ] AdvancedPIIDetector deduplication
- [ ] Hebrew text handling and RTL support
- [ ] Anti-loop protection (occurrence counting)
- [ ] JSON parsing with embedded quotes
- [ ] PIIDetectorFactory method selection

**Key Test Cases:**
```javascript
describe('RegexPIIDetector', () => {
  test('detects SSN patterns', async () => {
    const detector = new RegexPIIDetector()
    const result = await detector.scan('My SSN is 123-45-6789')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].type).toBe('ssn')
  })

  test('detects credit card numbers', async () => {
    const detector = new RegexPIIDetector()
    const result = await detector.scan('Card: 4532-1234-5678-9010')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].type).toBe('credit_card')
  })

  test('handles Hebrew text with RTL', async () => {
    const detector = new RegexPIIDetector()
    const result = await detector.scan('תעודת זהות: 123456789')
    expect(result.findings.length).toBeGreaterThan(0)
  })
})

describe('HybridPIIDetector', () => {
  test('validates LLM findings with second agent', async () => {
    // Mock both detection and validation Ollama calls
    const detector = new HybridPIIDetector(mockOllamaUrl, mockModel)
    const result = await detector.scan('Order #12345, Contact: john@example.com')
    // Should filter out order number, keep email
    expect(result.findings.some(f => f.type === 'email')).toBe(true)
    expect(result.findings.some(f => f.value.includes('12345'))).toBe(false)
  })
})
```

### 1.2 Visualization Service Tests (`__tests__/unit/services/visualization-service.test.js`)
**Priority: MEDIUM** - UMAP reduction and caching logic

**Test Coverage:**
- [ ] InMemoryCache set/get/invalidate
- [ ] RedisCache operations (mocked Redis client)
- [ ] Cache key generation
- [ ] UMAP dimensionality reduction (768D → 2D)
- [ ] Seeded RNG for deterministic results
- [ ] Cache TTL expiration
- [ ] Color coding by category/PII risk/date

**Key Test Cases:**
```javascript
describe('InMemoryCache', () => {
  test('stores and retrieves cached data', async () => {
    const cache = new InMemoryCache()
    await cache.set('test-key', { data: 'value' }, 3600000)
    const result = await cache.get('test-key')
    expect(result).toEqual({ data: 'value' })
  })

  test('expires entries after TTL', async () => {
    const cache = new InMemoryCache()
    await cache.set('test-key', { data: 'value' }, 100) // 100ms
    await new Promise(resolve => setTimeout(resolve, 150))
    const result = await cache.get('test-key')
    expect(result).toBeNull()
  })
})

describe('VisualizationService', () => {
  test('generates consistent UMAP projections with seed', async () => {
    const service = new VisualizationService(...)
    const vectors = [/* 768D test vectors */]
    const result1 = await service.reduce(vectors)
    const result2 = await service.reduce(vectors)
    expect(result1).toEqual(result2) // Deterministic with same seed
  })
})
```

### 1.3 Utility Function Tests (`__tests__/unit/utils/`)
**Priority: HIGH** - Core embedding and vector logic

**Test Coverage:**
- [ ] `getDenseEmbedding()` - Ollama API integration (mocked)
- [ ] `getSparseVector()` - Token hashing and frequency
- [ ] `simpleHash()` - String hashing consistency
- [ ] `parseMetadataFromContent()` - Regex extraction
- [ ] `estimateTokenCount()` - Token estimation accuracy
- [ ] Document size validation against model context limit

**Key Test Cases:**
```javascript
describe('getSparseVector', () => {
  test('generates consistent token hashes', () => {
    const text = 'hotel luxury spa Paris'
    const sparse1 = getSparseVector(text)
    const sparse2 = getSparseVector(text)
    expect(sparse1.indices).toEqual(sparse2.indices)
    expect(sparse1.values).toEqual(sparse2.values)
  })

  test('counts token frequencies correctly', () => {
    const text = 'hotel hotel luxury'
    const sparse = getSparseVector(text)
    const hotelHash = simpleHash('hotel')
    const hotelIndex = sparse.indices.indexOf(hotelHash)
    expect(sparse.values[hotelIndex]).toBe(2)
  })
})

describe('parseMetadataFromContent', () => {
  test('extracts structured metadata from headers', () => {
    const content = 'Category: hotel\nLocation: Paris\nPrice: 450\n\nLuxury hotel'
    const metadata = parseMetadataFromContent(content)
    expect(metadata.category).toBe('hotel')
    expect(metadata.location).toBe('Paris')
    expect(metadata.price).toBe(450)
    expect(metadata.has_structured_metadata).toBe(true)
  })

  test('handles unstructured documents', () => {
    const content = 'Just plain text without headers'
    const metadata = parseMetadataFromContent(content)
    expect(metadata.is_unstructured).toBe(true)
    expect(metadata.has_structured_metadata).toBe(false)
  })
})
```

## Phase 2: Integration Tests (API Endpoints)

### 2.1 Search API Tests (`__tests__/integration/api/search.test.js`)
**Priority: HIGH** - Core functionality with 5 search types

**Test Coverage:**
- [ ] POST `/api/search/hybrid` - Combined dense + sparse
- [ ] POST `/api/search/semantic` - Dense vector only
- [ ] POST `/api/search/location` - City name filtering
- [ ] POST `/api/search/geo` - Radius search with coordinates
- [ ] POST `/api/search/by-document` - File upload similarity
- [ ] Dense weight slider (0.0 to 1.0)
- [ ] Random seed for "Surprise Me"
- [ ] Pagination (page, limit)
- [ ] Complex filter combinations
- [ ] Collection-scoped searches

**Key Test Cases:**
```javascript
describe('POST /api/search/hybrid', () => {
  beforeAll(async () => {
    // Setup test collection with sample documents
    await setupTestCollection()
  })

  test('returns hybrid search results', async () => {
    const response = await request(app)
      .post('/api/search/hybrid')
      .query({ collection: 'test-collection' })
      .send({ query: 'luxury hotel', denseWeight: 0.7, limit: 10 })
      .expect(200)

    expect(response.body).toHaveProperty('results')
    expect(response.body.results.length).toBeLessThanOrEqual(10)
    expect(response.body.results[0]).toHaveProperty('score')
    expect(response.body.results[0]).toHaveProperty('payload')
  })

  test('adjusts semantic vs keyword balance', async () => {
    const semantic = await request(app)
      .post('/api/search/hybrid')
      .send({ query: 'luxury hotel', denseWeight: 1.0 }) // Pure semantic
    
    const keyword = await request(app)
      .post('/api/search/hybrid')
      .send({ query: 'luxury hotel', denseWeight: 0.0 }) // Pure keyword

    expect(semantic.body.results[0].id).not.toBe(keyword.body.results[0].id)
  })

  test('filters by category and price range', async () => {
    const response = await request(app)
      .post('/api/search/hybrid')
      .send({
        query: 'hotel',
        filters: [
          { type: 'category', value: 'hotel' },
          { type: 'price', operator: 'gte', value: 100 },
          { type: 'price', operator: 'lte', value: 500 }
        ]
      })
      .expect(200)

    response.body.results.forEach(result => {
      expect(result.payload.category).toBe('hotel')
      expect(result.payload.price).toBeGreaterThanOrEqual(100)
      expect(result.payload.price).toBeLessThanOrEqual(500)
    })
  })
})

describe('POST /api/search/geo', () => {
  test('finds documents within radius', async () => {
    const response = await request(app)
      .post('/api/search/geo')
      .send({
        lat: 48.8566,
        lon: 2.3522,
        radius: 50000, // 50km
        query: 'museum'
      })
      .expect(200)

    expect(response.body.results.length).toBeGreaterThan(0)
    response.body.results.forEach(result => {
      expect(result.payload.coordinates).toBeDefined()
    })
  })
})
```

### 2.2 Upload API Tests (`__tests__/integration/api/upload.test.js`)
**Priority: HIGH** - Complex async job system with progress tracking

**Test Coverage:**
- [ ] POST `/api/documents/upload` - Multi-file upload
- [ ] GET `/api/upload-jobs/:jobId` - Job status polling
- [ ] POST `/api/upload-jobs/:jobId/stop` - Stop processing
- [ ] GET `/api/upload-jobs/active` - Current active job
- [ ] File type support (.txt, .pdf, .docx, .html, .md)
- [ ] PDF parsing fallback chain
- [ ] DOCX table preservation
- [ ] Metadata extraction from headers
- [ ] Auto-categorization with LLM
- [ ] PII auto-scanning on upload
- [ ] Document size validation
- [ ] Job cleanup and expiration

**Key Test Cases:**
```javascript
describe('POST /api/documents/upload', () => {
  test('uploads multiple text files and returns jobId', async () => {
    const response = await request(app)
      .post('/api/documents/upload')
      .query({ collection: 'test-collection' })
      .attach('files', Buffer.from('Test content'), 'test1.txt')
      .attach('files', Buffer.from('Test content 2'), 'test2.txt')
      .expect(200)

    expect(response.body).toHaveProperty('jobId')
    expect(response.body.jobId).toMatch(/^job_\d+_\d+$/)
  })

  test('processes files in background with status updates', async () => {
    const uploadResponse = await request(app)
      .post('/api/documents/upload')
      .attach('files', Buffer.from('Content'), 'test.txt')

    const jobId = uploadResponse.body.jobId
    
    // Poll for completion
    let status
    for (let i = 0; i < 10; i++) {
      const statusResponse = await request(app)
        .get(`/api/upload-jobs/${jobId}`)
        .expect(200)
      
      status = statusResponse.body
      if (status.status === 'completed') break
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    expect(status.status).toBe('completed')
    expect(status.successfulFiles).toBe(1)
    expect(status.processedFiles).toBe(1)
  })

  test('stops upload job mid-processing', async () => {
    const uploadResponse = await request(app)
      .post('/api/documents/upload')
      .attach('files', Buffer.from('1'), 'test1.txt')
      .attach('files', Buffer.from('2'), 'test2.txt')
      .attach('files', Buffer.from('3'), 'test3.txt')

    const jobId = uploadResponse.body.jobId
    
    // Wait briefly then stop
    await new Promise(resolve => setTimeout(resolve, 100))
    await request(app)
      .post(`/api/upload-jobs/${jobId}/stop`)
      .expect(200)

    // Check final status
    const status = await request(app)
      .get(`/api/upload-jobs/${jobId}`)
      .expect(200)

    expect(status.body.status).toBe('stopped')
    expect(status.body.processedFiles).toBeLessThan(3)
  })

  test('validates document size against model context', async () => {
    const largeContent = 'word '.repeat(10000) // ~40KB, may exceed context
    const response = await request(app)
      .post('/api/documents/upload')
      .attach('files', Buffer.from(largeContent), 'large.txt')

    const jobId = response.body.jobId
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    const status = await request(app).get(`/api/upload-jobs/${jobId}`)
    
    if (status.body.errors.length > 0) {
      expect(status.body.errors[0].error).toMatch(/exceeds.*context/i)
    }
  })
})

describe('PDF and DOCX processing', () => {
  test('extracts text from PDF with fallback chain', async () => {
    const pdfBuffer = fs.readFileSync('./fixtures/documents/test.pdf')
    const response = await request(app)
      .post('/api/documents/upload')
      .attach('files', pdfBuffer, 'test.pdf')

    // Poll for completion and verify
    const jobId = response.body.jobId
    await waitForJobCompletion(jobId)
    
    const status = await request(app).get(`/api/upload-jobs/${jobId}`)
    expect(status.body.successfulFiles).toBe(1)
  })

  test('preserves DOCX formatting and tables', async () => {
    const docxBuffer = fs.readFileSync('./fixtures/documents/test.docx')
    const response = await request(app)
      .post('/api/documents/upload')
      .attach('files', docxBuffer, 'test.docx')

    const jobId = response.body.jobId
    await waitForJobCompletion(jobId)
    
    // Verify document was processed successfully
    const status = await request(app).get(`/api/upload-jobs/${jobId}`)
    expect(status.body.successfulFiles).toBe(1)
  })
})
```

### 2.3 Collections API Tests (`__tests__/integration/api/collections.test.js`)
**Priority: HIGH** - Multi-tenant core feature

**Test Coverage:**
- [ ] GET `/api/collections` - List all collections
- [ ] POST `/api/collections` - Create new collection
- [ ] DELETE `/api/collections/:id` - Delete collection (reject default)
- [ ] POST `/api/collections/:id/empty` - Remove all docs, keep collection
- [ ] GET `/api/collections/:id/stats` - Document count + size
- [ ] Collection middleware on all endpoints
- [ ] Default collection protection
- [ ] UUID generation and validation
- [ ] Document isolation between collections
- [ ] Collection metadata in `_system_collections`

**Key Test Cases:**
```javascript
describe('Collection Management API', () => {
  test('creates new collection with metadata', async () => {
    const response = await request(app)
      .post('/api/collections')
      .send({
        displayName: 'Test Collection',
        description: 'Test description'
      })
      .expect(200)

    expect(response.body).toHaveProperty('collectionId')
    expect(response.body.displayName).toBe('Test Collection')
    expect(response.body.qdrantCollectionName).toMatch(/^col_/)
  })

  test('prevents duplicate collection names', async () => {
    await request(app)
      .post('/api/collections')
      .send({ displayName: 'Duplicate Test' })
      .expect(200)

    await request(app)
      .post('/api/collections')
      .send({ displayName: 'Duplicate Test' })
      .expect(400)
  })

  test('protects default collection from deletion', async () => {
    await request(app)
      .delete('/api/collections/default')
      .expect(403)
  })

  test('isolates documents between collections', async () => {
    // Create two collections
    const col1 = await request(app)
      .post('/api/collections')
      .send({ displayName: 'Collection 1' })
    
    const col2 = await request(app)
      .post('/api/collections')
      .send({ displayName: 'Collection 2' })

    // Upload to col1
    await request(app)
      .post('/api/documents/upload')
      .query({ collection: col1.body.collectionId })
      .attach('files', Buffer.from('Col1 doc'), 'col1.txt')

    // Upload to col2
    await request(app)
      .post('/api/documents/upload')
      .query({ collection: col2.body.collectionId })
      .attach('files', Buffer.from('Col2 doc'), 'col2.txt')

    // Search col1 - should not see col2 docs
    const search1 = await request(app)
      .post('/api/search/hybrid')
      .query({ collection: col1.body.collectionId })
      .send({ query: 'doc' })

    // Search col2 - should not see col1 docs
    const search2 = await request(app)
      .post('/api/search/hybrid')
      .query({ collection: col2.body.collectionId })
      .send({ query: 'doc' })

    expect(search1.body.results.some(r => r.payload.content.includes('Col2'))).toBe(false)
    expect(search2.body.results.some(r => r.payload.content.includes('Col1'))).toBe(false)
  })

  test('empties collection without deleting it', async () => {
    const col = await request(app)
      .post('/api/collections')
      .send({ displayName: 'Empty Test' })

    // Upload documents
    await request(app)
      .post('/api/documents/upload')
      .query({ collection: col.body.collectionId })
      .attach('files', Buffer.from('Test'), 'test.txt')

    // Empty collection
    await request(app)
      .post(`/api/collections/${col.body.collectionId}/empty`)
      .expect(200)

    // Verify collection still exists but empty
    const collections = await request(app).get('/api/collections')
    const emptyCol = collections.body.find(c => c.collectionId === col.body.collectionId)
    expect(emptyCol).toBeDefined()
    expect(emptyCol.documentCount).toBe(0)
  })
})
```

### 2.4 Browse & Bookmarks Tests (`__tests__/integration/api/browse.test.js`)
**Priority: MEDIUM**

**Test Coverage:**
- [ ] GET `/api/browse` - Paginated browsing with session cache
- [ ] GET `/api/bookmarks` - Retrieve by document IDs
- [ ] Sort options (filename, category, upload_date)
- [ ] Sort order (asc, desc)
- [ ] Session cache key generation
- [ ] Cache invalidation on sort/limit change
- [ ] "Never scanned" PII filter (client-side filtering)
- [ ] Cluster filtering in browse mode

### 2.5 PII Scan Tests (`__tests__/integration/api/pii-scan.test.js`)
**Priority: MEDIUM**

**Test Coverage:**
- [ ] POST `/api/documents/:id/scan-pii` - Single document
- [ ] POST `/api/documents/scan-all-pii` - Bulk scan with progress
- [ ] Different PII methods (regex, ollama, hybrid)
- [ ] Risk level calculation
- [ ] Storage in `pii_scan` payload
- [ ] Filtering by `pii_risk` and `pii_type`

## Phase 3: Frontend Unit Tests (Vue Components)

### 3.1 Core Component Tests
**Framework: Vitest + @vue/test-utils**

#### SearchForm.vue Tests
- [ ] Search type selection (hybrid/semantic/location/geo/by-document)
- [ ] Dense weight slider value updates
- [ ] Advanced filters toggle
- [ ] Filter addition/removal
- [ ] Form validation (required fields)
- [ ] Event emission (`search`, `clear`, `surpriseMe`)
- [ ] File upload for "search by document"

#### ResultsList.vue Tests
- [ ] Result card rendering
- [ ] Bookmark toggle (localStorage persistence)
- [ ] Pagination controls with smart ellipsis
- [ ] Sort controls in browse mode
- [ ] Cluster visualization toggle
- [ ] Find similar button
- [ ] Per-page selector (10/20/50/100)
- [ ] Event emissions (`page-change`, `find-similar`, `filter-by-ids`)

#### CollectionSelector.vue Tests
- [ ] Collection dropdown rendering
- [ ] Collection switching
- [ ] Document count display
- [ ] Quick actions menu
- [ ] Management modal trigger
- [ ] `refresh()` method

#### UploadProgressModal.vue Tests
- [ ] Progress bar animation
- [ ] File status icons (⏱️⏳✅❌)
- [ ] Polling interval (1 second)
- [ ] Stop button with confirmation
- [ ] Modal close/open behavior
- [ ] RTL filename support
- [ ] Polling safeguards (no duplicates)

#### FacetBar.vue Tests
- [ ] Facet loading on mount
- [ ] Category/tag/location rendering
- [ ] Collapsible sections
- [ ] PII filter UI
- [ ] Filter event emissions
- [ ] Watcher for `currentCollectionId` prop

**Example Test:**
```javascript
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import SearchForm from '../components/SearchForm.vue'

describe('SearchForm.vue', () => {
  it('emits search event with correct parameters', async () => {
    const wrapper = mount(SearchForm)
    
    await wrapper.find('input[name="query"]').setValue('luxury hotel')
    await wrapper.find('select[name="searchType"]').setValue('hybrid')
    await wrapper.find('input[name="denseWeight"]').setValue('0.7')
    await wrapper.find('button[type="submit"]').trigger('click')

    expect(wrapper.emitted('search')).toBeTruthy()
    expect(wrapper.emitted('search')[0][0]).toEqual({
      query: 'luxury hotel',
      type: 'hybrid',
      denseWeight: 0.7
    })
  })

  it('validates required fields', async () => {
    const wrapper = mount(SearchForm)
    
    await wrapper.find('button[type="submit"]').trigger('click')
    
    // Should not emit if query is empty
    expect(wrapper.emitted('search')).toBeFalsy()
  })

  it('handles Surprise Me button', async () => {
    const wrapper = mount(SearchForm)
    
    await wrapper.find('[data-testid="surprise-me"]').trigger('click')
    
    expect(wrapper.emitted('surpriseMe')).toBeTruthy()
  })
})
```

### 3.2 API Service Tests (`web-ui/src/__tests__/unit/api.test.js`)
- [ ] Axios interceptor adds collection ID
- [ ] Error handling and retry logic
- [ ] Request/response transformations
- [ ] Mock API responses

## Phase 4: End-to-End Tests

### 4.1 Playwright E2E Tests
**Framework: Playwright**

#### Search Flow (`__tests__/e2e/search-flow.spec.js`)
- [ ] User opens app
- [ ] Enters search query
- [ ] Selects search type
- [ ] Adjusts dense weight slider
- [ ] Adds filters (category, price range)
- [ ] Clicks search
- [ ] Verifies results displayed
- [ ] Navigates to page 2
- [ ] Bookmarks a result
- [ ] Clicks "Find Similar"
- [ ] Verifies similar results

#### Upload Flow (`__tests__/e2e/upload-flow.spec.js`)
- [ ] Opens upload modal
- [ ] Selects multiple files
- [ ] Toggles auto-categorization
- [ ] Submits upload
- [ ] Progress modal appears
- [ ] File-by-file status updates
- [ ] Waits for completion
- [ ] Closes modal
- [ ] Verifies documents in browse view

#### Collection Management (`__tests__/e2e/collection-management.spec.js`)
- [ ] Opens collection selector
- [ ] Creates new collection
- [ ] Switches to new collection
- [ ] Uploads documents to collection
- [ ] Searches within collection
- [ ] Opens management modal
- [ ] Empties collection
- [ ] Deletes collection
- [ ] Verifies default collection still exists

#### Visualization Flow (`__tests__/e2e/visualization.spec.js`)
- [ ] Performs search
- [ ] Clicks "Visualize Results"
- [ ] Waits for UMAP projection
- [ ] Verifies scatter plot rendered
- [ ] Selects cluster with box tool
- [ ] Verifies filtered results
- [ ] Clears cluster filter
- [ ] Changes color coding (category → PII risk)

**Example E2E Test:**
```javascript
import { test, expect } from '@playwright/test'

test('complete search and bookmark flow', async ({ page }) => {
  await page.goto('http://localhost:5173')
  
  // Search
  await page.fill('input[name="query"]', 'luxury hotel Paris')
  await page.selectOption('select[name="searchType"]', 'hybrid')
  await page.click('button:has-text("Search")')
  
  // Wait for results
  await expect(page.locator('.result-card')).toHaveCount(10, { timeout: 5000 })
  
  // Bookmark first result
  await page.locator('.result-card').first().locator('.bookmark-btn').click()
  await expect(page.locator('.bookmark-btn.active')).toHaveCount(1)
  
  // Navigate to bookmarks
  await page.click('button:has-text("Bookmarks")')
  await expect(page.locator('.result-card')).toHaveCount(1)
  
  // Verify bookmark persists after refresh
  await page.reload()
  await page.click('button:has-text("Bookmarks")')
  await expect(page.locator('.result-card')).toHaveCount(1)
})

test('upload and progress tracking', async ({ page }) => {
  await page.goto('http://localhost:5173')
  
  // Open upload modal
  await page.click('[data-testid="upload-button"]')
  
  // Upload files
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([
    './fixtures/documents/test1.txt',
    './fixtures/documents/test2.txt'
  ])
  
  await page.click('button:has-text("Upload")')
  
  // Progress modal should appear
  await expect(page.locator('.upload-progress-modal')).toBeVisible()
  
  // Wait for completion
  await expect(page.locator('.upload-progress-modal .status')).toHaveText(/completed/i, {
    timeout: 30000
  })
  
  await page.click('.upload-progress-modal button:has-text("Close")')
  
  // Verify documents in browse
  await page.click('button:has-text("Browse")')
  await expect(page.locator('.result-card')).toHaveCount(2, { timeout: 5000 })
})
```

## Phase 5: Test Infrastructure

### 5.1 Test Configuration Files

#### jest.config.js (Backend)
```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server.js',
    'services/pii-detector.js',
    'services/visualization-service.js',
    'index.js',
    '!node_modules/**'
  ],
  testMatch: [
    '**/__tests__/unit/**/*.test.js',
    '**/__tests__/integration/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000, // 30s for integration tests
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80
    }
  }
}
```

#### jest.setup.js (Global Setup)
```javascript
require('dotenv').config({ path: '.env.test' })

// Mock Ollama API for unit tests
global.mockOllamaEmbedding = () => {
  return Array(768).fill(0).map(() => Math.random())
}

// Mock Qdrant client for unit tests
global.mockQdrantClient = {
  search: jest.fn(),
  retrieve: jest.fn(),
  upsert: jest.fn(),
  scroll: jest.fn()
}

// Setup and teardown for integration tests
beforeAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS === 'true') {
    // Start test Docker containers
    // Initialize test collections
  }
})

afterAll(async () => {
  if (process.env.RUN_INTEGRATION_TESTS === 'true') {
    // Cleanup test collections
    // Stop Docker containers
  }
})
```

#### web-ui/vitest.config.js (Frontend)
```javascript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/']
    }
  }
})
```

#### playwright.config.js (E2E)
```javascript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: {
    command: 'npm run webui',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
```

### 5.2 Test Environment Configuration

#### .env.test
```bash
# Test environment configuration
OLLAMA_URL=http://localhost:11434/api/embed
EMBEDDING_MODEL=embeddinggemma:latest
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=test_documents

# Use in-memory cache for tests
VIZ_CACHE_STRATEGY=memory
VIZ_CACHE_TTL=60000

# Disable PII detection for faster tests
PII_DETECTION_ENABLED=false

# Test server
SERVER_PORT=3099
MAX_FILE_SIZE_MB=5

# Mock Ollama for unit tests
MOCK_OLLAMA=true
```

#### docker-compose.test.yml
```yaml
version: '3.8'
services:
  qdrant-test:
    image: qdrant/qdrant:latest
    ports:
      - "6334:6333"
    volumes:
      - ./test_qdrant_storage:/qdrant/storage
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
```

### 5.3 CI/CD Pipeline (.github/workflows/test.yml)
```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:unit
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    services:
      qdrant:
        image: qdrant/qdrant:latest
        ports:
          - 6333:6333
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:integration
        env:
          QDRANT_URL: http://localhost:6333
          RUN_INTEGRATION_TESTS: true

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Phase 6: Test Data and Fixtures

### 6.1 Fixture Documents (`__tests__/fixtures/documents/`)
- [ ] `test_hotel.txt` - Structured hotel document
- [ ] `test_essay.txt` - Unstructured essay
- [ ] `test_pii_clean.txt` - No PII
- [ ] `test_pii_mixed.txt` - Contains SSN, email, phone
- [ ] `test_pii_hebrew.txt` - Hebrew text with PII
- [ ] `test.pdf` - Sample PDF with tables
- [ ] `test.docx` - Word document with formatting

### 6.2 Mock API Responses (`__tests__/fixtures/mock-responses/`)
```javascript
// ollama-embedding.json
{
  "embeddings": [[0.123, -0.456, /* ... 768 dimensions */]]
}

// qdrant-search-results.json
{
  "result": [
    {
      "id": 1,
      "score": 0.95,
      "payload": {
        "category": "hotel",
        "location": "Paris",
        "content": "Luxury hotel...",
        "price": 450
      }
    }
  ]
}
```

### 6.3 Test Collection Utilities (`__tests__/fixtures/test-collections.js`)
```javascript
const { QdrantClient } = require('@qdrant/js-client-rest')

async function setupTestCollection(collectionName = 'test_collection') {
  const client = new QdrantClient({ url: process.env.QDRANT_URL })
  
  // Create collection with hybrid vectors
  await client.createCollection(collectionName, {
    vectors: {
      dense: { size: 768, distance: 'Cosine' },
      sparse: { 
        modifier: 'idf',
        on_disk: false
      }
    }
  })
  
  // Insert test documents
  const testDocs = [
    { id: 1, category: 'hotel', location: 'Paris', content: 'Luxury hotel...' },
    { id: 2, category: 'restaurant', location: 'New York', content: 'Italian restaurant...' }
  ]
  
  for (const doc of testDocs) {
    const denseVector = mockOllamaEmbedding()
    const sparseVector = getSparseVector(doc.content)
    
    await client.upsert(collectionName, {
      points: [{
        id: doc.id,
        vector: { dense: denseVector, sparse: sparseVector },
        payload: doc
      }]
    })
  }
  
  return collectionName
}

async function teardownTestCollection(collectionName) {
  const client = new QdrantClient({ url: process.env.QDRANT_URL })
  await client.deleteCollection(collectionName)
}

module.exports = { setupTestCollection, teardownTestCollection }
```

## Implementation Timeline

### Week 1-2: Foundation
- [ ] Setup Jest and Vitest configurations
- [ ] Create test directory structure
- [ ] Write test fixtures and utilities
- [ ] Setup CI/CD pipeline basics
- [ ] Write first 5 unit tests (embedding, sparse vector, metadata parsing)

### Week 3-4: Service Layer Tests
- [ ] PII Detector tests (all 5 methods)
- [ ] Visualization Service tests
- [ ] Collection Metadata Service tests
- [ ] Utility function tests
- [ ] Achieve 70%+ unit test coverage

### Week 5-6: API Integration Tests
- [ ] Search API tests (all 5 types)
- [ ] Upload API tests with job tracking
- [ ] Collections API tests
- [ ] Browse and Bookmarks tests
- [ ] PII scan tests

### Week 7-8: Frontend Tests
- [ ] Core component tests (SearchForm, ResultsList)
- [ ] Collection management components
- [ ] Upload components with progress
- [ ] Facet and filter components
- [ ] API service tests

### Week 9-10: E2E Tests
- [ ] Setup Playwright
- [ ] Write critical user flow tests
- [ ] Cross-browser testing
- [ ] Visual regression tests (optional)

### Week 11-12: Polish and Documentation
- [ ] Increase coverage to 80%+
- [ ] Add missing edge case tests
- [ ] Performance testing (load tests)
- [ ] Update documentation
- [ ] Create test runbook

## NPM Scripts to Add

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "jest --testPathPattern=__tests__/unit",
    "test:integration": "RUN_INTEGRATION_TESTS=true jest --testPathPattern=__tests__/integration --runInBand",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ui": "cd web-ui && vitest",
    "test:ui:watch": "cd web-ui && vitest --watch",
    "test:ui:coverage": "cd web-ui && vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:all": "npm run test && npm run test:ui && npm run test:e2e"
  }
}
```

## Coverage Goals

| Layer | Target Coverage |
|-------|----------------|
| Service Modules | 85%+ |
| API Endpoints | 80%+ |
| Vue Components | 75%+ |
| Utility Functions | 90%+ |
| Overall | 80%+ |

## Key Testing Principles

1. **Isolation**: Unit tests should not depend on external services (mock Ollama, Qdrant)
2. **Determinism**: Tests must produce consistent results (use seeded RNG)
3. **Speed**: Unit tests <100ms, integration tests <5s, E2E tests <30s
4. **Clarity**: Test names describe expected behavior
5. **Independence**: Tests can run in any order
6. **Cleanup**: Always teardown test data (collections, jobs, temp files)
7. **Real Integration**: Integration tests use real Qdrant + Ollama in Docker
8. **Mocking Strategy**: Mock external APIs in unit tests, real services in integration tests

## Challenges and Solutions

### Challenge 1: Ollama Dependency
**Problem**: Embedding generation requires running Ollama service
**Solutions**:
- Unit tests: Mock Ollama responses with fixed 768D vectors
- Integration tests: Use Docker Compose with Ollama container
- E2E tests: Use pre-embedded test collection

### Challenge 2: Long-Running UMAP Projections
**Problem**: UMAP reduction takes 5-10 seconds
**Solutions**:
- Mock UMAP results in unit tests
- Use small document sets (10-20 docs) in integration tests
- Cache results in E2E tests

### Challenge 3: Session State (Upload Jobs, Browse Cache)
**Problem**: In-memory Maps don't persist between test runs
**Solutions**:
- Reset maps in `beforeEach` hooks
- Test job lifecycle in single test cases
- Mock job store for unit tests

### Challenge 4: File Upload Testing
**Problem**: Multer file uploads complex to test
**Solutions**:
- Use supertest's `.attach()` method
- Create test buffers for various file types
- Mock file parsers (pdf-parse, mammoth) in unit tests

### Challenge 5: Frontend State Management
**Problem**: localStorage and URL state in Vue components
**Solutions**:
- Mock localStorage in Vitest
- Use vue-router test utils for URL state
- Test state persistence separately from UI

## Success Metrics

- [ ] 80%+ code coverage across all layers
- [ ] All critical user flows covered by E2E tests
- [ ] CI pipeline runs in <15 minutes
- [ ] Zero flaky tests (deterministic results)
- [ ] Test suite catches regressions before deployment
- [ ] New features require tests (enforced in PR reviews)

## Next Steps

✅ **Plan completed** - Tests have been implemented:
- Unit tests: 62 tests passing (backend + frontend)
- Integration tests: Skeleton with example tests
- E2E tests: 24 Playwright tests passing
- CI/CD: GitHub Actions workflow running all test suites

**Ongoing maintenance:**
- Add tests for new features as they're developed
- Expand integration test coverage
- Monitor and fix flaky tests
- Keep test fixtures updated

## Maintenance Strategy

- **Weekly**: Review test coverage reports
- **Monthly**: Update test fixtures as data model evolves
- **Per Feature**: Write tests BEFORE implementation (TDD for critical features)
- **Per Bug**: Add regression test when fixing bugs
- **Quarterly**: Audit and refactor flaky or slow tests

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-02  
**Status**: Draft - Awaiting Review
