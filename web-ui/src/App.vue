<template>
  <div id="app">
    <header class="header">
      <div class="container">
        <div class="header-content">
          <h1 class="title">
            <span class="icon">🔍</span>
            Ollama Qdrant Search
          </h1>
          <div class="header-right">
            <div class="stats" v-if="stats">
              <span class="stat-item">
                <strong>{{ stats.totalDocuments }}</strong> documents
              </span>
              <span class="stat-item">
                <strong>{{ stats.categories.length }}</strong> categories
              </span>
            </div>
            <button @click="handleSurpriseMe" class="btn btn-secondary" :disabled="loading">
              🎲 Surprise Me
            </button>
            <button @click="showUploadModal = true" class="btn btn-add">
              ➕ Add Document
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="container">
        <!-- Facet Bar (Browse by) -->
        <FacetBar
          :results="results"
          :activeFilters="activeFilters"
          @filter-category="handleFilterCategory"
          @filter-location="handleFilterLocation"
          @filter-tag="handleFilterTag"
          @filter-pii-any="handleFilterPIIAny"
          @filter-pii-type="handleFilterPIIType"
          @filter-pii-risk="handleFilterPIIRisk"
          @bulk-scan-pii="handleBulkScanPII"
          @clear-filter="handleClearFilter"
        />
        
        <div class="layout">
          <!-- Search Section -->
          <div class="search-section">
            <SearchForm
              ref="searchFormRef"
              @search="handleSearch"
              @clear="handleClear"
              :loading="loading"
              :stats="stats"
            />
          </div>

          <!-- Results Section -->
          <div class="results-section">
            <ResultsList
              :results="results"
              :loading="loading"
              :query="currentQuery"
              :searchType="searchType"
              :currentPage="searchFormRef?.currentPage || 1"
              :totalResults="totalResults"
              :limit="searchFormRef?.limit || 10"
              @page-change="handlePageChange"
              @find-similar="handleFindSimilar"
              @clear-similar="handleClearSimilar"
              @show-pii-modal="handleShowPIIModal"
              @refresh-results="performSearch"
              @scan-complete="handleScanComplete"
            />
          </div>
        </div>
      </div>
    </main>

    <footer class="footer">
      <div class="container">
        <p>Powered by Ollama + Qdrant • Hybrid Vector Search</p>
      </div>
    </footer>

    <!-- Upload Modal -->
    <UploadModal 
      v-if="showUploadModal"
      @close="showUploadModal = false"
      @success="handleUploadSuccess"
    />

    <!-- PII Details Modal -->
    <PIIDetailsModal
      v-if="showPIIModal && currentPIIData"
      :filename="currentPIIData.filename"
      :pii-types="currentPIIData.piiTypes"
      :pii-details="currentPIIData.piiDetails"
      :risk-level="currentPIIData.riskLevel"
      :scan-date="currentPIIData.scanDate"
      @close="closePIIModal"
    />

    <!-- Scan Notification -->
    <ScanNotification
      :visible="showScanNotification"
      :success="scanNotificationData.success"
      :pii-detected="scanNotificationData.piiDetected"
      :message="scanNotificationData.message"
      :pii-types="scanNotificationData.piiTypes"
      :pii-count="scanNotificationData.piiCount"
      :error="scanNotificationData.error"
      @close="showScanNotification = false"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from './api'
import FacetBar from './components/FacetBar.vue'
import PIIDetailsModal from './components/PIIDetailsModal.vue'
import ResultsList from './components/ResultsList.vue'
import ScanNotification from './components/ScanNotification.vue'
import SearchForm from './components/SearchForm.vue'
import UploadModal from './components/UploadModal.vue'

const loading = ref(false)
const results = ref([])
const totalResults = ref(0)
const currentQuery = ref('')
const searchType = ref('')
const stats = ref(null)
const showUploadModal = ref(false)
const showPIIModal = ref(false)
const currentPIIData = ref(null)
const showScanNotification = ref(false)
const scanNotificationData = ref({})
const searchFormRef = ref(null)
const activeFilters = ref([]) // Array of { type, value }
const lastSearchParams = ref(null) // Track last search parameters
const similarDocumentId = ref(null) // Track current Find Similar source document

