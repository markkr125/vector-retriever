<template>
  <div class="results-list">
    <!-- Header -->
    <div class="results-header card">
      <div v-if="loading" class="loading-state">
        <span class="loading"></span>
        <span>Searching...</span>
      </div>
      <div v-else-if="query || searchType === 'browse'" class="results-info">
        <div class="results-title-row">
          <h2 class="results-title">
            {{ searchType === 'browse' ? '📚 Browse All Documents' : 'Search Results' }}
          </h2>
          <!-- Browse Controls (for browse mode) -->
          <div v-if="searchType === 'browse'" class="browse-controls-inline">
            <label class="control-label">
              Sort by:
              <select v-model="browseSortBy" @change="emit('sort-change', { sortBy: browseSortBy, sortOrder: browseSortOrder })" class="control-select">
                <option value="id">Document ID</option>
                <option value="filename">Filename</option>
                <option value="category">Category</option>
                <option value="date">Date</option>
              </select>
            </label>
            <label class="control-label">
              Order:
              <select v-model="browseSortOrder" @change="emit('sort-change', { sortBy: browseSortBy, sortOrder: browseSortOrder })" class="control-select">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
            <label class="control-label">
              Per page:
              <select v-model="browsePerPage" @change="emit('limit-change', browsePerPage)" class="control-select">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
          </div>
          <!-- Cluster Visualization Button -->
          <button 
            v-if="totalResults > 0 && searchType !== 'random' && searchType !== 'browse' && !showClusterView"
            @click="toggleClusterView" 
            class="btn-visualize-results"
            :disabled="clusterLoading"
          >
            🗺️ Visualize Results ({{ totalResults }})
          </button>
        </div>
        <div class="results-meta">
          <span class="badge badge-primary">{{ searchTypeLabel }}</span>
          <span class="results-count">{{ displayResultsCount }} results out of {{ totalResults }}</span>
          <span v-if="searchType !== 'browse'" class="query-text">"{{ query }}"</span>
          <button 
            v-if="searchType === 'recommendation'"
            @click="emit('clear-similar')"
            class="clear-similar-btn"
            title="Clear Find Similar"
          >
            ✕ Clear
          </button>
          <button 
            v-if="searchType === 'random'"
            @click="emit('clear-random')"
            class="clear-similar-btn"
            title="Clear Random Discovery"
          >
            ✕ Clear
          </button>
        </div>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon">🔍</span>
        <h3>Ready to search</h3>
        <p>Enter your query and configure search settings to begin</p>
      </div>
    </div>

    <!-- Cluster Visualization Panel -->
    <div v-if="query && totalResults > 0 && searchType !== 'random' && showClusterView" class="cluster-visualization-section">
      <!-- Cluster View Panel -->
      <div class="cluster-view-panel card">
        <div class="cluster-header">
          <div class="cluster-info">
            <h3>📊 Search Results Visualization</h3>
            <div v-if="clusterData" class="cluster-meta">
              <span class="cluster-count">
                <strong>{{ clusterData.metadata?.visualizedCount || 0 }}</strong> 
                {{ clusterData.metadata?.visualizedCount >= clusterData.metadata?.totalMatches ? 'results' : `of ${clusterData.metadata?.totalMatches} results` }}
              </span>
              <span v-if="clusterData.fromCache" class="cluster-cache">
                ✅ Cached ({{ formatCacheAge(clusterData.cacheAge) }} ago)
              </span>
              <span v-else class="cluster-fresh">
                🆕 Generated in {{ clusterData.generationTime }}ms
              </span>
            </div>
          </div>
          <div class="cluster-controls">
            <div class="control-group">
              <label>Color by:</label>
              <select v-model="clusterColorBy" class="control-select">
                <option value="category">Category</option>
                <option value="piiRisk">PII Risk</option>
                <option value="date">Upload Date</option>
              </select>
            </div>
            <button 
              v-if="clusterSelectedPoints.length > 0"
              @click="clearClusterSelection" 
              class="btn btn-small btn-clear-selection"
              title="Clear selection filter"
            >
              ✕ Clear Selection
            </button>
            <button @click="refreshClusterView" class="btn btn-small" :disabled="clusterLoading">
              🔄 Refresh
            </button>
            <button @click="hideClusterView" class="btn btn-small btn-close">
              ❌ Hide
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="clusterLoading" class="cluster-loading">
          <div class="spinner"></div>
          <p>Generating visualization...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="clusterError" class="cluster-error">
          <p>❌ {{ clusterError }}</p>
          <button @click="loadClusterVisualization" class="btn btn-small">Retry</button>
        </div>

        <!-- Empty/Stale State -->
        <div v-else-if="!clusterData && showClusterView" class="cluster-empty">
          <p>📊 Click refresh to generate visualization with current filters</p>
          <button @click="loadClusterVisualization" class="btn btn-primary">Generate Visualization</button>
        </div>

        <!-- Scatter Plot -->
        <div v-else-if="clusterData" class="cluster-plot-container">
          <ScatterPlot
            ref="scatterPlotRef"
            :points="clusterData.points"
            :colorBy="clusterColorBy"
            :selectedPoints="clusterSelectedPoints"
            :height="500"
            @point-click="handleClusterPointClick"
            @selection-change="handleClusterSelection"
          />

          <!-- Selection Filter Info -->
          <div v-if="clusterSelectedPoints.length > 0" class="cluster-filter-info">
            <span>📌 Showing {{ clusterSelectedPoints.length }} selected document{{ clusterSelectedPoints.length > 1 ? 's' : '' }} from visualization</span>
            <button @click="clearClusterSelection" class="btn-clear-filter">✕ Clear Filter</button>
          </div>

          <!-- Hidden Selection Panel (kept for reference, not displayed) -->
          <div v-if="false && clusterSelectedPoints.length > 0" class="cluster-selection-panel">
            <div class="selection-header">
              <h4>Selected Documents ({{ clusterSelectedPoints.length }})</h4>
              <button @click="clearClusterSelection" class="btn btn-small">Clear</button>
            </div>
            <div class="selected-list">
              <div
                v-for="point in clusterSelectedPoints.slice(0, 10)"
                :key="point.id"
                class="selected-item"
                @click="scrollToResult(point.id)"
              >
                <div class="selected-title">{{ point.title }}</div>
                <div class="selected-meta">
                  <span class="badge" :style="{ backgroundColor: getCategoryColor(point.category) }">
                    {{ point.category }}
                  </span>
                  <span v-if="point.location" class="badge badge-location">{{ point.location }}</span>
                </div>
              </div>
              <div v-if="clusterSelectedPoints.length > 10" class="selected-more">
                + {{ clusterSelectedPoints.length - 10 }} more
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Results -->
    <transition-group name="slide-up" tag="div" class="results-grid">
      <div 
        v-for="(result, index) in props.results" 
        :key="result.id"
        :id="`result-${result.id}`"
        :data-doc-id="result.id"
        class="result-card card"
        :class="{ 'source-document': result.isSource, 'highlight': highlightedDocId === result.id }"
      >
        <!-- Source Document Badge -->
        <div v-if="result.isSource" class="source-badge">
          📌 Source Document
        </div>
        
        <!-- Score Badge -->
        <div class="result-header">
          <div class="result-rank">#{{ (currentPage - 1) * limit + index + 1 }}</div>
          <div v-if="result.score !== undefined && result.score !== null" class="result-score">
            <div class="score-bar">
              <div 
                class="score-fill" 
                :style="{ width: (result.score * 100) + '%' }"
              ></div>
            </div>
            <span class="score-text">{{ (result.score * 100).toFixed(1) }}%</span>
          </div>
        </div>

        <!-- Metadata -->
        <div class="result-metadata">
          <!-- Filename row with PII indicators -->
          <div class="filename-row">
            <h3 class="result-filename">{{ result.payload.filename }}</h3>
            
            <!-- PII Status Section (aligned right) -->
            <div class="pii-inline-section">
              <!-- Show PII Warning if detected -->
              <button 
                v-if="result.payload.pii_detected"
                @click.stop="showPIIDetails(result)"
                class="pii-warning-badge-inline"
                :class="`risk-${result.payload.pii_risk_level || 'medium'}`"
                :title="`Click to see ${result.payload.pii_details?.length || 0} sensitive data points`"
              >
                <span class="pii-icon">⚠️</span>
                <span class="pii-text">{{ formatPIITypes(result.payload.pii_types) }}</span>
                <span class="pii-count">{{ result.payload.pii_details?.length || 0 }}</span>
              </button>

              <!-- Scan Button (visible for all documents) -->
              <button 
                @click.stop="scanDocumentPII(result.id, result.payload.pii_scan_date)"
                class="btn-scan-pii-inline"
                :class="{ 'already-scanned': result.payload.pii_scan_date }"
                :disabled="scanning[result.id]"
                :title="result.payload.pii_scan_date ? 'Re-scan for sensitive data' : 'Scan for sensitive data (GDPR/PII)'"
              >
                <span v-if="scanning[result.id]">🔄 Scanning...</span>
                <span v-else-if="result.payload.pii_scan_date">🔄 Re-scan</span>
                <span v-else>🔒 Scan PII</span>
              </button>
            </div>
          </div>
          
          <div class="metadata-grid">
            <div v-if="result.payload.category" class="meta-item">
              <span class="meta-label">Category:</span>
              <span class="badge badge-secondary">{{ result.payload.category }}</span>
            </div>
            
            <div v-if="result.payload.location" class="meta-item">
              <span class="meta-label">Location:</span>
              <span class="meta-value">📍 {{ result.payload.location }}</span>
            </div>
            
            <div v-if="result.payload.rating" class="meta-item">
              <span class="meta-label">Rating:</span>
              <span class="meta-value">⭐ {{ result.payload.rating }}/5</span>
            </div>
            
            <div v-if="result.payload.price" class="meta-item">
              <span class="meta-label">Price:</span>
              <span class="meta-value">💰 ${{ result.payload.price }}</span>
            </div>
            
            <div v-if="result.payload.date" class="meta-item">
              <span class="meta-label">Date:</span>
              <span class="meta-value">📅 {{ result.payload.date }}</span>
            </div>
          </div>

          <!-- Tags row -->
          <div class="tags-row">
            <!-- Document Type Badge -->
            <span 
              v-if="result.payload.is_unstructured" 
              class="badge badge-secondary"
              title="Plain text document without structured metadata"
            >
              📄 Unstructured
            </span>
            <span 
              v-if="result.payload.has_structured_metadata" 
              class="badge badge-primary"
              title="Document with rich metadata"
            >
              📊 Structured
            </span>

            <!-- Tags -->
            <span 
              v-for="tag in result.payload.tags" 
              :key="tag"
              class="tag"
              v-if="result.payload.tags && result.payload.tags.length > 0"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Content Preview -->
        <div class="result-content">
          <p>{{ truncateContent(result.payload.content, 300) }}</p>
        </div>

        <!-- Action Buttons -->
        <div class="result-actions">
          <!-- Link version for browse mode (allows open in new tab) -->
          <a 
            v-if="searchType === 'browse'"
            :href="`/search?similarTo=${result.id}`"
            @click.prevent="$emit('find-similar', result.id)"
            class="btn btn-secondary btn-link"
            title="Find documents similar to this one (Ctrl+Click to open in new tab)"
          >
            🔍 Find Similar
          </a>
          <!-- Button version for search results -->
          <button
            v-else
            @click="$emit('find-similar', result.id)"
            class="btn btn-secondary"
            title="Find documents similar to this one"
          >
            🔍 Find Similar
          </button>
          <button 
            @click="toggleExpand(result.id)"
            class="btn btn-secondary"
          >
            {{ expandedIds.has(result.id) ? '▲ Show Less' : '▼ Show More' }}
          </button>
        </div>

        <!-- Full Content (when expanded) -->
        <transition name="fade">
          <div v-if="expandedIds.has(result.id)" class="full-content">
            <h4>Full Content</h4>
            <div class="content-markdown" v-html="renderMarkdown(result.payload.content)"></div>
            
            <!-- All Metadata -->
            <div class="all-metadata">
              <h4>All Metadata</h4>
              <pre class="metadata-json">{{ JSON.stringify(result.payload, null, 2) }}</pre>
            </div>
          </div>
        </transition>
      </div>
    </transition-group>

    <!-- No Results -->
    <div v-if="!loading && query && results.length === 0" class="no-results card">
      <span class="empty-icon">🔍</span>
      <h3>No results found</h3>
      <p>Try adjusting your search query or filters</p>
    </div>

    <!-- Pagination -->
    <div v-if="!loading && results.length > 0" class="pagination card">
      <button 
        @click="emit('page-change', currentPage - 1)"
        :disabled="currentPage === 1"
        class="btn btn-secondary pagination-btn"
      >
        ← Previous
      </button>
      
      <div class="page-numbers">
        <button
          v-for="(page, index) in pageNumbers"
          :key="index"
          @click="typeof page === 'number' ? emit('page-change', page) : null"
          :class="['page-number-btn', { 
            active: page === currentPage,
            ellipsis: page === '...'
          }]"
          :disabled="page === '...'"
        >
          {{ page }}
        </button>
      </div>
      
      <button 
        @click="emit('page-change', currentPage + 1)"
        :disabled="!hasNextPage"
        class="btn btn-secondary pagination-btn"
      >
        Next →
      </button>
    </div>
  </div>
