<template>
  <div class="search-form card">
    <h2 class="form-title">Search Configuration</h2>
    
    <!-- Search Type Selector -->
    <div class="form-group">
      <label class="label">Search Type</label>
      <select v-model="searchType" class="select">
        <option value="hybrid">Hybrid (Semantic + Keywords)</option>
        <option value="semantic">Semantic Only</option>
        <option value="by-document">By Document (Upload File)</option>
        <option value="location">Location-Based</option>
        <option value="geo">Geo-Radius</option>
      </select>
    </div>

    <!-- File Upload (for by-document search) -->
    <div v-if="searchType === 'by-document'" class="form-group">
      <label class="label">Upload Document</label>
      <div class="file-upload-area">
        <input 
          type="file"
          ref="fileInput"
          @change="handleFileSelect"
          :accept="acceptFileTypes"
          class="file-input"
          id="search-file-input"
        >
        <label for="search-file-input" class="file-upload-label">
          <span class="upload-icon">📄</span>
          <span v-if="!selectedFile && !restoredFileName" class="upload-text">Choose file to find similar documents</span>
          <span v-else class="upload-text selected">{{ selectedFile?.name || restoredFileName }}</span>
          <span class="upload-hint">{{ byDocumentHint }}</span>
        </label>
      </div>
    </div>

    <!-- Query Input -->
    <div v-if="searchType !== 'by-document'" class="form-group">
      <label class="label">Search Query</label>
      <textarea 
        v-model="query"
        class="textarea"
        rows="3"
        placeholder="Enter your search query..."
        @keydown.ctrl.enter="handleSubmit"
      ></textarea>
    </div>

    <!-- Hybrid Weight (only for hybrid search) -->
    <div v-if="searchType === 'hybrid'" class="form-group">
      <label class="label">
        Dense Weight: {{ denseWeight.toFixed(2) }}
        <span class="label-hint">(Semantic vs Keywords balance)</span>
      </label>
      <input 
        type="range" 
        v-model.number="denseWeight"
        min="0"
        max="1"
        step="0.1"
        class="slider"
      >
      <div class="slider-labels">
        <span>Keywords</span>
        <span>Balanced</span>
        <span>Semantic</span>
      </div>
    </div>

    <!-- Location Input (for location search) -->
    <div v-if="searchType === 'location'" class="form-group">
      <label class="label">Location</label>
      <select v-model="location" class="select">
        <option value="">Select a location...</option>
        <option v-for="loc in availableLocations" :key="loc" :value="loc">
          {{ loc }}
        </option>
      </select>
    </div>

    <!-- Geo Coordinates (for geo search) -->
    <div v-if="searchType === 'geo'" class="geo-inputs">
      <div class="form-group">
        <label class="label">Latitude</label>
        <input 
          type="number" 
          v-model.number="latitude"
          step="0.0001"
          class="input"
          placeholder="e.g., 48.8566"
        >
      </div>
      <div class="form-group">
        <label class="label">Longitude</label>
        <input 
          type="number" 
          v-model.number="longitude"
          step="0.0001"
          class="input"
          placeholder="e.g., 2.3522"
        >
      </div>
      <div class="form-group">
        <label class="label">Radius (meters)</label>
        <input 
          type="number" 
          v-model.number="radius"
          step="1000"
          class="input"
          placeholder="e.g., 50000"
        >
      </div>
    </div>

    <!-- Advanced Filters -->
    <div class="filters-section">
      <button 
        type="button"
        @click="showFilters = !showFilters"
        class="btn btn-secondary"
        style="width: 100%; margin-bottom: 1rem;"
      >
        {{ showFilters ? '▼' : '▶' }} Advanced Filters
      </button>

      <div v-if="showFilters" class="filters-content">
        <!-- Category Filter -->
        <div class="form-group">
          <label class="label">Category</label>
          <select v-model="filters.category" class="select">
            <option value="">Any category</option>
            <option v-for="cat in availableCategories" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
        </div>

        <!-- Price Range -->
        <div class="form-row">
          <div class="form-group">
            <label class="label">Min Price</label>
            <input 
              type="number" 
              v-model.number="filters.minPrice"
              class="input"
              placeholder="Min"
            >
          </div>
          <div class="form-group">
            <label class="label">Max Price</label>
            <input 
              type="number" 
              v-model.number="filters.maxPrice"
              class="input"
              placeholder="Max"
            >
          </div>
        </div>

        <!-- Rating Filter -->
        <div class="form-group">
          <label class="label">Minimum Rating</label>
          <input 
            type="number" 
            v-model.number="filters.minRating"
            min="0"
            max="5"
            step="0.1"
            class="input"
            placeholder="e.g., 4.5"
          >
        </div>

        <!-- Tags Filter -->
        <div class="form-group">
          <label class="label">Tags (comma-separated)</label>
          <input 
            type="text" 
            v-model="filters.tags"
            class="input"
            placeholder="e.g., luxury, spa, romantic"
          >
        </div>

        <!-- Document Type -->
        <div class="form-group">
          <label class="label">Document Type</label>
          <select v-model="filters.documentType" class="select">
            <option value="">All documents</option>
            <option value="structured">Structured (with metadata)</option>
            <option value="unstructured">Unstructured (plain text)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Results Limit -->
    <div class="form-group">
      <label class="label">Results Limit</label>
      <input 
        type="number" 
        v-model.number="limit"
        min="1"
        max="50"
        class="input"
      >
    </div>

    <!-- Action Buttons -->
    <div class="action-buttons">
      <button 
        @click="handleClear"
        :disabled="loading"
        class="btn btn-secondary"
        style="flex: 1;"
      >
        ✖ Clear
      </button>
      <button 
        @click="handleSubmit"
        :disabled="!canSubmit || loading"
        class="btn btn-primary"
        style="flex: 2;"
      >
        <span v-if="loading" class="loading"></span>
        <span v-else>🔍 Search</span>
      </button>
    </div>

    <!-- Surprise Me Button -->
    <div class="button-row">
      <button 
        @click="handleSurpriseMe"
        :disabled="loading"
        class="btn btn-surprise"
        title="Get random documents to discover new content"
      >
        <span v-if="loading" class="loading"></span>
        <span v-else>🎲 Surprise Me</span>
      </button>
    </div>

    <p class="hint">Press Ctrl+Enter to search</p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../api'