// Computed label for active filters
const activeFiltersLabel = computed(() => {
  if (activeFilters.value.length === 0) return null
  return activeFilters.value.map(f => `${f.value}`).join(', ')
})

// Load stats on mount and restore filter from URL
onMounted(async () => {
  try {
    const response = await api.get('/stats')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
  
  // Restore from URL
  const url = new URL(window.location)
  
  // Check for similarTo parameter first
  const similarTo = url.searchParams.get('similarTo')
  if (similarTo) {
    await handleFindSimilar(similarTo)
    return // Exit early, don't process filters
  }
  
  // Restore filters from URL
  const filtersParam = url.searchParams.get('filters')
  if (filtersParam) {
    try {
      const parsedFilters = JSON.parse(filtersParam)
      if (Array.isArray(parsedFilters) && parsedFilters.length > 0) {
        activeFilters.value = parsedFilters
        
        // Build filters for search
        const filters = {
          must: activeFilters.value.map(f => ({
            key: f.type === 'tag' ? 'tags' : f.type,
            match: f.type === 'tag' ? { any: [f.value] } : { value: f.value }
          }))
        }
        
        // Execute the filtered search
        currentQuery.value = activeFilters.value.map(f => `${f.type}: ${f.value}`).join(', ')
        searchType.value = 'facet'
        const searchParams = {
          searchType: 'semantic',
          query: '',
          limit: 10,
          page: 1,
          filters
        }
        await handleSearch(searchParams)
      }
    } catch (error) {
      console.error('Failed to parse filters from URL:', error)
    }
  }
})

// Handle search
const handleSearch = async (searchParams) => {
  // If we're in Find Similar mode, re-run Find Similar instead of a regular search
  if (similarDocumentId.value) {
    await handleFindSimilar(similarDocumentId.value)
    return
  }
  
  loading.value = true
  
  // Only clear Find Similar mode if there's an actual search query (not just changing settings)
  if (searchParams.query && searchParams.query.trim()) {
    const url = new URL(window.location)
    url.searchParams.delete('similarTo')
  }
  
  // Only update currentQuery if searchParams has a non-empty query
  if (searchParams.query) {
    currentQuery.value = searchParams.query
    // Store search params if it's a real search query (not empty)
    lastSearchParams.value = { ...searchParams }
  }
  searchType.value = searchParams.searchType
  // Don't clear results here to prevent "Ready to search" flash

  try {
    let response
    
    // Calculate offset from page and limit
    const offset = ((searchParams.page || 1) - 1) * searchParams.limit
    
    switch (searchParams.searchType) {
      case 'semantic':
        response = await api.post('/search/semantic', {
          query: searchParams.query,
          limit: searchParams.limit,
          offset: offset,
          filters: searchParams.filters
        })
        break
      
      case 'hybrid':
        response = await api.post('/search/hybrid', {
          query: searchParams.query,
          limit: searchParams.limit,
          offset: offset,
          denseWeight: searchParams.denseWeight,
          filters: searchParams.filters
        })
        break
      
      case 'location':
        response = await api.post('/search/location', {
          query: searchParams.query,
          location: searchParams.location,
          limit: searchParams.limit,
          offset: offset
        })
        break
      
      case 'geo':
        response = await api.post('/search/geo', {
          query: searchParams.query,
          latitude: searchParams.latitude,
          longitude: searchParams.longitude,
          radius: searchParams.radius,
          limit: searchParams.limit,
          offset: offset
        })
        break
    }
    
    // Update results after successful response
    results.value = response.data.results || []
    totalResults.value = response.data.total || results.value.length
  } catch (error) {
    console.error('Search error:', error)
    alert('Search failed: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

// Handle clear
const handleClear = () => {
  results.value = []
  totalResults.value = 0
  currentQuery.value = ''
  searchType.value = ''
  lastSearchParams.value = null
  activeFilters.value = []
  similarDocumentId.value = null // Clear Find Similar mode
}

// Handle page change
const handlePageChange = async (page) => {
  // If we're in Find Similar mode, fetch new page with source document
  if (similarDocumentId.value) {
    loading.value = true
    try {
      // Update the page in SearchForm
      if (searchFormRef.value) {
        searchFormRef.value.currentPage = page
      }
      
      // Fetch the source document
      const sourceResponse = await api.get(`/document/${similarDocumentId.value}`)
      const sourceDocument = sourceResponse.data
      
      // Get limit from SearchForm or URL params
      let userLimit = searchFormRef.value?.limit
      if (!userLimit) {
        const urlParams = new URLSearchParams(window.location.search)
        userLimit = urlParams.has('limit') ? parseInt(urlParams.get('limit')) : 10
      }
      
      // Calculate offset for pagination (limit - 1 since we'll prepend the source)
      const similarLimit = userLimit - 1  // Fetch one less to make room for source document
      const offset = (page - 1) * similarLimit
      
      // Fetch similar documents for this page
      const response = await api.post('/recommend', {
        documentId: similarDocumentId.value,
        limit: similarLimit,
        offset: offset
      })
      
      // Prepend source document to results
      const similarResults = response.data.results || []
      results.value = [
        { ...sourceDocument, isSource: true },
        ...similarResults
      ]
      totalResults.value = response.data.total || similarResults.length
    } catch (error) {
      console.error('Page change error:', error)
    } finally {
      loading.value = false
    }
    return
  }
  
  if (searchFormRef.value) {
    searchFormRef.value.goToPage(page)
  }
}

// Handle find similar
const handleFindSimilar = async (documentId) => {
  loading.value = true
  currentQuery.value = 'Similar to document #' + documentId
  searchType.value = 'recommendation'
  results.value = []
  similarDocumentId.value = documentId // Track for pagination

  // Update URL with similarTo parameter
  const url = new URL(window.location)
  url.searchParams.set('similarTo', documentId)
  window.history.pushState({}, '', url)

  try {
    // Fetch the source document first
    const sourceResponse = await api.get(`/document/${documentId}`)
    const sourceDocument = sourceResponse.data
    
    // Get limit from SearchForm or URL params
    let userLimit = searchFormRef.value?.limit
    if (!userLimit) {
      const urlParams = new URLSearchParams(window.location.search)
      userLimit = urlParams.has('limit') ? parseInt(urlParams.get('limit')) : 10
    }
    
    // Fetch similar documents (limit - 1 since we'll prepend the source)
    const response = await api.post('/recommend', {
      documentId: documentId,
      limit: userLimit - 1  // Fetch one less to make room for source document
    })
    
    // Prepend source document to results with a special marker
    const similarResults = response.data.results || []
    results.value = [
      { ...sourceDocument, isSource: true },
      ...similarResults
    ]
    totalResults.value = response.data.total || similarResults.length
  } catch (error) {
    console.error('Find similar error:', error)
    alert('Failed to find similar documents: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

// Handle surprise me
const handleSurpriseMe = async () => {
  loading.value = true
  currentQuery.value = 'Random Discovery'
  searchType.value = 'random'
  results.value = []

  try {
    const response = await api.get('/random', {
      params: { limit: searchFormRef.value?.limit || 10 }
    })
    
    results.value = response.data.results || []
    totalResults.value = response.data.total || results.value.length
  } catch (error) {
    console.error('Surprise me error:', error)
    alert('Failed to get random documents: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

// Handle clear similar
const handleClearSimilar = async () => {
  similarDocumentId.value = null
  
  // Clear similarTo from URL
  const url = new URL(window.location)
  url.searchParams.delete('similarTo')
  window.history.pushState({}, '', url)
  
  // If there was a previous search, restore it
  if (lastSearchParams.value && lastSearchParams.value.query) {
    await handleSearch(lastSearchParams.value)
  } else {
    // Otherwise clear everything
    results.value = []
    totalResults.value = 0
    currentQuery.value = ''
    searchType.value = ''
  }
}

// Handle upload success
const handleUploadSuccess = async () => {
  // Reload stats
  try {
    const response = await api.get('/stats')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to reload stats:', error)
  }
}

// Handle facet filter - category
const handleFilterCategory = async (category) => {
  // Check if this filter already exists
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'category' && f.value === category)
  if (existingIndex >= 0) {
    // Remove if already selected (toggle)
    activeFilters.value.splice(existingIndex, 1)
  } else {
    // Remove any existing category filter and add new one
    activeFilters.value = activeFilters.value.filter(f => f.type !== 'category')
    activeFilters.value.push({ type: 'category', value: category })
  }
  
  // Update URL
  const url = new URL(window.location)
  url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  window.history.pushState({}, '', url)
  
  // Build filters for search
  const filters = {
    must: activeFilters.value.map(f => ({
      key: f.type === 'tag' ? 'tags' : f.type,
      match: f.type === 'tag' ? { any: [f.value] } : { value: f.value }
    }))
  }
  
  // If there's an existing search, add filters to it
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters: filters.must.length > 0 ? filters : undefined
    }
    const filterText = activeFilters.value.length > 0 ? ` (${activeFilters.value.map(f => f.value).join(', ')})` : ''
    currentQuery.value = `${lastSearchParams.value.query}${filterText}`
    await handleSearch(searchParams)
  } else if (activeFilters.value.length > 0) {
    // No existing search, just filter
    currentQuery.value = activeFilters.value.map(f => `${f.type}: ${f.value}`).join(', ')
    searchType.value = 'facet'
    const searchParams = {
      searchType: 'semantic',
      query: '',
      limit: searchFormRef.value?.limit || 10,
      page: 1,
      filters
    }
    await handleSearch(searchParams)
  } else {
    // No filters and no search, clear results
    results.value = []
    totalResults.value = 0
    currentQuery.value = ''
    searchType.value = ''
  }
}

// Handle facet filter - location
const handleFilterLocation = async (location) => {
  // Check if this filter already exists
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'location' && f.value === location)
  if (existingIndex >= 0) {
    activeFilters.value.splice(existingIndex, 1)
  } else {
    activeFilters.value = activeFilters.value.filter(f => f.type !== 'location')
    activeFilters.value.push({ type: 'location', value: location })
  }
  
  const url = new URL(window.location)
  url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  window.history.pushState({}, '', url)
  
  const filters = {
    must: activeFilters.value.map(f => ({
      key: f.type === 'tag' ? 'tags' : f.type,
      match: f.type === 'tag' ? { any: [f.value] } : { value: f.value }
    }))
  }
  
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters: filters.must.length > 0 ? filters : undefined
    }
    const filterText = activeFilters.value.length > 0 ? ` (${activeFilters.value.map(f => f.value).join(', ')})` : ''
    currentQuery.value = `${lastSearchParams.value.query}${filterText}`
    await handleSearch(searchParams)
  } else if (activeFilters.value.length > 0) {
    currentQuery.value = activeFilters.value.map(f => `${f.type}: ${f.value}`).join(', ')
    searchType.value = 'facet'
    const searchParams = {
      searchType: 'semantic',
      query: '',
      limit: searchFormRef.value?.limit || 10,
      page: 1,
      filters
    }
    await handleSearch(searchParams)
  } else {
    results.value = []
    totalResults.value = 0
    currentQuery.value = ''
    searchType.value = ''
  }
}

// Handle facet filter - tag
const handleFilterTag = async (tag) => {
  // Check if this filter already exists
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'tag' && f.value === tag)
  if (existingIndex >= 0) {
    activeFilters.value.splice(existingIndex, 1)
  } else {
    // Allow multiple tags
    activeFilters.value.push({ type: 'tag', value: tag })
  }
  
  const url = new URL(window.location)
  url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  window.history.pushState({}, '', url)
  
  const filters = {
    must: activeFilters.value.map(f => ({
      key: f.type === 'tag' ? 'tags' : f.type,
      match: f.type === 'tag' ? { any: [f.value] } : { value: f.value }
    }))
  }
  
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters: filters.must.length > 0 ? filters : undefined
    }
    const filterText = activeFilters.value.length > 0 ? ` (${activeFilters.value.map(f => f.value).join(', ')})` : ''
    currentQuery.value = `${lastSearchParams.value.query}${filterText}`
    await handleSearch(searchParams)
  } else if (activeFilters.value.length > 0) {
    currentQuery.value = activeFilters.value.map(f => `${f.type}: ${f.value}`).join(', ')
    searchType.value = 'facet'
    const searchParams = {
      searchType: 'semantic',
      query: '',
      limit: searchFormRef.value?.limit || 10,
      page: 1,
      filters
    }
    await handleSearch(searchParams)
  } else {
    results.value = []
    totalResults.value = 0
    currentQuery.value = ''
    searchType.value = ''
  }
}

// Handle PII filter - any PII detected
const handleFilterPIIAny = async () => {
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'pii_any')
  if (existingIndex >= 0) {
    activeFilters.value.splice(existingIndex, 1)
  } else {
    activeFilters.value = activeFilters.value.filter(f => f.type !== 'pii_type' && f.type !== 'pii_risk')
    activeFilters.value.push({ type: 'pii_any', value: 'Any Sensitive Data' })
  }
  
  const filters = {
    must: activeFilters.value.map(f => ({
      key: f.type === 'tag' ? 'tags' : (f.type === 'pii_any' ? 'pii_detected' : f.type),
      match: f.type === 'tag' ? { any: [f.value] } : { value: f.type === 'pii_any' ? true : f.value }
    }))
  }
  
  await performFacetSearch(filters)
}

