<template>
  <div id="app">
    <header class="header">
      <div class="container">
        <div class="header-content">
          <h1 class="title" @click="switchView('search')" style="cursor: pointer;">
            <img src="./images/puppy-head.png" alt="" class="icon" style="width: 1.2em; height: 1.2em; vertical-align: middle;" />
            Vector Retriever
          </h1>
          <div class="header-center">
            <CollectionSelector 
              ref="collectionSelectorRef"
              v-if="currentCollectionId"
              :currentCollectionId="currentCollectionId"
              @collection-changed="handleCollectionChanged"
              @create-collection="handleCreateCollection"
              @manage-collections="handleManageCollections"
            />
          </div>
          <div class="header-right">
            <div class="nav-buttons">
              <button @click="switchView('search')" class="btn btn-secondary btn-compact" :class="{ 'active': currentView === 'search' }">
                🔍 Search
              </button>
              <button @click="switchView('browse')" class="btn btn-secondary btn-compact" :class="{ 'active': currentView === 'browse' }">
                📚 Browse
              </button>
              <button @click="switchView('bookmarks')" class="btn btn-secondary btn-compact" :class="{ 'active': currentView === 'bookmarks' }">
                ⭐ Bookmarks
              </button>
            </div>
            <div class="add-document-section">
              <button 
                v-if="!hasActiveUpload" 
                @click="showUploadModal = true" 
                class="btn btn-add"
              >
                ➕ Add Document
              </button>
              <button 
                v-else
                @click="showProgressModal = true" 
                class="btn btn-add uploading"
              >
                ⏳ Uploading...
              </button>
              <div class="stats" v-if="stats">
                <span class="stat-item">
                  <strong>{{ stats.totalDocuments }}</strong> documents
                </span>
                <span class="stat-item">
                  <strong>{{ stats.categories.length }}</strong> categories
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="container">
        <!-- Browse All View -->
        <div v-if="currentView === 'browse'" class="browse-view">
          <ResultsList
            :results="browseResults"
            :loading="browseLoading"
            query=""
            searchType="browse"
            :currentPage="browsePage"
            :totalResults="browseTotal"
            :limit="browseLimit"
            :filters="{}"
            :denseWeight="0"
            :browseSortBy="browseSortBy"
            :browseSortOrder="browseSortOrder"
            :currentCollectionId="currentCollectionId"
            @page-change="handleBrowsePageChange"
            @sort-change="handleBrowseSortChange"
            @limit-change="handleBrowseLimitChange"
            @find-similar="handleFindSimilar"
            @show-pii-modal="handleShowPIIModal"
            @refresh-results="loadBrowseResults"
            @scan-complete="handleScanComplete"
            @filter-by-ids="handleFilterByIds"
            @filename-filter-change="handleFilenameFilterChange"
          />
        </div>

        <!-- Bookmarks View -->
        <div v-else-if="currentView === 'bookmarks'" class="bookmarks-view">
          <ResultsList
            :results="bookmarkedResults"
            :loading="bookmarksLoading"
            query=""
            searchType="bookmarks"
            :currentPage="bookmarksPage"
            :totalResults="bookmarksTotal"
            :limit="bookmarksLimit"
            :filters="{}"
            :denseWeight="0"
            :currentCollectionId="currentCollectionId"
            @find-similar="handleFindSimilar"
            @show-pii-modal="handleShowPIIModal"
            @refresh-results="loadBookmarkedDocuments"
            @scan-complete="handleScanComplete"
            @filter-by-ids="handleFilterByIds"
            @page-change="handleBookmarksPageChange"
            @limit-change="handleBookmarksLimitChange"
            @filename-filter-change="handleFilenameFilterChange"
          />
        </div>

        <!-- Search View (default) -->
        <template v-else>
          <!-- Facet Bar (Browse by) -->
          <FacetBar
            :results="results"
            :activeFilters="activeFilters"
            :currentCollectionId="currentCollectionId"
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
                @surprise-me="handleSurpriseMe"
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
                :filters="lastSearchParams?.filters || {}"
                :denseWeight="lastSearchParams?.denseWeight || 0.7"
                :currentCollectionId="currentCollectionId"
                @page-change="handlePageChange"
                @find-similar="handleFindSimilar"
                @clear-similar="handleClearSimilar"
                @clear-random="handleClearRandom"
                @show-pii-modal="handleShowPIIModal"
                @refresh-results="performSearch"
                @scan-complete="handleScanComplete"
                @filter-by-ids="handleFilterByIds"
              />
            </div>
          </div>
        </template>
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
      @job-started="handleJobStarted"
    />

    <!-- Upload Progress Modal -->
    <UploadProgressModal
      v-if="showProgressModal && activeJobId"
      :show="showProgressModal"
      :job-id="activeJobId"
      @close="handleProgressModalClose"
      @stop="handleStopUpload"
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

    <!-- Collection Management Modal -->
    <CollectionManagementModal
      :is-open="showCollectionModal"
      :current-collection-id="currentCollectionId"
      @close="showCollectionModal = false"
      @collection-created="handleCollectionCreated"
      @collection-switched="handleCollectionChanged"
      @collection-deleted="handleCollectionDeleted"
      @collection-emptied="handleCollectionEmptied"
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import api, { fetchCollections, getActiveUploadJob, setCurrentCollection, stopUploadJob } from './api'
import CollectionManagementModal from './components/CollectionManagementModal.vue'
import CollectionSelector from './components/CollectionSelector.vue'
import FacetBar from './components/FacetBar.vue'
import PIIDetailsModal from './components/PIIDetailsModal.vue'
import ResultsList from './components/ResultsList.vue'
import ScanNotification from './components/ScanNotification.vue'
import SearchForm from './components/SearchForm.vue'
import UploadModal from './components/UploadModal.vue'
import UploadProgressModal from './components/UploadProgressModal.vue'