const props = defineProps({
  loading: Boolean,
  stats: Object
})

const emit = defineEmits(['search', 'clear', 'surpriseMe'])

// Form state
const searchType = ref('hybrid')
const query = ref('')
const denseWeight = ref(0.7)
const location = ref('')
const latitude = ref(null)
const longitude = ref(null)
const radius = ref(50000)
const limit = ref(10)
const currentPage = ref(1)
const showFilters = ref(false)
const selectedFile = ref(null)
const fileInput = ref(null)
const tempFileId = ref(null) // Store temp file ID for URL persistence
const uploadingTemp = ref(false)
const restoredFileName = ref(null) // Store fileName from URL when restoring

// Filters
const filters = ref({
  category: '',
  minPrice: null,
  maxPrice: null,
  minRating: null,
  tags: '',
  documentType: ''
})

// Available options from stats
const availableCategories = computed(() => props.stats?.categories || [])
const availableLocations = computed(() => props.stats?.locations || [])

// By-document upload config (vision-enabled images)
const visionEnabled = ref(false)
const supportedImageTypes = ref([])
const acceptFileTypes = ref('.txt,.md,.pdf,.docx')

const byDocumentHint = computed(() => {
  return visionEnabled.value && supportedImageTypes.value.length > 0
    ? 'Supports: TXT, MD, PDF, DOCX, Images'
    : 'Supports: TXT, MD, PDF, DOCX'
})