// Handle PII filter - specific type
const handleFilterPIIType = async (piiType) => {
  activeFilters.value = activeFilters.value.filter(f => f.type !== 'pii_any')
  
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'pii_type' && f.value === piiType)
  if (existingIndex >= 0) {
    activeFilters.value.splice(existingIndex, 1)
  } else {
    activeFilters.value.push({ type: 'pii_type', value: piiType })
  }
  
  const filters = {
    must: activeFilters.value.map(f => ({
      key: f.type === 'tag' ? 'tags' : (f.type === 'pii_type' ? 'pii_types' : f.type),
      match: f.type === 'tag' || f.type === 'pii_type' ? { any: [f.value] } : { value: f.value }
    }))
  }
  
  await performFacetSearch(filters)
}

// Handle PII filter - risk level
const handleFilterPIIRisk = async (riskLevel) => {
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'pii_risk')
  if (existingIndex >= 0) {
    // Toggle off if same risk level selected
    if (activeFilters.value[existingIndex].value === riskLevel) {
      activeFilters.value.splice(existingIndex, 1)
    } else {
      // Replace with new risk level
      activeFilters.value[existingIndex] = { type: 'pii_risk', value: riskLevel }
    }
  } else {
    activeFilters.value.push({ type: 'pii_risk', value: riskLevel })
  }
  
  // Special handling for "none" - filter by pii_detected = false
  const filters = {
    must: activeFilters.value.map(f => {
      if (f.type === 'pii_risk') {
        if (f.value === 'none') {
          return { key: 'pii_detected', match: { value: false } }
        } else {
          return { key: 'pii_risk_level', match: { value: f.value } }
        }
      } else if (f.type === 'tag') {
        return { key: 'tags', match: { any: [f.value] } }
      } else if (f.type === 'pii_type') {
        return { key: 'pii_types', match: { any: [f.value] } }
      } else {
        return { key: f.type, match: { value: f.value } }
      }
    })
  }
  
  await performFacetSearch(filters)
}