// Collection state
const currentCollectionId = ref(null)
const showCollectionModal = ref(false)
const isInitializing = ref(true) // Track if we're in initial page load

// Initialize collection from localStorage or URL
const initializeCollection = async () => {
  const urlParams = new URLSearchParams(window.location.search)
  const urlCollection = urlParams.get('collection')
  const storedCollection = localStorage.getItem('activeCollection')
  
  // Determine which collection to use BEFORE fetching (to avoid default collection flash)
  let targetCollectionId = urlCollection || storedCollection || null
  
  // Set it immediately in the API module if we have one from URL/storage
  if (targetCollectionId) {
    setCurrentCollection(targetCollectionId)
  }
  
  try {
    const collections = await fetchCollections()
    
    if (urlCollection) {
      // URL takes precedence
      const collection = collections.find(c => c.collectionId === urlCollection)
      if (collection) {
        currentCollectionId.value = urlCollection
      } else {
        // Invalid collection in URL, use default
        const defaultCollection = collections.find(c => c.isDefault)
        currentCollectionId.value = defaultCollection?.collectionId
        // Update API module with correct collection
        if (defaultCollection) {
          setCurrentCollection(defaultCollection.collectionId)
        }
      }
    } else if (storedCollection) {
      // Check if stored collection still exists
      const collection = collections.find(c => c.collectionId === storedCollection)
      if (collection) {
        currentCollectionId.value = storedCollection
      } else {
        // Stored collection doesn't exist, use default
        const defaultCollection = collections.find(c => c.isDefault)
        currentCollectionId.value = defaultCollection?.collectionId
        // Update API module with correct collection
        if (defaultCollection) {
          setCurrentCollection(defaultCollection.collectionId)
        }
      }
    } else {
      // No stored/URL collection, use default
      const defaultCollection = collections.find(c => c.isDefault)
      currentCollectionId.value = defaultCollection?.collectionId
      // Set in API module
      if (defaultCollection) {
        setCurrentCollection(defaultCollection.collectionId)
      }
    }
    
    // Store in localStorage
    if (currentCollectionId.value) {
      localStorage.setItem('activeCollection', currentCollectionId.value)
    }
  } catch (error) {
    console.error('Failed to initialize collection:', error)
  }
}

// Watch for collection changes and update state
watch(currentCollectionId, (newId, oldId) => {
  if (newId) {
    setCurrentCollection(newId)
    localStorage.setItem('activeCollection', newId)
    
    // Update URL
    const url = new URL(window.location)
    url.searchParams.set('collection', newId)
    window.history.pushState({}, '', url.toString())
    
    // Skip data reload during initial page load (restoreViewFromURL will handle it)
    if (isInitializing.value) {
      return
    }
    
    // Clear current results immediately to prevent flash of old data
    results.value = []
    browseResults.value = []
    bookmarkedResults.value = []
    totalResults.value = 0
    browseTotal.value = 0
    bookmarksTotal.value = 0
    
    // Reload based on view
    if (currentView.value === 'browse') {
      loadBrowseResults()
    } else if (currentView.value === 'bookmarks') {
      loadBookmarkedDocuments()
    } else if (currentView.value === 'search' && oldId) {
      // Reload last search only if switching between collections (not initial load)
      performSearch()
    }
    
    // Reload stats
    loadStats()
  }
})

// Collection event handlers
const handleCollectionChanged = (collectionId) => {
  currentCollectionId.value = collectionId
}

const handleCreateCollection = () => {
  showCollectionModal.value = true
}

const handleManageCollections = () => {
  showCollectionModal.value = true
}

const handleCollectionCreated = () => {
  // Reload collections in selector (it will auto-refresh)
  loadStats()
}

const handleCollectionDeleted = (deletedId) => {
  // If deleted collection was active, switch to default
  if (currentCollectionId.value === deletedId) {
    fetchCollections().then(collections => {
      const defaultCollection = collections.find(c => c.isDefault)
      if (defaultCollection) {
        currentCollectionId.value = defaultCollection.collectionId
      }
    })
  }
  loadStats()
}

const handleCollectionEmptied = () => {
  // Reload current view
  if (currentView.value === 'browse') {
    loadBrowseResults()
  } else if (currentView.value === 'bookmarks') {
    loadBookmarkedDocuments()
  }
  loadStats()
}

