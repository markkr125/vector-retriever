<template>
  <div class="search-form card">
    <h2 class="form-title">Search Configuration</h2>
    
    <!-- Search Type Selector -->
    <div class="form-group">
      <label class="label">Search Type</label>
      <select v-model="searchType" class="select">
        <option value="hybrid">Hybrid (Semantic + Keywords)</option>
        <option value="semantic">Semantic Only</option>
        <option value="location">Location-Based</option>
        <option value="geo">Geo-Radius</option>
      </select>
    </div>

    <!-- Query Input -->
    <div class="form-group">
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

    <!-- Submit Button -->
    <button 
      @click="handleSubmit"
      :disabled="!canSubmit || loading"
      class="btn btn-primary"
      style="width: 100%;"
    >
      <span v-if="loading" class="loading"></span>
      <span v-else>🔍 Search</span>
    </button>

    <p class="hint">Press Ctrl+Enter to search</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  loading: Boolean,
  stats: Object
})

const emit = defineEmits(['search'])

// Form state
const searchType = ref('hybrid')
const query = ref('')
const denseWeight = ref(0.7)
const location = ref('')
const latitude = ref(null)
const longitude = ref(null)
const radius = ref(50000)
const limit = ref(10)
const showFilters = ref(false)

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

// Validation
const canSubmit = computed(() => {
  if (!query.value.trim()) return false
  if (searchType.value === 'location' && !location.value) return false
  if (searchType.value === 'geo') {
    return latitude.value !== null && longitude.value !== null && radius.value > 0
  }
  return true
})

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
const handleSubmit = () => {
  if (!canSubmit.value || props.loading) return
  
  const searchParams = {
    query: query.value.trim(),
    searchType: searchType.value,
    limit: limit.value
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
}

// Reset filters when search type changes
watch(searchType, () => {
  if (searchType.value !== 'location') location.value = ''
  if (searchType.value !== 'geo') {
    latitude.value = null
    longitude.value = null
  }
})
</script>

<style scoped>
.search-form {
  position: sticky;
  top: 2rem;
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
</style>