// Handle bulk PII scan
const handleBulkScanPII = async () => {
  if (!confirm('Scan all documents for sensitive data? This may take a while.')) {
    return
  }
  
  try {
    loading.value = true
    const response = await api.post('/documents/scan-all-pii')
    alert(`✅ ${response.data.message}`)
    
    await loadStats()
    if (currentQuery.value) {
      await performSearch()
    }
  } catch (error) {
    console.error('Bulk scan error:', error)
    alert(`❌ Failed: ${error.response?.data?.error || error.message}`)
  } finally {
    loading.value = false
  }
}

// Handle show PII modal
const handleShowPIIModal = (data) => {
  currentPIIData.value = data
  showPIIModal.value = true
}

// Handle close PII modal
const closePIIModal = () => {
  showPIIModal.value = false
  currentPIIData.value = null
}

// Handle scan complete notification
const handleScanComplete = (data) => {
  scanNotificationData.value = data
  showScanNotification.value = true
}

// Perform search again to refresh results (e.g., after PII scan)
const performSearch = async () => {
  // If we have last search params, re-run the same search
  if (lastSearchParams.value && lastSearchParams.value.query) {
    await handleSearch(lastSearchParams.value)
  } else if (similarDocumentId.value) {
    // If in Find Similar mode, refresh that
    await handleFindSimilar(similarDocumentId.value)
  } else if (activeFilters.value.length > 0) {
    // If we have active filters, refresh the filtered search
    const filters = {
      must: activeFilters.value.map(f => ({
        key: f.type === 'tag' ? 'tags' : f.type,
        match: f.type === 'tag' ? { any: [f.value] } : { value: f.value }
      }))
    }
    await performFacetSearch(filters)
  }
  // Note: If no search is active, we don't refresh anything
}

