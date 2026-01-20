<template>
  <div class="results-list">
    <!-- Header -->
    <div class="results-header card">
      <div v-if="loading" class="loading-state">
        <span class="loading"></span>
        <span>Searching...</span>
      </div>
      <div v-else-if="query || searchType === 'browse' || searchType === 'bookmarks'" class="results-info">
        <div class="results-title-row">
          <h2 class="results-title">
            {{ searchType === 'bookmarks' ? '⭐ My Bookmarks' : (searchType === 'browse' ? '📚 Browse All Documents' : 'Search Results') }}
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
          <!-- Bookmarks Controls (for bookmarks mode) -->
          <div v-if="searchType === 'bookmarks'" class="browse-controls-inline">
            <label class="control-label">
              Per page:
              <select v-model="bookmarksPerPage" @change="emit('limit-change', bookmarksPerPage)" class="control-select">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
          </div>
          <!-- Cluster Visualization Button -->
          <button 
            v-if="totalResults > 0 && searchType !== 'random' && !showClusterView"
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
          <span v-if="searchType !== 'browse' && searchType !== 'bookmarks' && query && query.trim()" class="query-text">"{{ query }}"</span>
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
      <div v-else-if="searchType === 'bookmarks' && totalResults === 0" class="empty-state">
        <span class="empty-icon">⭐</span>
        <h3>No bookmarks yet</h3>
        <p>Click the ⭐ star icon on any result to bookmark it!</p>
      </div>
      <div v-else class="empty-state">
        <span class="empty-icon">🔍</span>
        <h3>Ready to search</h3>
        <p>Enter your query and configure search settings to begin</p>
      </div>
    </div>

    <!-- Filename Filter Section (Browse & Bookmarks) - Outside of header card -->
    <div v-if="(query || searchType === 'browse' || searchType === 'bookmarks') && (searchType === 'browse' || searchType === 'bookmarks')" class="filter-menu-section">
      <div class="filter-menu-header">
        <span class="filter-menu-title">📝 Filename Filter</span>
      </div>
      <div class="filter-menu-content">
        <div class="filename-filter-wrapper">
          <input
            v-if="searchType === 'browse'"
            type="text"
            v-model="browseFilenameFilter"
            @input="handleBrowseFilenameChange"
            placeholder="🔍 Filter by filename..."
            class="filename-filter-input"
          />
          <input
            v-else-if="searchType === 'bookmarks'"
            type="text"
            v-model="bookmarksFilenameFilter"
            @input="handleBookmarksFilenameChange"
            placeholder="🔍 Filter by filename..."
            class="filename-filter-input"
          />
          <button
            v-if="(searchType === 'browse' && browseFilenameFilter) || (searchType === 'bookmarks' && bookmarksFilenameFilter)"
            @click="searchType === 'browse' ? clearBrowseFilenameFilter() : clearBookmarksFilenameFilter()"
            class="clear-filter-btn"
            title="Clear filter"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Cluster Visualization Panel -->
    <div v-if="(query || searchType === 'bookmarks' || searchType === 'browse') && totalResults > 0 && searchType !== 'random' && showClusterView" class="cluster-visualization-section">
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
            <div class="control-group">
              <label>Max docs:</label>
              <select v-model="clusterMaxDocs" @change="refreshClusterView" class="control-select">
                <option :value="100">100</option>
                <option :value="500">500</option>
                <option :value="1000">1000</option>
                <option :value="5000">5000</option>
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
        v-for="(result, index) in resultsWithFormattedPII" 
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
                <span class="pii-text">{{ result._formattedPIITypes }}</span>
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
              class="metadata-badge unstructured"
              title="Plain text document without structured metadata"
            >
              📄 Unstructured
            </span>
            <span 
              v-if="result.payload.has_structured_metadata" 
              class="metadata-badge structured"
              title="Document with rich metadata"
            >
              📊 Structured
            </span>
            <span 
              v-if="result.payload.document_type === 'image' || (result.payload.file_type && result.payload.file_type.startsWith('image'))" 
              class="badge badge-info"
              title="Image document processed with vision model"
            >
              📷 Image
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

          <!-- Upload/Update timestamps -->
          <div class="timestamp-row">
            <span v-if="result.payload.added_at" class="timestamp" :title="result.payload.added_at">
              📅 Uploaded: {{ formatDate(result.payload.added_at) }}
            </span>
            <span 
              v-if="result.payload.last_updated && result.payload.last_updated !== result.payload.added_at" 
              class="timestamp updated"
              :title="result.payload.last_updated"
            >
              🔄 Last updated: {{ formatDate(result.payload.last_updated) }}
            </span>
          </div>
        </div>

        <!-- Content Preview -->
        <div class="result-content">
          <p>{{ truncateContent(result.payload.content, 300) }}</p>
        </div>

        <!-- Action Buttons -->
        <div class="result-actions">
          <!-- Bookmark Button -->
          <button
            @click="toggleBookmark(result.id)"
            class="btn btn-bookmark"
            :class="{ 'bookmarked': isBookmarked(result.id) }"
            :title="isBookmarked(result.id) ? 'Remove bookmark' : 'Bookmark this document'"
          >
            {{ isBookmarked(result.id) ? '⭐' : '☆' }}
          </button>
          <!-- Link version for browse/bookmarks mode (allows open in new tab) -->
          <a 
            v-if="searchType === 'browse' || searchType === 'bookmarks'"
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
            <!-- Content Tabs -->
            <div class="content-tabs">
              <button 
                @click="setActiveTab(result.id, 'content')"
                :class="['tab-btn', { active: getActiveTab(result.id) === 'content' }]"
              >
                📄 Full Content
              </button>
              <button 
                @click="setActiveTab(result.id, 'overview')"
                :class="['tab-btn', { active: getActiveTab(result.id) === 'overview' }]"
              >
                📝 Overview
              </button>
            </div>

            <!-- Overview Tab -->
            <div v-if="getActiveTab(result.id) === 'overview'" class="tab-content">
              <div class="overview-header">
                <h4>Document Overview</h4>
                <button 
                  @click="generateDescription(result.id)"
                  class="btn btn-refresh"
                  :disabled="generatingDescription.has(result.id) || (result.payload.document_type === 'image' && !result.payload.image_data)"
                  :title="getRefreshButtonTitle(result)"
                >
                  <span v-if="generatingDescription.has(result.id)">⏳ Generating...</span>
                  <span v-else>🔄 {{ result.payload.description ? 'Refresh' : 'Generate' }}</span>
                </button>
              </div>

              <!-- Detected Language -->
              <div v-if="result.payload.detected_language" class="metadata-info language-badge">
                <span class="badge">🌐 {{ result.payload.detected_language }}</span>
              </div>

              <!-- Image without source data warning -->
              <div v-if="result.payload.document_type === 'image' && !result.payload.image_data && result.payload.description" class="info-message">
                ℹ️ This description was generated during upload. Refresh is unavailable because the original image was not stored.
              </div>

              <div v-if="result.payload.description" class="description-content" v-html="renderMarkdown(result.payload.description)"></div>
              <div v-else-if="generatingDescription.has(result.id)" class="description-loading">
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
              </div>
              <div v-else class="no-description">
                <p>No description available. Click "Generate" to create one.</p>
              </div>
              <div v-if="descriptionError.has(result.id)" class="error-message">
                ❌ {{ descriptionError.get(result.id) }}
              </div>
            </div>

            <!-- Full Content Tab -->
            <div v-if="getActiveTab(result.id) === 'content'" class="tab-content">
              <h4>Full Content</h4>
              <div class="content-markdown" v-html="renderMarkdown(result.payload.content)"></div>
              
              <!-- All Metadata -->
              <div class="all-metadata">
                <h4>All Metadata</h4>
                <pre class="metadata-json">{{ JSON.stringify(result.payload, null, 2) }}</pre>
              </div>
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
  },
  currentCollectionId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['page-change', 'find-similar', 'clear-similar', 'clear-random', 'show-pii-modal', 'refresh-results', 'scan-complete', 'filter-by-ids', 'sort-change', 'limit-change', 'filename-filter-change'])