</template>

<script setup>
import { marked } from 'marked'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import api from '../api'
import ScatterPlot from './ScatterPlot.vue'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const props = defineProps({
  results: {
    type: Array,
    default: () => []
  },
  loading: Boolean,
  query: String,
  searchType: String,
  currentPage: {
    type: Number,
    default: 1
  },
  totalResults: {
    type: Number,
    default: 0
  },
  limit: {
    type: Number,
    default: 10
  },
  filters: {
    type: Object,
    default: () => ({})
  },
  denseWeight: {
    type: Number,
    default: 0.7
  },
  browseSortBy: {
    type: String,
    default: 'id'
  },
  browseSortOrder: {
    type: String,
    default: 'asc'
  }
})

const emit = defineEmits(['page-change', 'find-similar', 'clear-similar', 'clear-random', 'show-pii-modal', 'refresh-results', 'scan-complete', 'filter-by-ids', 'sort-change', 'limit-change'])

const expandedIds = ref(new Set())
const scanning = ref({})

// Browse controls (synced with props)
const browseSortBy = ref(props.browseSortBy)
const browseSortOrder = ref(props.browseSortOrder)
const browsePerPage = ref(props.limit)

// Cluster visualization state
const scatterPlotRef = ref(null)
const showClusterView = ref(false)
const clusterData = ref(null)
const clusterLoading = ref(false)
const clusterError = ref(null)
const clusterColorBy = ref('category')
const clusterSelectedPoints = ref([])
const highlightedDocId = ref(null)