// Helper to perform facet search
const performFacetSearch = async (filters) => {
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters: filters.must.length > 0 ? filters : undefined
    }
    const filterText = activeFilters.value.length > 0 ? ` (${activeFilters.value.map(f => f.value).join(', ')})` : ''
    currentQuery.value = `${lastSearchParams.value.query}${filterText}`
    await handleSearch(searchParams)
  } else if (activeFilters.value.length > 0) {
    currentQuery.value = activeFilters.value.map(f => `${f.value}`).join(', ')
    searchType.value = 'facet'
    const searchParams = {
      searchType: 'semantic',
      query: '',
      limit: searchFormRef.value?.limit || 10,
      page: 1,
      filters
    }
    await handleSearch(searchParams)
  } else {
    results.value = []
    totalResults.value = 0
    currentQuery.value = ''
    searchType.value = ''
  }
}

// Handle clear filter
const handleClearFilter = async () => {
  activeFilters.value = []
  
  // Clear URL params
  const url = new URL(window.location)
  url.searchParams.delete('filters')
  window.history.pushState({}, '', url)
  
  // If there was a previous search, re-run it without filters
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParamsWithoutFilter = {
      ...lastSearchParams.value,
      filters: undefined
    }
    currentQuery.value = lastSearchParams.value.query
    await handleSearch(searchParamsWithoutFilter)
  } else {
    // Otherwise, clear everything
    results.value = []
    totalResults.value = 0
    currentQuery.value = ''
    searchType.value = ''
  }
}
</script>

<style scoped>
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2rem 0;
  box-shadow: var(--shadow-lg);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2rem;
  flex-wrap: wrap;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.icon {
  font-size: 2.5rem;
}

.stats {
  display: flex;
  gap: 2rem;
  font-size: 0.95rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-add {
  background: var(--secondary-color);
  color: white;
  white-space: nowrap;
}

.btn-add:hover {
  background: #0d9668;
  box-shadow: var(--shadow-md);
}

.main {
  padding: 2rem 0;
  min-height: calc(100vh - 300px);
}

.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
}

@media (min-width: 1024px) {
  .layout {
    grid-template-columns: 400px 1fr;
  }
}

.footer {
  background: var(--surface);
  border-top: 1px solid var(--border-color);
  padding: 2rem 0;
  margin-top: 4rem;
  text-align: center;
  color: var(--text-secondary);
}
</style>