const expandedIds = ref(new Set())
const scanning = ref({})

// Tab state for each document (overview or content)
const documentTabs = ref(new Map())
const generatingDescription = ref(new Set())
const descriptionError = ref(new Map())

// Get active tab for a document (default: content)
const getActiveTab = (docId) => {
  return documentTabs.value.get(docId) || 'content'
}

// Set active tab for a document
const setActiveTab = (docId, tab) => {
  documentTabs.value.set(docId, tab)
}

// Get refresh button title based on document type and data availability
const getRefreshButtonTitle = (result) => {
  if (result.payload.document_type === 'image' && !result.payload.image_data) {
    return 'Cannot refresh - original image not stored'
  }
  return result.payload.description ? 'Regenerate description' : 'Generate description'
}

// Generate description for a document
const generateDescription = async (docId) => {
  generatingDescription.value.add(docId)
  descriptionError.value.delete(docId)
  
  try {
    const response = await api.post(`/documents/${docId}/generate-description`, {}, {
      params: { collection: props.currentCollectionId }
    })
    
    if (response.data.success) {
      // Update the result in place
      const result = props.results.find(r => r.id === docId)
      if (result) {
        result.payload.description = response.data.description
        // Also update detected language if provided
        if (response.data.detected_language) {
          result.payload.detected_language = response.data.detected_language
        }
      }
      console.log('Description generated successfully')
    }
  } catch (error) {
    console.error('Failed to generate description:', error)
    descriptionError.value.set(docId, error.response?.data?.error || 'Failed to generate description')
  } finally {
    generatingDescription.value.delete(docId)
  }
}

// Filename filter state
const browseFilenameFilter = ref('')
const bookmarksFilenameFilter = ref('')
let filenameFilterTimeout = null

// Bookmarks state (localStorage)
const bookmarkedIds = ref(new Set())

// Load bookmarks from localStorage on mount
const loadBookmarks = () => {
  try {
    const stored = localStorage.getItem('bookmarkedDocuments')
    if (stored) {
      bookmarkedIds.value = new Set(JSON.parse(stored))
    }
  } catch (error) {
    console.error('Failed to load bookmarks:', error)
  }
}

