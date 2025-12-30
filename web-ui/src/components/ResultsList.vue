<template>
  <div class="results-list">
    <!-- Header -->
    <div class="results-header card">
      <div v-if="loading" class="loading-state">
        <span class="loading"></span>
        <span>Searching...</span>
      </div>
      <div v-else-if="query" class="results-info">
        <h2 class="results-title">
          Search Results
        </h2>
        <div class="results-meta">
          <span class="badge badge-primary">{{ searchTypeLabel }}</span>
          <span class="results-count">{{ displayResultsCount }} results out of {{ totalResults }}</span>
          <span class="query-text">"{{ query }}"</span>
          <button 
            v-if="searchType === 'recommendation'"
            @click="emit('clear-similar')"
            class="clear-similar-btn"
            title="Clear Find Similar"
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

    <!-- Results -->
    <transition-group name="slide-up" tag="div" class="results-grid">
      <div 
        v-for="(result, index) in results" 
        :key="result.id"
        class="result-card card"
        :class="{ 'source-document': result.isSource }"
      >
        <!-- Source Document Badge -->
        <div v-if="result.isSource" class="source-badge">
          📌 Source Document
        </div>
        
        <!-- Score Badge -->
        <div class="result-header">
          <div class="result-rank">#{{ (currentPage - 1) * limit + index + 1 }}</div>
          <div class="result-score">
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
          <button 
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
import { computed, ref } from 'vue'
import api from '../api'

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
  }
})

const emit = defineEmits(['page-change', 'find-similar', 'clear-similar', 'show-pii-modal', 'refresh-results', 'scan-complete'])

const expandedIds = ref(new Set())
const scanning = ref({})

// Count results excluding source document for display
const displayResultsCount = computed(() => {
  const hasSourceDoc = props.results.some(r => r.isSource)
  return hasSourceDoc ? props.results.length - 1 : props.results.length
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
    facet: '📂 Browse by Filter'
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
}</script>

<style scoped>
.results-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.results-header {
  padding: 2rem;
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

.results-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
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