const currentView = ref('search') // 'search', 'clusters', or 'browse'

// View switching with URL state management (path-based routing)
const switchView = (view) => {
  currentView.value = view
  let path = '/search'
  if (view === 'browse') {
    path = '/browse'
    // Load browse data when switching to browse view
    browsePage.value = 1 // Reset to first page
    loadBrowseResults()
  } else if (view === 'bookmarks') {
    path = '/bookmarks'
    // Load bookmarked documents
    loadBookmarkedDocuments()
  }
  const url = new URL(window.location)
  // Preserve query parameters (filters, similarTo, etc.)
  window.history.pushState({}, '', path + url.search)
}

// Restore view from URL path
const restoreViewFromURL = async () => {
  const pathname = window.location.pathname
  if (pathname === '/browse') {
    currentView.value = 'browse'
    // Load browse results
    await loadBrowseResults()
  } else if (pathname === '/bookmarks') {
    currentView.value = 'bookmarks'
    // Load bookmarked documents
    await loadBookmarkedDocuments()
  } else if (pathname === '/search' || pathname === '/') {
    currentView.value = 'search'
    // Redirect root to /search for consistency
    if (pathname === '/') {
      const url = new URL(window.location)
      window.history.replaceState({}, '', '/search' + url.search)
    }
    
    // Restore search state from URL parameters
    await restoreSearchFromURL()
  } else {
    // Unknown path, default to search
    currentView.value = 'search'
  }
}