const categoryColors = {
  'Restaurant': '#FF6B6B',
  'Hotel': '#4ECDC4',
  'Technology': '#45B7D1',
  'Shopping': '#FFA07A',
  'Attraction': '#98D8C8',
  'Cafe': '#FFD93D',
  'Coworking': '#6C5CE7',
  'Gym': '#A8E6CF',
  'Hospital': '#FF8B94',
  'Museum': '#C7CEEA',
  'University': '#FFEAA7',
  'Unknown': '#95A5A6'
}

// Count results excluding source document for display
const displayResultsCount = computed(() => {
  const resultsToCount = props.results
  const hasSourceDoc = resultsToCount.some(r => r.isSource)
  return hasSourceDoc ? resultsToCount.length - 1 : resultsToCount.length
})

const totalPages = computed(() => {
  if (!props.totalResults || !props.limit) return 1
  return Math.ceil(props.totalResults / props.limit)
})

const hasNextPage = computed(() => {
  return props.currentPage < totalPages.value
})

const pageNumbers = computed(() => {
  const pages = []
  const total = totalPages.value
  const current = props.currentPage
  
  if (total <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= total; i++) {
      pages.push(i)
    }
  } else {
    // Always show first page
    pages.push(1)
    
    if (current <= 3) {
      // Near start: [1] [2] [3] [4] ... [total]
      pages.push(2, 3, 4)
      pages.push('...')
      pages.push(total)
    } else if (current >= total - 2) {
      // Near end: [1] ... [total-3] [total-2] [total-1] [total]
      pages.push('...')
      pages.push(total - 3, total - 2, total - 1, total)
    } else {
      // Middle: [1] ... [current-1] [current] [current+1] ... [total]
      pages.push('...')
      pages.push(current - 1, current, current + 1)
      pages.push('...')
      pages.push(total)
    }
  }
  
  return pages
})