const fetchConfig = async () => {
  try {
    const response = await api.get('/config')
    const data = response?.data && typeof response.data === 'object' ? response.data : {}

    visionEnabled.value = Boolean(data.visionEnabled)
    supportedImageTypes.value = Array.isArray(data.supportedImageTypes) ? data.supportedImageTypes : []

    let types = '.txt,.md,.pdf,.docx'
    if (visionEnabled.value && supportedImageTypes.value.length > 0) {
      types += ',' + supportedImageTypes.value.join(',')
    }
    acceptFileTypes.value = types
  } catch {
    // Keep defaults on failure
    visionEnabled.value = false
    supportedImageTypes.value = []
    acceptFileTypes.value = '.txt,.md,.pdf,.docx'
  }
}

// Validation
const canSubmit = computed(() => {
  if (searchType.value === 'by-document') {
    return selectedFile.value !== null
  }
  if (!query.value.trim()) return false
  if (searchType.value === 'location' && !location.value) return false
  if (searchType.value === 'geo') {
    return latitude.value !== null && longitude.value !== null && radius.value > 0
  }
  return true
})

// Handle file selection
const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file) {
    selectedFile.value = file
  }
}

// Build filter object for API
const buildFilters = () => {
  const must = []
  const should = []
  
  if (filters.value.category) {
    must.push({ key: 'category', match: { value: filters.value.category } })
  }
  
  if (filters.value.minPrice !== null || filters.value.maxPrice !== null) {
    const range = {}
    if (filters.value.minPrice !== null) range.gte = filters.value.minPrice
    if (filters.value.maxPrice !== null) range.lte = filters.value.maxPrice
    must.push({ key: 'price', range })
  }
  
  if (filters.value.minRating !== null) {
    must.push({ key: 'rating', range: { gte: filters.value.minRating } })
  }
  
  if (filters.value.tags) {
    const tagList = filters.value.tags.split(',').map(t => t.trim()).filter(t => t)
    if (tagList.length > 0) {
      must.push({ key: 'tags', match: { any: tagList } })
    }
  }
  
  if (filters.value.documentType === 'structured') {
    must.push({ key: 'has_structured_metadata', match: { value: true } })
  } else if (filters.value.documentType === 'unstructured') {
    must.push({ key: 'is_unstructured', match: { value: true } })
  }
  
  if (must.length === 0 && should.length === 0) return null
  
  const filterObj = {}
  if (must.length > 0) filterObj.must = must
  if (should.length > 0) filterObj.should = should
  
  return filterObj
}