const restoreSearchFromURL = async () => {
  const url = new URL(window.location)
  
  // Clean up old 'random' parameter if it exists (from previous version)
  if (url.searchParams.has('random')) {
    url.searchParams.delete('random')
    window.history.replaceState({}, '', url)
  }
  
  // Check for similarTo parameter first
  const similarTo = url.searchParams.get('similarTo')
  if (similarTo) {
    await handleFindSimilar(similarTo)
    return // Exit early, don't process filters
  }
  
  // Check for randomSeed parameter to restore Surprise Me results
  const randomSeed = url.searchParams.get('randomSeed')
  if (randomSeed && randomSeed !== 'null') {
    await restoreRandomResults(randomSeed)
    return // Exit early
  }
  
  // Check for by-document search with tempFileId
  const tempFileId = url.searchParams.get('tempFileId')
  const fileName = url.searchParams.get('fileName')
  if (tempFileId) {
    try {
      // Verify temp file still exists
      const fileCheck = await api.get(`/temp-files/${tempFileId}`)
      
      // Execute by-document search with temp file ID
      const searchParams = {
        searchType: 'by-document',
        tempFileId: tempFileId,
        query: fileName || 'Uploaded Document',
        limit: parseInt(url.searchParams.get('limit')) || 10,
        page: parseInt(url.searchParams.get('page')) || 1
      }
      
      await handleSearch(searchParams)
      return // Exit early
    } catch (error) {
      console.error('Temp file restoration failed:', error)
      if (error.response?.data?.code === 'TEMP_FILE_EXPIRED') {
        alert('⚠️ The uploaded file has expired (1 hour limit). Please upload again to search.')
      } else {
        alert('Failed to restore by-document search: ' + (error.response?.data?.message || error.message))
      }
      // Clear the invalid temp file params
      url.searchParams.delete('tempFileId')
      url.searchParams.delete('fileName')
      window.history.replaceState({}, '', url)
      return
    }
  }
  
  // Restore filters from URL
  const filtersParam = url.searchParams.get('filters')
  const queryParam = url.searchParams.get('q')
  const typeParam = url.searchParams.get('type')
  const weightParam = url.searchParams.get('weight')
  const limitParam = url.searchParams.get('limit')
  const pageParam = url.searchParams.get('page')
  const selectionParam = url.searchParams.get('selection')
  
  // Build filters object if filtersParam exists
  let filters = {}
  
  if (filtersParam) {
    try {
      const parsedFilters = JSON.parse(filtersParam)
      if (Array.isArray(parsedFilters) && parsedFilters.length > 0) {
        activeFilters.value = parsedFilters
        
        // Separate never_scanned from other filters
        const neverScannedFilter = activeFilters.value.find(f => f.type === 'pii_risk' && f.value === 'never_scanned')
        const otherFilters = activeFilters.value.filter(f => !(f.type === 'pii_risk' && f.value === 'never_scanned'))
        
        const mustFilters = otherFilters.map(f => {
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
        
        if (mustFilters.length > 0) {
          filters.must = mustFilters
        }
        
        // Add never_scanned filter as must_not
        if (neverScannedFilter) {
          filters.must_not = [
            { key: 'pii_detected', match: { value: true } },
            { key: 'pii_detected', match: { value: false } }
          ]
        }
      }
    } catch (error) {
      console.error('Failed to parse filters from URL:', error)
    }
  } else {
    // No filters in URL - clear activeFilters
    activeFilters.value = []
  }
  
  // Execute search if there's a query parameter
  if (queryParam && queryParam.trim()) {
    // Search with query (and optionally filters)
    const filterText = activeFilters.value.length > 0 ? ` (${activeFilters.value.map(f => f.value).join(', ')})` : ''
    currentQuery.value = `${queryParam}${filterText}`
    searchType.value = typeParam || 'hybrid'
    
    const searchParams = {
      searchType: typeParam || 'hybrid',
      query: queryParam,
      limit: parseInt(limitParam) || 10,
      page: parseInt(pageParam) || 1,
      denseWeight: parseFloat(weightParam) || 0.7,
      filters: Object.keys(filters).length > 0 ? filters : undefined
    }
    await handleSearch(searchParams)
    
    // Handle selection parameter
    if (selectionParam) {
      // Selection exists - trigger restoration after search completes
      await nextTick()
      window.dispatchEvent(new CustomEvent('restore-selection', { detail: { selectionParam } }))
    } else {
      // No selection in URL - clear any existing selection
      await nextTick()
      window.dispatchEvent(new CustomEvent('clear-selection'))
    }
  } else if (filtersParam) {
    // Filter-only search (no query, but has filters)
    currentQuery.value = activeFilters.value.map(f => `${f.value}`).join(', ')
    searchType.value = 'facet'
    
    const searchParams = {
      searchType: 'semantic',
      query: '',
      limit: parseInt(limitParam) || 10,
      page: parseInt(pageParam) || 1,
      filters: Object.keys(filters).length > 0 ? filters : undefined
    }
    await handleSearch(searchParams)
    
    // Handle selection parameter
    if (selectionParam) {
      // Selection exists - trigger restoration after search completes
      await nextTick()
      window.dispatchEvent(new CustomEvent('restore-selection', { detail: { selectionParam } }))
    } else {
      // No selection in URL - clear any existing selection
      await nextTick()
      window.dispatchEvent(new CustomEvent('clear-selection'))
    }
  }
}

const loading = ref(false)
const results = ref([])
const totalResults = ref(0)
const currentQuery = ref('')
const searchType = ref('')
const stats = ref(null)
const showUploadModal = ref(false)
const showProgressModal = ref(false)
const activeJobId = ref(null)
const showPIIModal = ref(false)
const currentPIIData = ref(null)
const showScanNotification = ref(false)
const scanNotificationData = ref({})
const searchFormRef = ref(null)
const collectionSelectorRef = ref(null)
const activeFilters = ref([]) // Array of { type, value }

// Load stats helper function
const loadStats = async () => {
  try {
    const response = await api.get('/stats')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

// Browse mode state
const browseResults = ref([])
const fullBrowseResults = ref([]) // Store full list before filtering
const browseLoading = ref(false)
const browsePage = ref(1)
const browseLimit = ref(20)
const browseTotal = ref(0)
const browseSortBy = ref('id')
const browseSortOrder = ref('asc')
const browseFilteredByCluster = ref(false)
const browseSessionId = ref(null) // Session ID for server-side cache
const browseFilenameFilter = ref('') // Filename filter

// Bookmarks state
const bookmarkedResults = ref([])
const fullBookmarkedResults = ref([]) // Store full list before filtering
const bookmarksLoading = ref(false)
const bookmarksPage = ref(1)
const bookmarksLimit = ref(20)
const bookmarksTotal = ref(0)
const bookmarksFilenameFilter = ref('') // Filename filter

// Computed property for upload state
const hasActiveUpload = computed(() => !!activeJobId.value)
const lastSearchParams = ref(null) // Track last search parameters
const similarDocumentId = ref(null) // Track current Find Similar source document

// Helper function to build filters with OR within type, AND between types
const buildFiltersWithOr = () => {
  if (activeFilters.value.length === 0) return undefined
  
  // Group filters by type
  const filtersByType = {
    category: [],
    location: [],
    tag: []
  }
  
  activeFilters.value.forEach(f => {
    if (filtersByType[f.type]) {
      filtersByType[f.type].push(f.value)
    }
  })
  
  const must = []
  
  // Category filters (OR within category)
  if (filtersByType.category.length > 0) {
    // Special handling for "unstructured" category
    const hasUnstructured = filtersByType.category.includes('unstructured')
    const regularCategories = filtersByType.category.filter(c => c !== 'unstructured')
    
    if (hasUnstructured && regularCategories.length > 0) {
      // Both unstructured and regular categories selected - use should (OR logic)
      const should = []
      
      // Add regular categories
      if (regularCategories.length === 1) {
        should.push({
          key: 'category',
          match: { value: regularCategories[0] }
        })
      } else {
        should.push({
          key: 'category',
          match: { any: regularCategories }
        })
      }
      
      // Add unstructured check
      should.push({
        key: 'is_unstructured',
        match: { value: true }
      })
      
      must.push({ should })
    } else if (hasUnstructured) {
      // Only unstructured selected
      must.push({
        key: 'is_unstructured',
        match: { value: true }
      })
    } else {
      // Only regular categories
      if (regularCategories.length === 1) {
        must.push({
          key: 'category',
          match: { value: regularCategories[0] }
        })
      } else {
        must.push({
          key: 'category',
          match: { any: regularCategories }
        })
      }
    }
  }
  
  // Location filters (OR within location)
  if (filtersByType.location.length > 0) {
    if (filtersByType.location.length === 1) {
      must.push({
        key: 'location',
        match: { value: filtersByType.location[0] }
      })
    } else {
      must.push({
        key: 'location',
        match: { any: filtersByType.location }
      })
    }
  }
  
  // Tag filters (OR within tags)
  if (filtersByType.tag.length > 0) {
    must.push({
      key: 'tags',
      match: { any: filtersByType.tag }
    })
  }
  
  return must.length > 0 ? { must } : undefined
}

// Computed label for active filters
const activeFiltersLabel = computed(() => {
  if (activeFilters.value.length === 0) return null
  return activeFilters.value.map(f => `${f.value}`).join(', ')
})

// Load stats on mount and restore filter from URL
onMounted(async () => {
  // Initialize collection first (must be done before any API calls)
  await initializeCollection()
  
  // Restore view and search state from URL
  await restoreViewFromURL()
  
  // Mark initialization complete - now watcher can trigger reloads
  isInitializing.value = false
  
  // Handle browser back/forward buttons
  window.addEventListener('popstate', restoreViewFromURL)
  
  // Check for active upload job
  await checkActiveUpload()
  
  try {
    const response = await api.get('/stats')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to load stats:', error)
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
  
  // Only update currentQuery if searchParams has a non-empty query (not facet-only filter search)
  if (searchParams.query && searchParams.query.trim()) {
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
      case 'by-document':
        // Handle file upload search
        if (searchParams.tempFileId) {
          // Use temp file ID from URL
          const formData = new FormData()
          formData.append('tempFileId', searchParams.tempFileId)
          formData.append('limit', searchParams.limit)
          formData.append('offset', offset)
          
          response = await api.post('/search/by-document', formData)
          currentQuery.value = `📄 ${searchParams.query}`
        } else if (searchParams.file) {
          // Direct file upload
          const formData = new FormData()
          formData.append('file', searchParams.file)
          formData.append('limit', searchParams.limit)
          formData.append('offset', offset)
          
          response = await api.post('/search/by-document', formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          })
          currentQuery.value = `📄 ${searchParams.file.name}`
        } else {
          throw new Error('No file or tempFileId provided for by-document search')
        }
        break
        
      case 'semantic':
        response = await api.post('/search/semantic', {
          query: searchParams.query,
          limit: searchParams.limit,
          offset: offset,
          filters: searchParams.filters,
          documentIds: searchParams.documentIds
        })
        break
      
      case 'hybrid':
        response = await api.post('/search/hybrid', {
          query: searchParams.query,
          limit: searchParams.limit,
          offset: offset,
          denseWeight: searchParams.denseWeight,
          filters: searchParams.filters,
          documentIds: searchParams.documentIds
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
  
  // If we're in Random Discovery mode, fetch new page with same seed
  if (searchType.value === 'random') {
    loading.value = true
    try {
      // Update the page in SearchForm
      if (searchFormRef.value) {
        searchFormRef.value.currentPage = page
      }
      
      // Get seed from URL
      const url = new URL(window.location)
      const seed = url.searchParams.get('randomSeed')
      
      if (!seed) {
        console.error('No seed found for random pagination')
        return
      }
      
      // Get limit from SearchForm
      const limit = searchFormRef.value?.limit || 10
      const offset = (page - 1) * limit
      
      // Fetch random documents for this page with same seed
      const response = await api.get('/random', {
        params: { 
          limit,
          seed,
          offset
        }
      })
      
      results.value = response.data.results || []
      totalResults.value = response.data.total || results.value.length
    } catch (error) {
      console.error('Random pagination error:', error)
    } finally {
      loading.value = false
    }
    return
  }
  
  // If we have documentIds filter active, preserve it during pagination
  if (lastSearchParams.value && lastSearchParams.value.documentIds) {
    // Update the page in SearchForm to keep UI in sync
    if (searchFormRef.value) {
      searchFormRef.value.currentPage = page
    }
    
    const searchParams = {
      ...lastSearchParams.value,
      page: page
    }
    await handleSearch(searchParams)
  } else if (searchFormRef.value) {
    searchFormRef.value.goToPage(page)
  }
}

// Handle find similar
const handleFindSimilar = async (documentId) => {
  // Switch to search view if not already there
  if (currentView.value !== 'search') {
    currentView.value = 'search'
  }
  
  loading.value = true
  currentQuery.value = 'Similar to document #' + documentId
  searchType.value = 'recommendation'
  results.value = []
  similarDocumentId.value = documentId // Track for pagination

  // Update URL with similarTo parameter and switch to /search path
  const url = new URL(window.location)
  url.pathname = '/search'
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
  // Switch to search view if not already there
  if (currentView.value !== 'search') {
    currentView.value = 'search'
  }
  
  loading.value = true
  currentQuery.value = 'Random Discovery'
  searchType.value = 'random'
  results.value = []

  try {
    // Always generate a new seed for fresh randomness
    const url = new URL(window.location)
    url.pathname = '/search'
    const seed = Date.now().toString()
    
    // Clean up old parameters
    url.searchParams.delete('random')
    
    const response = await api.get('/random', {
      params: { 
        limit: searchFormRef.value?.limit || 10,
        seed,
        offset: 0
      }
    })
    
    results.value = response.data.results || []
    totalResults.value = response.data.total || results.value.length
    
    // Save seed to URL for persistence on refresh
    url.searchParams.set('randomSeed', response.data.seed)
    window.history.pushState({}, '', url)
  } catch (error) {
    console.error('Surprise me error:', error)
    alert('Failed to get random documents: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

// Load browse results
const loadBrowseResults = async () => {
  // If filtered by cluster selection, don't reload from server
  if (browseFilteredByCluster.value) {
    return
  }
  
  browseLoading.value = true
  
  try {
    const params = {
      limit: browseLimit.value,
      page: browsePage.value,
      sortBy: browseSortBy.value,
      sortOrder: browseSortOrder.value
    }
    
    // Add filename filter if present
    if (browseFilenameFilter.value) {
      params.filename = browseFilenameFilter.value
    }
    
    // Include session ID if we have one
    if (browseSessionId.value) {
      params.sessionId = browseSessionId.value
    }
    
    const response = await api.get('/browse', { params })
    
    // Store the session ID from response
    if (response.data.sessionId) {
      browseSessionId.value = response.data.sessionId
    }
    
    browseResults.value = response.data.results || []
    fullBrowseResults.value = response.data.results || []
    browseTotal.value = response.data.total || 0
    
    console.log(`Loaded ${browseResults.value.length} browse results (page ${browsePage.value}, session: ${browseSessionId.value})`)  } catch (error) {
    console.error('Browse error:', error)
    alert('Failed to browse documents: ' + (error.response?.data?.error || error.message))
  } finally {
    browseLoading.value = false
  }
}

// Load bookmarked documents
const loadBookmarkedDocuments = async () => {
  bookmarksLoading.value = true
  
  try {
    // Get bookmarked IDs from localStorage
    const stored = localStorage.getItem('bookmarkedDocuments')
    const bookmarkedIds = stored ? JSON.parse(stored) : []
    
    if (bookmarkedIds.length === 0) {
      bookmarkedResults.value = []
      bookmarksLoading.value = false
      return
    }
    
    // Fetch documents by IDs
    const response = await api.get('/bookmarks', {
      params: {
        ids: bookmarkedIds.join(',')
      }
    })
    
    let allResults = response.data.results || []
    
    // Apply filename filter if present (client-side)
    if (bookmarksFilenameFilter.value) {
      const filterLower = bookmarksFilenameFilter.value.toLowerCase()
      allResults = allResults.filter(result => 
        result.payload.filename?.toLowerCase().includes(filterLower)
      )
    }
    
    fullBookmarkedResults.value = allResults // Store full list
    bookmarksTotal.value = allResults.length
    
    // Apply client-side pagination
    const startIndex = (bookmarksPage.value - 1) * bookmarksLimit.value
    const endIndex = startIndex + bookmarksLimit.value
    bookmarkedResults.value = allResults.slice(startIndex, endIndex)
    
    console.log(`Loaded ${bookmarkedResults.value.length} of ${bookmarksTotal.value} bookmarked documents (page ${bookmarksPage.value})`)
  } catch (error) {
    console.error('Bookmarks error:', error)
    alert('Failed to load bookmarks: ' + (error.response?.data?.error || error.message))
  } finally {
    bookmarksLoading.value = false
  }
}

// Handle bookmarks page change
const handleBookmarksPageChange = (page) => {
  bookmarksPage.value = page
  loadBookmarkedDocuments()
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Handle bookmarks limit change
const handleBookmarksLimitChange = (newLimit) => {
  bookmarksLimit.value = newLimit
  bookmarksPage.value = 1 // Reset to first page
  loadBookmarkedDocuments()
}

// Handle browse page change
const handleBrowsePageChange = (page) => {
  browsePage.value = page
  loadBrowseResults()
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Handle browse sort change
const handleBrowseSortChange = ({ sortBy, sortOrder }) => {
  browseSortBy.value = sortBy
  browseSortOrder.value = sortOrder
  browsePage.value = 1 // Reset to first page
  browseSessionId.value = null // Clear session to trigger fresh cache
  loadBrowseResults()
}

// Handle browse limit change
const handleBrowseLimitChange = (newLimit) => {
  browseLimit.value = newLimit
  browsePage.value = 1 // Reset to first page
  browseSessionId.value = null // Clear session to trigger fresh cache
  loadBrowseResults()
}

// Handle filename filter change
const handleFilenameFilterChange = ({ mode, filter }) => {
  if (mode === 'browse') {
    browseFilenameFilter.value = filter
    browsePage.value = 1 // Reset to first page
    browseSessionId.value = null // Clear session to trigger fresh cache
    loadBrowseResults()
  } else if (mode === 'bookmarks') {
    bookmarksFilenameFilter.value = filter
    bookmarksPage.value = 1 // Reset to first page
    loadBookmarkedDocuments()
  }
}

// Restore random results from URL using seed
const restoreRandomResults = async (seed) => {
  loading.value = true
  currentQuery.value = 'Random Discovery'
  searchType.value = 'random'
  results.value = []
  
  try {
    // Get the limit from URL or SearchForm
    const url = new URL(window.location)
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam) : (searchFormRef.value?.limit || 10)
    
    const response = await api.get('/random', {
      params: { 
        limit,
        seed,
        offset: 0
      }
    })
    
    results.value = response.data.results || []
    totalResults.value = response.data.total || results.value.length
  } catch (error) {
    console.error('Failed to restore random results:', error)
    // On error, clear the invalid parameter and show nothing
    const url = new URL(window.location)
    url.searchParams.delete('randomSeed')
    window.history.replaceState({}, '', url)
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

// Handle clear random
const handleClearRandom = async () => {
  // Clear randomSeed from URL
  const url = new URL(window.location)
  url.searchParams.delete('randomSeed')
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
    
    // Refresh collection selector to update document counts
    if (collectionSelectorRef.value) {
      collectionSelectorRef.value.refresh()
    }
  } catch (error) {
    console.error('Failed to reload stats:', error)
  }
}

// Handle job started from upload modal
const handleJobStarted = (jobId) => {
  activeJobId.value = jobId
  localStorage.setItem('activeUploadJobId', jobId)
  showProgressModal.value = true
}

// Handle progress modal close
const handleProgressModalClose = async () => {
  showProgressModal.value = false
  
  // Clear job ID if complete
  if (activeJobId.value) {
    // Check job status first
    try {
      const response = await api.get(`/upload-jobs/${activeJobId.value}`)
      if (response.data.status === 'completed' || response.data.status === 'stopped') {
        activeJobId.value = null
        localStorage.removeItem('activeUploadJobId')
        
        // Reload stats and results
        await handleUploadSuccess()
        if (currentQuery.value) {
          performSearch()
        }
      }
    } catch (error) {
      console.error('Error checking job status:', error)
      // Clear anyway on error
      activeJobId.value = null
      localStorage.removeItem('activeUploadJobId')
    }
  }
}

// Handle stop upload
const handleStopUpload = async (jobId) => {
  try {
    await stopUploadJob(jobId)
  } catch (error) {
    console.error('Error stopping upload:', error)
  }
}

// Check for active upload job on mount
const checkActiveUpload = async () => {
  // Check localStorage first
  const storedJobId = localStorage.getItem('activeUploadJobId')
  if (storedJobId) {
    try {
      // Verify job still exists and is processing
      const response = await api.get(`/upload-jobs/${storedJobId}`)
      if (response.data && response.data.status === 'processing') {
        activeJobId.value = storedJobId
        // Don't auto-open modal, just restore the job state
        // User can click the header button to see progress
      } else {
        // Job completed or doesn't exist, clear localStorage
        localStorage.removeItem('activeUploadJobId')
      }
    } catch (error) {
      // Job not found, clear localStorage
      localStorage.removeItem('activeUploadJobId')
    }
  } else {
    // Check if there's any active job on the server
    try {
      const activeJob = await getActiveUploadJob()
      if (activeJob && activeJob.id) {
        activeJobId.value = activeJob.id
        localStorage.setItem('activeUploadJobId', activeJob.id)
        // Don't auto-open modal, just restore the job state
      }
    } catch (error) {
      console.error('Error checking active upload:', error)
    }
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
    // Allow multiple categories (OR logic)
    activeFilters.value.push({ type: 'category', value: category })
  }
  
  // Update URL
  const url = new URL(window.location)
  url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  window.history.pushState({}, '', url)
  
  // Build filters for search with OR within type, AND between types
  const filters = buildFiltersWithOr()
  
  // If there's an existing search, add filters to it
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters
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
    // Allow multiple locations (OR logic)
    activeFilters.value.push({ type: 'location', value: location })
  }
  
  const url = new URL(window.location)
  url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  window.history.pushState({}, '', url)
  
  const filters = buildFiltersWithOr()
  
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters
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
  
  const filters = buildFiltersWithOr()
  
  if (lastSearchParams.value && lastSearchParams.value.query) {
    const searchParams = {
      ...lastSearchParams.value,
      filters
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
  console.log('handleFilterPIIType called with:', piiType)
  console.log('Before toggle - activeFilters:', JSON.parse(JSON.stringify(activeFilters.value)))
  
  activeFilters.value = activeFilters.value.filter(f => f.type !== 'pii_any')
  
  const existingIndex = activeFilters.value.findIndex(f => f.type === 'pii_type' && f.value === piiType)
  console.log('existingIndex:', existingIndex)
  
  if (existingIndex >= 0) {
    console.log('Removing filter (toggle off)')
    activeFilters.value.splice(existingIndex, 1)
  } else {
    console.log('Adding filter (toggle on)')
    activeFilters.value.push({ type: 'pii_type', value: piiType })
  }
  
  console.log('After toggle - activeFilters:', JSON.parse(JSON.stringify(activeFilters.value)))
  
  // Update URL
  const url = new URL(window.location)
  if (activeFilters.value.length > 0) {
    url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  } else {
    url.searchParams.delete('filters')
  }
  window.history.pushState({}, '', url)
  
  const filters = {
    must: activeFilters.value.map(f => ({
      key: f.type === 'tag' ? 'tags' : (f.type === 'pii_type' ? 'pii_types' : f.type),
      match: f.type === 'tag' || f.type === 'pii_type' ? { any: [f.value] } : { value: f.value }
    }))
  }
  
  console.log('PII Type filter - built filters:', JSON.stringify(filters, null, 2))
  
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
  
  // Update URL
  const url = new URL(window.location)
  if (activeFilters.value.length > 0) {
    url.searchParams.set('filters', JSON.stringify(activeFilters.value))
  } else {
    url.searchParams.delete('filters')
  }
  window.history.pushState({}, '', url)
  
  // Special handling for "none" and "never_scanned"
  // Separate never_scanned from other filters
  const neverScannedFilter = activeFilters.value.find(f => f.type === 'pii_risk' && f.value === 'never_scanned')
  const otherFilters = activeFilters.value.filter(f => !(f.type === 'pii_risk' && f.value === 'never_scanned'))
  
  let filters = {}
  
  // Add other filters to must clause
  const mustFilters = otherFilters.map(f => {
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
  
  if (mustFilters.length > 0) {
    filters.must = mustFilters
  }
  
  // Add never_scanned filter as must_not
  if (neverScannedFilter) {
    filters.must_not = [
      { key: 'pii_detected', match: { value: true } },
      { key: 'pii_detected', match: { value: false } }
    ]
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

// Handle filter by document IDs from cluster selection
const handleFilterByIds = async (docIds) => {
  if (!docIds || docIds.length === 0) {
    // Clear ID filter
    if (currentView.value === 'bookmarks') {
      // Restore all bookmarks
      await loadBookmarkedDocuments()
    } else if (currentView.value === 'browse') {
      // Restore all browse results
      browseFilteredByCluster.value = false
      browseResults.value = fullBrowseResults.value
    } else if (lastSearchParams.value && lastSearchParams.value.query) {
      // Re-run the original search
      const searchParams = { ...lastSearchParams.value }
      delete searchParams.documentIds
      await handleSearch(searchParams)
    }
    return
  }
  
  // Filter by IDs
  if (currentView.value === 'bookmarks') {
    // Filter bookmarks to only show selected IDs
    bookmarkedResults.value = fullBookmarkedResults.value.filter(r => docIds.includes(r.id))
  } else if (currentView.value === 'browse') {
    // Filter browse results to only show selected IDs
    browseFilteredByCluster.value = true
    browseResults.value = fullBrowseResults.value.filter(r => docIds.includes(r.id))
  } else if (lastSearchParams.value && lastSearchParams.value.query) {
    // Execute search with ID filter
    const searchParams = {
      ...lastSearchParams.value,
      documentIds: docIds
    }
    await handleSearch(searchParams)
  }
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
      must: activeFilters.value.map(f => {
        if (f.type === 'tag') {
          return { key: 'tags', match: { any: [f.value] } }
        } else if (f.type === 'pii_type') {
          return { key: 'pii_types', match: { any: [f.value] } }
        } else if (f.type === 'pii_risk') {
          if (f.value === 'none') {
            return { key: 'pii_detected', match: { value: false } }
          } else {
            return { key: 'pii_risk_level', match: { value: f.value } }
          }
        } else {
          return { key: f.type, match: { value: f.value } }
        }
      })
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
      filters: (filters.must && filters.must.length > 0) || filters.must_not ? filters : undefined
    }
    const filterText = activeFilters.value.length > 0 ? ` (${activeFilters.value.map(f => f.value).join(', ')})` : ''
    currentQuery.value = `${lastSearchParams.value.query}${filterText}`
    await handleSearch(searchParams)
  } else if (activeFilters.value.length > 0) {
    currentQuery.value = activeFilters.value.map(f => `${f.value}`).join(', ')
    searchType.value = 'facet'
    const searchParams = {
      searchType: 'semantic',
      query: ' ',  // Single space instead of empty - allows semantic endpoint to handle filter-only search
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

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 280px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.nav-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.25rem;
  border-radius: 8px;
}

.btn-compact {
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  white-space: nowrap;
}

.add-document-section {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  align-self: center;
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
  gap: 1.5rem;
  font-size: 0.85rem;
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

.btn-add.uploading {
  background: linear-gradient(90deg, #ff9800, #f57c00);
  animation: pulse 2s ease-in-out infinite;
}

.btn-add.uploading:hover {
  background: linear-gradient(90deg, #f57c00, #e65100);
}

.btn-secondary.active {
  background: #2980b9;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.3);
}

.btn-secondary.active:hover {
  background: #3498db;
}

.btn-secondary:hover {
  background: rgba(41, 128, 185, 0.6);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
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

/* Browse View Styles */
.browse-view {
  max-width: 1200px;
  margin: 0 auto;
}

.browse-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.browse-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.browse-controls {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.browse-controls label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.browse-controls select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  background: white;
  font-size: 0.9rem;
  cursor: pointer;
}

.browse-controls select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}
</style>