const searchTypeLabel = computed(() => {
  const labels = {
    semantic: '🧠 Semantic Search',
    hybrid: '🔀 Hybrid Search',
    location: '📍 Location Search',
    geo: '🌍 Geo-Radius Search',
    recommendation: '✨ Similar Documents',
    random: '🎲 Random Discovery',
    facet: '📂 Browse by Filter',
    browse: '📚 Browse All'
  }
  return labels[props.searchType] || 'Search'
})

const truncateContent = (content, maxLength) => {
  if (!content) return ''
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

const renderMarkdown = (content) => {
  if (!content) return ''
  try {
    // In marked v17+, options are passed directly to marked()
    return marked.parse(content, {
      breaks: true,
      gfm: true
    })
  } catch (e) {
    console.error('Markdown rendering error:', e)
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

const toggleExpand = (id) => {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}
const formatPIITypes = (types) => {
  if (!types || types.length === 0) return ''
  const icons = {
    credit_card: '💳',
    email: '📧',
    phone: '📱',
    ssn: '🆔',
    address: '🏠',
    bank_account: '🏦',
    name: '👤',
    dob: '🎂',
    medical: '🏥',
    ip_address: '🌐'
  }
  return types.map(t => icons[t] || '🔒').join(' ')
}

const showPIIDetails = (result) => {
  emit('show-pii-modal', {
    id: result.id,
    filename: result.payload.filename,
    piiTypes: result.payload.pii_types,
    piiDetails: result.payload.pii_details,
    riskLevel: result.payload.pii_risk_level,
    scanDate: result.payload.pii_scan_date
  })
}

const scanDocumentPII = async (docId, alreadyScanned) => {
  scanning.value[docId] = true
  
  try {
    // Add force=true query param if document was already scanned
    const url = alreadyScanned 
      ? `/documents/${docId}/scan-pii?force=true`
      : `/documents/${docId}/scan-pii`
    
    const response = await api.post(url)
    
    // Emit notification event instead of alert
    emit('scan-complete', {
      success: true,
      piiDetected: response.data.piiDetected,
      message: response.data.message,
      piiTypes: response.data.piiTypes || [],
      piiCount: response.data.piiDetails?.length || 0
    })
    
    emit('refresh-results')
    
  } catch (error) {
    console.error('Scan error:', error)
    emit('scan-complete', {
      success: false,
      error: error.response?.data?.error || error.message
    })
  } finally {
    scanning.value[docId] = false
  }
}

// Cluster visualization methods
const toggleClusterView = async () => {
  if (showClusterView.value) {
    showClusterView.value = false
  } else {
    showClusterView.value = true
    if (!clusterData.value) {
      await loadClusterVisualization()
    }
  }
}

const loadClusterVisualization = async (forceRefresh = false) => {
  clusterLoading.value = true
  clusterError.value = null
  
  try {
    const payload = {
      query: props.query,
      searchType: props.searchType,
      denseWeight: props.denseWeight,
      filters: props.filters,
      limit: 5000,
      forceRefresh
    }
    
    const response = await fetch(`${API_URL}/api/visualize/search-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const result = await response.json()
    clusterData.value = result.data  // Extract the data property from the response
    
    // After visualization loads, check if there's a selection in URL to restore
    // Wait a bit longer for the plot to fully render
    setTimeout(() => {
      restoreSelectionFromURL()
    }, 500)
  } catch (error) {
    console.error('Cluster visualization error:', error)
    clusterError.value = error.message || 'Failed to load cluster visualization'
  } finally {
    clusterLoading.value = false
  }
}

const refreshClusterView = async () => {
  await loadClusterVisualization(true)
}

const hideClusterView = () => {
  showClusterView.value = false
}

const handleClusterPointClick = (point) => {
  const docId = point.customdata?.id
  if (!docId) return
  
  // Check if the document is in current results
  const docIndex = props.results.findIndex(r => r.id === docId)
  
  if (docIndex !== -1) {
    scrollToResult(docId)
  }
}

const handleClusterSelection = (points, geometry) => {
  if (!points || points.length === 0) {
    clusterSelectedPoints.value = []
    // Clear the ID filter - refresh to show all results
    emit('filter-by-ids', [])
    // Remove selection from URL
    const url = new URL(window.location)
    url.searchParams.delete('selection')
    window.history.replaceState({}, '', url)
    return
  }
  clusterSelectedPoints.value = points.map(p => ({
    id: p.id,
    title: p.title || 'Untitled',
    category: p.category
  })).filter(p => p.id)
  
  // Emit event to trigger search with only selected IDs
  const selectedIds = clusterSelectedPoints.value.map(p => p.id)
  emit('filter-by-ids', selectedIds)
  
  // Store selection geometry in URL
  if (geometry) {
    const url = new URL(window.location)
    let selectionParam = ''
    
    if (geometry.type === 'box' && geometry.range) {
      // Box: store as "box:x0,y0,x1,y1"
      const x0 = geometry.range.x[0].toFixed(2)
      const y0 = geometry.range.y[0].toFixed(2)
      const x1 = geometry.range.x[1].toFixed(2)
      const y1 = geometry.range.y[1].toFixed(2)
      selectionParam = `box:${x0},${y0},${x1},${y1}`
    } else if (geometry.type === 'lasso' && geometry.lassoPoints) {
      // Lasso: store as "lasso:x1,y1,x2,y2,..." (simplified/decimated if too long)
      const xCoords = geometry.lassoPoints.x.map(x => x.toFixed(2))
      const yCoords = geometry.lassoPoints.y.map(y => y.toFixed(2))
      const coords = xCoords.map((x, i) => `${x},${yCoords[i]}`).join(',')
      selectionParam = `lasso:${coords}`
    }
    
    if (selectionParam) {
      url.searchParams.set('selection', selectionParam)
      window.history.replaceState({}, '', url)
    }
  }
}

const scrollToResult = (docId) => {
  highlightedDocId.value = docId
  
  // Wait for next tick to ensure DOM is updated
  nextTick(() => {
    const element = document.getElementById(`result-${docId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      
      // Remove highlight after animation
      setTimeout(() => {
        highlightedDocId.value = null
      }, 2000)
    }
  })
}

const clearClusterSelection = () => {
  clusterSelectedPoints.value = []
  // Clear the visual selection in the plot
  if (scatterPlotRef.value) {
    scatterPlotRef.value.clearSelection()
  }
  // Remove from URL
  const url = new URL(window.location)
  url.searchParams.delete('selection')
  window.history.replaceState({}, '', url)
}

const restoreSelectionFromURL = async () => {
  const url = new URL(window.location)
  const selectionParam = url.searchParams.get('selection')
  
  if (!selectionParam || !scatterPlotRef.value) return
  
  try {
    const [type, coordsStr] = selectionParam.split(':')
    
    if (type === 'box') {
      // Parse box: "x0,y0,x1,y1"
      const [x0, y0, x1, y1] = coordsStr.split(',').map(parseFloat)
      const geometry = {
        type: 'box',
        range: { x: [x0, x1], y: [y0, y1] }
      }
      await scatterPlotRef.value.applySelection(geometry)
    } else if (type === 'lasso') {
      // Parse lasso: "x1,y1,x2,y2,..."
      const coords = coordsStr.split(',').map(parseFloat)
      const xCoords = []
      const yCoords = []
      for (let i = 0; i < coords.length; i += 2) {
        xCoords.push(coords[i])
        yCoords.push(coords[i + 1])
      }
      const geometry = {
        type: 'lasso',
        lassoPoints: { x: xCoords, y: yCoords }
      }
      await scatterPlotRef.value.applySelection(geometry)
    }
  } catch (error) {
    console.error('Failed to restore selection from URL:', error)
  }
}

const formatCacheAge = (ms) => {
  if (ms < 1000) return `${Math.round(ms)}ms ago`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

const getCategoryColor = (category) => {
  return categoryColors[category] || '#64748b'
}

// Watch for filter changes and invalidate visualization
// Only marks visualization as stale, doesn't auto-refresh to avoid loops
watch(
  () => JSON.stringify({
    query: props.query,
    searchType: props.searchType,
    filters: props.filters,
    denseWeight: props.denseWeight
  }),
  (newVal, oldVal) => {
    if (oldVal && newVal !== oldVal && showClusterView.value && clusterData.value) {
      // Clear cluster data to force user to manually refresh
      // This prevents stale visualizations from being shown
      clusterData.value = null
      clusterSelectedPoints.value = []
    }
  }
)

// Check for selection parameter on mount - auto-show visualization if present
watch(
  () => props.results,
  (newResults) => {
    if (newResults && newResults.length > 0) {
      const url = new URL(window.location)
      const selectionParam = url.searchParams.get('selection')
      
      // If there's a selection in URL and visualization isn't shown, show it
      if (selectionParam && !showClusterView.value) {
        toggleClusterView()
      }
    }
  },
  { immediate: true }
)

// Listen for custom event to restore selection (triggered by browser back/forward)
onMounted(() => {
  const handleRestoreSelection = async (event) => {
    // Always ensure visualization is shown
    if (!showClusterView.value) {
      toggleClusterView()
      // Wait for visualization to load before restoring selection
      return
    }
    
    // Visualization is already showing
    if (clusterData.value) {
      // Restore selection immediately
      await nextTick()
      setTimeout(() => restoreSelectionFromURL(), 300)
    }
    // If clusterData doesn't exist yet, the selection will be restored
    // when loadClusterVisualization completes (it calls restoreSelectionFromURL)
  }
  
  const handleClearSelection = () => {
    // Clear selection state
    clusterSelectedPoints.value = []
    emit('filter-by-ids', [])
    
    // Hide the visualization when selection is cleared via browser navigation
    if (showClusterView.value) {
      showClusterView.value = false
      clusterData.value = null
    }
  }
  
  window.addEventListener('restore-selection', handleRestoreSelection)
  window.addEventListener('clear-selection', handleClearSelection)
  
  // Cleanup on unmount
  onUnmounted(() => {
    window.removeEventListener('restore-selection', handleRestoreSelection)
    window.removeEventListener('clear-selection', handleClearSelection)
  })
})
</script>

<style scoped>
.results-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.results-header {
  padding: 2rem;
}

/* Cluster Visualization Section */
.cluster-visualization-section {
  margin: 0.75rem 0;
}

.btn-visualize-results {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 600;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.btn-visualize-results:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.cluster-view-panel {
  margin-top: -1rem;
  margin-bottom: -1rem;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  background: var(--bg-secondary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.cluster-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
}

.cluster-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.cluster-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.cluster-controls label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-right: 0.25rem;
}

.cluster-controls select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: white;
  font-size: 0.85rem;
  cursor: pointer;
}

.cluster-controls button {
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
}

.cluster-controls button:hover {
  background: var(--bg-secondary);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.btn-clear-selection {
  background: #fef3c7 !important;
  border-color: #f59e0b !important;
  color: #92400e !important;
}

.btn-clear-selection:hover {
  background: #fde68a !important;
  border-color: #d97706 !important;
  color: #78350f !important;
}

.cluster-plot-container {
  margin-top: 1rem;
  height: 500px;
  border-radius: 8px;
  overflow: hidden;
}

.cluster-loading,
.cluster-error,
.cluster-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 1rem;
  color: var(--text-secondary);
}

.cluster-error {
  color: #dc2626;
  flex-direction: column;
  gap: 0.5rem;
}

.cluster-empty {
  flex-direction: column;
  gap: 1rem;
  background: #f0f9ff;
  border: 2px dashed #3b82f6;
  border-radius: 8px;
  padding: 2rem;
}

.cluster-empty p {
  margin: 0;
  font-size: 1rem;
  color: #1e40af;
}

.cluster-filter-info {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: #dbeafe;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e40af;
}

.btn-clear-filter {
  padding: 0.35rem 0.75rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-clear-filter:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
}

.cluster-info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--bg-primary);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.cluster-selection-panel {
  margin-top: 1rem;
  padding: 1rem;
  background: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 8px;
}

.cluster-selection-panel h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  color: var(--text-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cluster-selection-panel button {
  padding: 0.25rem 0.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  transition: all 0.2s;
}

.cluster-selection-panel button:hover {
  background: #2563eb;
}

.selected-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
}

.selected-item {
  padding: 0.5rem;
  background: white;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.selected-item {
  padding: 0.75rem;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.selected-item:hover {
  background: #dbeafe;
  transform: translateX(4px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.selected-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.selected-meta {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.selected-more {
  padding: 0.5rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-style: italic;
}

.result-card.highlight {
  animation: highlightPulse 0.6s ease-in-out;
}

@keyframes highlightPulse {
  0%, 100% {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }
  50% {
    box-shadow: 0 4px 30px rgba(59, 130, 246, 0.6);
    transform: scale(1.01);
  }
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: center;
  font-size: 1.1rem;
  color: var(--text-secondary);
}

.results-info {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.results-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.browse-controls-inline {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.control-select {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: white;
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.control-select:hover {
  border-color: var(--primary-color);
}

.control-select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.results-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.clear-similar-btn {
  padding: 0.35rem 0.75rem;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
  white-space: nowrap;
  margin-left: 0.5rem;
}

.clear-similar-btn:hover {
  background: #b91c1c;
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(220, 38, 38, 0.4);
}

.results-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.results-count {
  color: var(--text-secondary);
  font-weight: 500;
}

.query-text {
  color: var(--primary-color);
  font-weight: 500;
  font-style: italic;
}

.empty-state,
.no-results {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: 1rem;
}

.empty-state h3,
.no-results h3 {
  font-size: 1.5rem;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.results-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.result-card {
  transition: all 0.3s;
  position: relative;
}

.result-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.result-card.source-document {
  border: 2px solid #667eea;
  background: linear-gradient(to bottom, rgba(102, 126, 234, 0.05), white);
}

.source-badge {
  position: absolute;
  top: -12px;
  right: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  z-index: 1;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.result-rank {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color);
  min-width: 3rem;
}

.result-score {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.score-bar {
  flex: 1;
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
  transition: width 0.6s ease-out;
}

.score-text {
  font-weight: 600;
  color: var(--text-primary);
  min-width: 4rem;
  text-align: right;
}

.result-metadata {
  margin-bottom: 1rem;
}

.filename-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.result-filename {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  word-break: break-word;
  overflow-wrap: break-word;
  flex: 1;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.meta-label {
  color: var(--text-secondary);
  font-weight: 500;
}

.meta-value {
  color: var(--text-primary);
}

/* Tags Row */
.tags-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.tag {
  padding: 0.25rem 0.75rem;
  background: var(--background);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* PII Inline Section */
.pii-inline-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* Inline PII Warning Badge */
.pii-warning-badge-inline {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #ff9800, #ff5722);
  border: 2px solid #ff5722;
  border-radius: 6px;
  color: white;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.pii-warning-badge-inline:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 87, 34, 0.3);
}

.pii-warning-badge-inline.risk-low {
  background: linear-gradient(135deg, #4caf50, #45a049);
  border-color: #4caf50;
}

.pii-warning-badge-inline.risk-medium {
  background: linear-gradient(135deg, #ff9800, #fb8c00);
  border-color: #ff9800;
}

.pii-warning-badge-inline.risk-high {
  background: linear-gradient(135deg, #ff5722, #f4511e);
  border-color: #ff5722;
}

.pii-warning-badge-inline.risk-critical {
  background: linear-gradient(135deg, #d32f2f, #c62828);
  border-color: #d32f2f;
  animation: pulse 2s infinite;
}

.pii-warning-badge-inline .pii-icon {
  font-size: 1rem;
}

.pii-warning-badge-inline .pii-text {
  font-size: 0.85rem;
}

.pii-warning-badge-inline .pii-count {
  background: rgba(255, 255, 255, 0.3);
  padding: 0.15rem 0.4rem;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 700;
}

/* Inline Scan Button */
.btn-scan-pii-inline {
  padding: 0.5rem 0.9rem;
  background: #ff5722;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-scan-pii-inline:hover:not(:disabled) {
  background: #f4511e;
}

.btn-scan-pii-inline.already-scanned {
  background: #666;
  color: white;
}

.btn-scan-pii-inline.already-scanned:hover:not(:disabled) {
  background: #555;
}

.btn-scan-pii-inline:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

.doc-type-badges {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

/* Scan PII Button Styles (legacy - keeping for compatibility) */
.pii-scan-section {
  margin: 1rem 0;
}

.btn-scan-pii {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-scan-pii:hover:not(:disabled) {
  background: var(--primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
}

.btn-scan-pii:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.result-content {
  padding: 1rem;
  background: var(--background);
  border-radius: 8px;
  margin-bottom: 1rem;
}

.result-content p {
  color: var(--text-primary);
  line-height: 1.6;
  margin: 0;
}

.result-actions {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.result-actions .btn {
  flex: 1;
}

.btn-link {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.btn-link:hover {
  text-decoration: none;
}

.expand-btn {
  width: 100%;
}

.full-content {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.full-content h4 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.content-text,
.metadata-json {
  background: var(--background);
  padding: 1rem;
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  overflow-x: auto;
  max-width: 100%;
  color: var(--text-primary);
}

.content-markdown {
  background: var(--background);
  padding: 1.5rem;
  border-radius: 8px;
  line-height: 1.8;
  color: var(--text-primary);
  max-width: 100%;
  overflow-x: auto;
}

/* Markdown content styling */
.content-markdown h1,
.content-markdown h2,
.content-markdown h3,
.content-markdown h4,
.content-markdown h5,
.content-markdown h6 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.content-markdown h1 { font-size: 1.75rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; }
.content-markdown h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.4rem; }
.content-markdown h3 { font-size: 1.25rem; }
.content-markdown h4 { font-size: 1.1rem; }
.content-markdown h5 { font-size: 1rem; }
.content-markdown h6 { font-size: 0.9rem; color: var(--text-secondary); }

.content-markdown p {
  margin-bottom: 1rem;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.content-markdown ul,
.content-markdown ol {
  margin-bottom: 1rem;
  padding-left: 2rem;
}

.content-markdown li {
  margin-bottom: 0.5rem;
}

.content-markdown table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  overflow-x: auto;
  display: block;
}

.content-markdown th,
.content-markdown td {
  border: 1px solid var(--border-color);
  padding: 0.75rem;
  text-align: left;
}

.content-markdown th {
  background: var(--background);
  font-weight: 600;
  color: var(--text-primary);
}

.content-markdown tr:nth-child(even) {
  background: rgba(0, 0, 0, 0.02);
}

.content-markdown code {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.content-markdown pre {
  background: rgba(0, 0, 0, 0.05);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 1rem 0;
}

.content-markdown pre code {
  background: none;
  padding: 0;
}

.content-markdown blockquote {
  border-left: 4px solid var(--primary-color);
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--text-secondary);
  font-style: italic;
}

.content-markdown hr {
  border: none;
  border-top: 2px solid var(--border-color);
  margin: 2rem 0;
}

.content-markdown a {
  color: var(--primary-color);
  text-decoration: none;
}

.content-markdown a:hover {
  text-decoration: underline;
}

.all-metadata {
  margin-top: 1.5rem;
}

.metadata-json {
  max-height: 400px;
  overflow-y: auto;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
  margin-top: 1.5rem;
}

.pagination-btn {
  min-width: 120px;
}

.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-numbers {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.page-number-btn {
  min-width: 40px;
  height: 40px;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  background: white;
  color: var(--text-primary);
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.page-number-btn:hover:not(.ellipsis):not(.active) {
  background: var(--background);
  border-color: var(--primary-color);
}

.page-number-btn.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.page-number-btn.ellipsis {
  border: none;
  background: transparent;
  cursor: default;
}

.page-number-btn:disabled {
  cursor: default;
}
</style>