// Submit handler
const handleSubmit = async (resetPage = true) => {
  if (!canSubmit.value || props.loading) return
  
  // Reset to page 1 when user clicks search button
  if (resetPage) {
    currentPage.value = 1
  }
  
  const searchParams = {
    searchType: searchType.value,
    limit: limit.value,
    page: currentPage.value
  }
  
  // Handle by-document search differently
  if (searchType.value === 'by-document') {
    // Upload file to temp storage first if not already uploaded
    if (selectedFile.value && !tempFileId.value) {
      try {
        uploadingTemp.value = true
        const formData = new FormData()
        formData.append('file', selectedFile.value)
        
        const response = await api.post('/temp-files', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        
        tempFileId.value = response.data.id
        console.log('File uploaded to temp storage:', response.data)
      } catch (error) {
        console.error('Failed to upload temp file:', error)
        alert('Failed to upload file: ' + (error.response?.data?.error || error.message))
        uploadingTemp.value = false
        return
      } finally {
        uploadingTemp.value = false
      }
    }
    
    searchParams.tempFileId = tempFileId.value
    searchParams.file = selectedFile.value
    searchParams.query = selectedFile.value.name  // For display purposes
  } else {
    searchParams.query = query.value.trim()
  }
  
  if (searchType.value === 'hybrid') {
    searchParams.denseWeight = denseWeight.value
  }
  
  if (searchType.value === 'location') {
    searchParams.location = location.value
  }
  
  if (searchType.value === 'geo') {
    searchParams.latitude = latitude.value
    searchParams.longitude = longitude.value
    searchParams.radius = radius.value
  }
  
  // Add filters for semantic and hybrid searches
  if (searchType.value === 'semantic' || searchType.value === 'hybrid') {
    const builtFilters = buildFilters()
    if (builtFilters) {
      searchParams.filters = builtFilters
    }
  }
  
  emit('search', searchParams)
  if (searchType.value !== 'by-document') {
    updateURL(searchParams)
  } else if (tempFileId.value) {
    // Add tempFileId to URL for by-document searches
    const url = new URL(window.location)
    url.searchParams.set('tempFileId', tempFileId.value)
    url.searchParams.set('fileName', selectedFile.value.name)
    window.history.pushState({}, '', url)
  }
}

// Clear search
const handleClear = () => {
  query.value = ''
  searchType.value = 'hybrid'
  denseWeight.value = 0.7
  location.value = ''
  latitude.value = null
  longitude.value = null
  radius.value = 50000
  limit.value = 10
  currentPage.value = 1
  selectedFile.value = null
  tempFileId.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  filters.value = {
    category: '',
    minPrice: null,
    maxPrice: null,
    minRating: null,
    tags: '',
    documentType: ''
  }
  
  // Clear URL
  window.history.pushState({}, '', window.location.pathname)
  
  emit('clear')
}

const handleSurpriseMe = () => {
  emit('surpriseMe')
}

// Watch search type to clear file when switching away from by-document
watch(searchType, (newType, oldType) => {
  if (oldType === 'by-document' && newType !== 'by-document') {
    selectedFile.value = null
    tempFileId.value = null
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }
})

// Pagination handlers
const goToPage = (page) => {
  currentPage.value = page
  handleSubmit(false) // Don't reset page
}

const nextPage = () => {
  currentPage.value++
  handleSubmit(false) // Don't reset page
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    handleSubmit(false) // Don't reset page
  }
}

// Update URL with search parameters
const updateURL = (searchParams) => {
  const params = new URLSearchParams()
  
  params.set('q', searchParams.query)
  params.set('type', searchParams.searchType)
  params.set('limit', searchParams.limit)
  params.set('page', searchParams.page)
  
  if (searchParams.denseWeight !== undefined) {
    params.set('weight', searchParams.denseWeight)
  }
  
  if (searchParams.location) {
    params.set('location', searchParams.location)
  }
  
  if (searchParams.latitude !== undefined && searchParams.latitude !== null) {
    params.set('lat', searchParams.latitude)
  }
  
  if (searchParams.longitude !== undefined && searchParams.longitude !== null) {
    params.set('lon', searchParams.longitude)
  }
  
  if (searchParams.radius) {
    params.set('radius', searchParams.radius)
  }
  
  // Add filters
  if (filters.value.category) params.set('cat', filters.value.category)
  if (filters.value.minPrice !== null) params.set('minPrice', filters.value.minPrice)
  if (filters.value.maxPrice !== null) params.set('maxPrice', filters.value.maxPrice)
  if (filters.value.minRating !== null) params.set('minRating', filters.value.minRating)
  if (filters.value.tags) params.set('tags', filters.value.tags)
  if (filters.value.documentType) params.set('docType', filters.value.documentType)
  
  // Preserve facet filters from URL (set by FacetBar)
  const currentUrl = new URLSearchParams(window.location.search)
  if (currentUrl.has('filters')) {
    params.set('filters', currentUrl.get('filters'))
  }
  
  // Preserve similarTo parameter (set by Find Similar)
  if (currentUrl.has('similarTo')) {
    params.set('similarTo', currentUrl.get('similarTo'))
  }
  
  // Preserve selection parameter (set by cluster visualization)
  if (currentUrl.has('selection')) {
    params.set('selection', currentUrl.get('selection'))
  }
  
  // Preserve tempFileId and fileName (set by by-document search)
  if (currentUrl.has('tempFileId')) {
    params.set('tempFileId', currentUrl.get('tempFileId'))
    if (currentUrl.has('fileName')) {
      params.set('fileName', currentUrl.get('fileName'))
    }
  }
  
  window.history.pushState({}, '', '?' + params.toString())
}