// Save bookmarks to localStorage
const saveBookmarks = () => {
  try {
    localStorage.setItem('bookmarkedDocuments', JSON.stringify(Array.from(bookmarkedIds.value)))
  } catch (error) {
    console.error('Failed to save bookmarks:', error)
  }
}

// Check if document is bookmarked
const isBookmarked = (docId) => {
  return bookmarkedIds.value.has(docId)
}

// Toggle bookmark
const toggleBookmark = (docId) => {
  if (bookmarkedIds.value.has(docId)) {
    bookmarkedIds.value.delete(docId)
  } else {
    bookmarkedIds.value.add(docId)
  }
  saveBookmarks()
  
  // If we're in bookmarks view and removing a bookmark, refresh the list
  if (props.searchType === 'bookmarks' && !bookmarkedIds.value.has(docId)) {
    emit('refresh-results')
  }
}

// Load bookmarks on mount
onMounted(() => {
  loadBookmarks()
})

// Browse controls (synced with props)
const browseSortBy = ref(props.browseSortBy)
const browseSortOrder = ref(props.browseSortOrder)
const browsePerPage = ref(props.limit)

// Bookmarks controls
const bookmarksPerPage = ref(props.limit)

// Filename filter methods
const handleBrowseFilenameChange = () => {
  clearTimeout(filenameFilterTimeout)
  filenameFilterTimeout = setTimeout(() => {
    emit('filename-filter-change', { mode: 'browse', filter: browseFilenameFilter.value })
  }, 300) // 300ms debounce
}

const handleBookmarksFilenameChange = () => {
  clearTimeout(filenameFilterTimeout)
  filenameFilterTimeout = setTimeout(() => {
    emit('filename-filter-change', { mode: 'bookmarks', filter: bookmarksFilenameFilter.value })
  }, 300) // 300ms debounce
}

const clearBrowseFilenameFilter = () => {
  browseFilenameFilter.value = ''
  emit('filename-filter-change', { mode: 'browse', filter: '' })
}

const clearBookmarksFilenameFilter = () => {
  bookmarksFilenameFilter.value = ''
  emit('filename-filter-change', { mode: 'bookmarks', filter: '' })
}

// Cluster visualization state
const scatterPlotRef = ref(null)
const showClusterView = ref(false)
const clusterData = ref(null)
const clusterLoading = ref(false)
const clusterError = ref(null)
const clusterColorBy = ref('category')
const clusterMaxDocs = ref(1000)
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
    browse: '📚 Browse All',
    bookmarks: '⭐ My Bookmarks'
  }
  return labels[props.searchType] || 'Search'
})

const truncateContent = (content, maxLength) => {
  if (!content) return ''
  if (content.length <= maxLength) return content
  return content.substring(0, maxLength) + '...'
}

const formatDate = (isoString) => {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return isoString
  }
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

// Computed property to ensure proper reactivity for PII type formatting
const resultsWithFormattedPII = computed(() => {
  return props.results.map(result => {
    const piiTypes = result.payload?.pii_types
    let formattedPIITypes = ''
    
    if (piiTypes && Array.isArray(piiTypes) && piiTypes.length > 0) {
      const icons = {
        'credit_card': '💳',
        'credit_card_last4': '💳',
        'email': '📧',
        'phone': '📞',
        'address': '📍',
        'ssn': '🆔',
        'name': '👤',
        'bank_account': '🏦',
        'passport': '🛂',
        'driver_license': '🚗',
        'date_of_birth': '📅',
        'ip_address': '🌐',
        'medical': '🏥'
      }
      formattedPIITypes = piiTypes.map(t => icons[t] || '🔒').join(' ')
    }
    
    return {
      ...result,
      _formattedPIITypes: formattedPIITypes
    }
  })
})

const formatPIITypes = (types) => {
  if (!types || types.length === 0) return ''
  // Only documented PII types from PII_DETECTION.md
  const icons = {
    'credit_card': '💳',
    'credit_card_last4': '💳',
    'email': '📧',
    'phone': '📞',
    'address': '📍',
    'ssn': '🆔',
    'name': '👤',
    'bank_account': '🏦',
    'passport': '🛂',
    'driver_license': '🚗',
    'date_of_birth': '📅',
    'ip_address': '🌐',
    'medical': '🏥'
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
      limit: clusterMaxDocs.value,
      forceRefresh
    }
    
    // For bookmarks, include the specific document IDs
    if (props.searchType === 'bookmarks') {
      payload.bookmarkIds = props.results.map(r => r.id)
    }
    
    // Build URL with collection parameter
    const collectionParam = props.currentCollectionId ? `?collection=${props.currentCollectionId}` : ''
    const response = await fetch(`${API_URL}/api/visualize/search-results${collectionParam}`, {
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
  clearClusterSelection()
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
  // Clear the ID filter
  emit('filter-by-ids', [])
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

<style scoped lang="scss" src="@/scss/components/search/ResultsList.scss"></style>
