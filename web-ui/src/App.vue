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
            <button @click="showUploadModal = true" class="btn btn-add">
              ➕ Add Document
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="container">
        <div class="layout">
          <!-- Search Section -->
          <div class="search-section">
            <SearchForm
              @search="handleSearch"
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
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from './api'
import ResultsList from './components/ResultsList.vue'
import SearchForm from './components/SearchForm.vue'
import UploadModal from './components/UploadModal.vue'

const loading = ref(false)
const results = ref([])
const currentQuery = ref('')
const searchType = ref('')
const stats = ref(null)
const showUploadModal = ref(false)

// Load stats on mount
onMounted(async () => {
  try {
    const response = await api.get('/stats')
    stats.value = response.data
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
})

// Handle search
const handleSearch = async (searchParams) => {
  loading.value = true
  currentQuery.value = searchParams.query
  searchType.value = searchParams.searchType
  results.value = []

  try {
    let response
    
    switch (searchParams.searchType) {
      case 'semantic':
        response = await api.post('/search/semantic', {
          query: searchParams.query,
          limit: searchParams.limit,
          filters: searchParams.filters
        })
        break
      
      case 'hybrid':
        response = await api.post('/search/hybrid', {
          query: searchParams.query,
          limit: searchParams.limit,
          denseWeight: searchParams.denseWeight,
          filters: searchParams.filters
        })
        break
      
      case 'location':
        response = await api.post('/search/location', {
          query: searchParams.query,
          location: searchParams.location,
          limit: searchParams.limit
        })
        break
      
      case 'geo':
        response = await api.post('/search/geo', {
          query: searchParams.query,
          latitude: searchParams.latitude,
          longitude: searchParams.longitude,
          radius: searchParams.radius,
          limit: searchParams.limit
        })
        break
    }
    
    results.value = response.data.results || []
  } catch (error) {
    console.error('Search error:', error)
    alert('Search failed: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
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