// Load search parameters from URL on mount
const loadFromURL = () => {
  const params = new URLSearchParams(window.location.search)
  
  if (params.has('q')) query.value = params.get('q')
  if (params.has('type')) searchType.value = params.get('type')
  if (params.has('limit')) limit.value = parseInt(params.get('limit'))
  if (params.has('weight')) denseWeight.value = parseFloat(params.get('weight'))
  if (params.has('location')) location.value = params.get('location')
  if (params.has('lat')) latitude.value = parseFloat(params.get('lat'))
  if (params.has('lon')) longitude.value = parseFloat(params.get('lon'))
  if (params.has('radius')) radius.value = parseInt(params.get('radius'))
  
  // If tempFileId is present, restore by-document search type
  if (params.has('tempFileId')) {
    searchType.value = 'by-document'
    tempFileId.value = params.get('tempFileId')
    // Store fileName for display (we don't have the actual File object)
    if (params.has('fileName')) {
      restoredFileName.value = params.get('fileName')
    }
  }
  
  // Load filters
  if (params.has('cat')) {
    filters.value.category = params.get('cat')
    showFilters.value = true
  }
  if (params.has('minPrice')) {
    filters.value.minPrice = parseFloat(params.get('minPrice'))
    showFilters.value = true
  }
  if (params.has('maxPrice')) {
    filters.value.maxPrice = parseFloat(params.get('maxPrice'))
    showFilters.value = true
  }
  if (params.has('minRating')) {
    filters.value.minRating = parseFloat(params.get('minRating'))
    showFilters.value = true
  }
  if (params.has('tags')) {
    filters.value.tags = params.get('tags')
    showFilters.value = true
  }
  if (params.has('docType')) {
    filters.value.documentType = params.get('docType')
    showFilters.value = true
  }
  if (params.has('page')) {
    currentPage.value = parseInt(params.get('page'))
  }
  
  // If URL has query, auto-search (but skip if similarTo/tempFileId is present, as App.vue handles that)
  // Also skip if filters parameter is present, as App.vue handles facet filter restoration
  if (params.has('q') && query.value.trim() && !params.has('similarTo') && !params.has('filters') && !params.has('tempFileId')) {
    handleSubmit()
  }
}

onMounted(async () => {
  await fetchConfig()
  loadFromURL()
})

// Expose pagination methods to parent
defineExpose({
  goToPage,
  nextPage,
  prevPage,
  currentPage
})

// Reset filters when search type changes
watch(searchType, () => {
  if (searchType.value !== 'location') location.value = ''
  if (searchType.value !== 'geo') {
    latitude.value = null
    longitude.value = null
  }
  // Reset to page 1 when changing search type
  currentPage.value = 1
})
</script>

<style scoped>
.search-form {
  position: sticky;
  top: 6rem;
}

.form-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1.25rem;
}

.label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.label-hint {
  color: var(--text-secondary);
  font-weight: 400;
  font-size: 0.85rem;
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--primary-color);
  cursor: pointer;
  border: none;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.geo-inputs {
  display: grid;
  gap: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.filters-section {
  margin: 1.5rem 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.filters-content {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.hint {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-top: 0.75rem;
}
.action-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

/* File upload styling */
.file-upload-area {
  margin-top: 0.5rem;
}

.file-input {
  display: none;
}

.file-upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: all 0.3s ease;
}

.file-upload-label:hover {
  border-color: var(--primary-color);
  background: var(--bg-color);
}

.upload-icon {
  font-size: 3rem;
}

.upload-text {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.upload-text.selected {
  color: var(--primary-color);
  font-weight: 600;
}

.upload-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.btn-surprise {
  width: 100%;
  background: var(--bg-secondary);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-surprise:hover:not(:disabled) {
  background: var(--bg-color);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.btn-surprise:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
