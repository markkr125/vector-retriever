<template>
  <div class="facets-sidebar card">
    <h3 class="facets-title">Browse by</h3>
    
    <!-- Categories -->
    <div class="facet-group">
      <button 
        @click="categoryExpanded = !categoryExpanded"
        class="facet-header"
      >
        <span>📂 Categories</span>
        <span>{{ categoryExpanded ? '▼' : '▶' }}</span>
      </button>
      <div v-if="categoryExpanded" class="facet-list">
        <button
          v-for="cat in facets.categories"
          :key="cat.name"
          @click="$emit('filter-category', cat.name)"
          class="facet-item"
        >
          <span class="facet-name">{{ cat.name }}</span>
          <span class="facet-count">{{ cat.count }}</span>
        </button>
      </div>
    </div>

    <!-- Locations -->
    <div class="facet-group">
      <button 
        @click="locationExpanded = !locationExpanded"
        class="facet-header"
      >
        <span>📍 Locations</span>
        <span>{{ locationExpanded ? '▼' : '▶' }}</span>
      </button>
      <div v-if="locationExpanded" class="facet-list">
        <button
          v-for="loc in facets.locations"
          :key="loc.name"
          @click="$emit('filter-location', loc.name)"
          class="facet-item"
        >
          <span class="facet-name">{{ loc.name }}</span>
          <span class="facet-count">{{ loc.count }}</span>
        </button>
      </div>
    </div>

    <!-- Tags -->
    <div class="facet-group">
      <button 
        @click="tagsExpanded = !tagsExpanded"
        class="facet-header"
      >
        <span>🏷️ Tags</span>
        <span>{{ tagsExpanded ? '▼' : '▶' }}</span>
      </button>
      <div v-if="tagsExpanded" class="facet-list">
        <button
          v-for="tag in facets.tags"
          :key="tag.name"
          @click="$emit('filter-tag', tag.name)"
          class="facet-item"
        >
          <span class="facet-name">{{ tag.name }}</span>
          <span class="facet-count">{{ tag.count }}</span>
        </button>
      </div>
    </div>

    <!-- Sensitive Information (PII) -->
    <div class="facet-group pii-facet">
      <button 
        @click="piiExpanded = !piiExpanded"
        class="facet-header"
        :class="{ 'has-warning': facets.piiStats?.total > 0 }"
      >
        <span>🔒 Sensitive Information</span>
        <span>{{ piiExpanded ? '▼' : '▶' }}</span>
      </button>
      <div v-if="piiExpanded" class="facet-list">
        <!-- Show all documents with PII -->
        <button
          @click="$emit('filter-pii-any')"
          class="facet-item pii-any-item"
          v-if="facets.piiStats?.total > 0"
        >
          <span class="facet-name">
            ⚠️ Any Sensitive Data
          </span>
          <span class="facet-count danger">{{ facets.piiStats.total }}</span>
        </button>

        <!-- Individual PII types -->
        <button
          v-for="piiType in facets.piiTypes"
          :key="piiType.name"
          @click="$emit('filter-pii-type', piiType.name)"
          class="facet-item pii-type-item"
        >
          <span class="facet-name">
            {{ getPIIIcon(piiType.name) }} {{ formatPIILabel(piiType.name) }}
          </span>
          <span class="facet-count">{{ piiType.count }}</span>
        </button>

        <!-- Risk level filters -->
        <div class="risk-level-filters" v-if="facets.piiStats?.riskLevels && hasRiskLevels">
          <div class="facet-subheader">By Risk Level:</div>
          <button
            v-for="(count, level) in facets.piiStats.riskLevels"
            :key="level"
            v-show="count > 0"
            @click="$emit('filter-pii-risk', level)"
            class="facet-item risk-item"
            :class="`risk-${level}`"
          >
            <span class="facet-name">{{ level.toUpperCase() }}</span>
            <span class="facet-count">{{ count }}</span>
          </button>
        </div>

        <!-- Bulk scan button -->
        <div class="bulk-scan-section" v-if="!facets.piiStats || facets.piiStats.total === 0">
          <button @click="$emit('bulk-scan-pii')" class="btn-bulk-scan">
            🔍 Scan All Documents for PII
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../api'

const emit = defineEmits(['filter-category', 'filter-location', 'filter-tag', 'filter-pii-any', 'filter-pii-type', 'filter-pii-risk', 'bulk-scan-pii'])

const facets = ref({
  categories: [],
  locations: [],
  tags: [],
  piiStats: { total: 0, percentage: 0, riskLevels: {} },
  piiTypes: []
})

const categoryExpanded = ref(true)
const locationExpanded = ref(false)
const tagsExpanded = ref(false)
const piiExpanded = ref(false)

const hasRiskLevels = computed(() => {
  const levels = facets.value.piiStats?.riskLevels || {}
  return Object.values(levels).some(count => count > 0)
})

const getPIIIcon = (type) => {
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
  return icons[type] || '🔒'
}

const formatPIILabel = (type) => {
  const labels = {
    credit_card: 'Credit Card',
    email: 'Email',
    phone: 'Phone',
    ssn: 'SSN/National ID',
    address: 'Address',
    bank_account: 'Bank Account',
    name: 'Names',
    dob: 'Date of Birth',
    medical: 'Medical Info',
    ip_address: 'IP Address'
  }
  return labels[type] || type
}

onMounted(async () => {
  try {
    const response = await api.get('/facets')
    facets.value = {
      categories: response.data.categories || [],
      locations: response.data.locations || [],
      tags: response.data.tags || [],
      piiStats: response.data.piiStats || { total: 0, percentage: 0, riskLevels: {} },
      piiTypes: response.data.piiTypes || []
    }
  } catch (error) {
    console.error('Failed to load facets:', error)
  }
})
</script>

<style scoped>
.facets-sidebar {
  margin-top: 1.5rem;
}

.facets-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
}

.facet-group {
  margin-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
}

.facet-group:last-child {
  border-bottom: none;
}

.facet-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
  transition: background 0.2s;
  border-radius: 6px;
}

.facet-header:hover {
  background: var(--background);
}

.facet-list {
  margin-top: 0.5rem;
}

.facet-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  border-radius: 6px;
}

.facet-item:hover {
  background: var(--background);
  color: var(--primary-color);
}

.facet-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.facet-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--background);
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  min-width: 2rem;
  text-align: center;
}

.facet-item:hover .facet-count {
  background: var(--primary-color);
  color: white;
}

.facet-count.danger {
  background: #ffebee;
  color: #d32f2f;
  font-weight: 700;
}

/* PII Facet Styles */
.pii-facet .facet-header.has-warning {
  background: linear-gradient(135deg, rgba(255, 152, 0, 0.1), rgba(255, 87, 34, 0.1));
  border-left: 3px solid #ff5722;
}

.pii-any-item {
  background: rgba(255, 152, 0, 0.05);
  border-left: 3px solid #ff9800;
}

.pii-type-item:hover {
  border-left: 3px solid #ff9800;
}

.facet-subheader {
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--background);
  border-radius: 4px;
  margin: 0.5rem 0;
}

.risk-item.risk-low {
  border-left: 3px solid #4caf50;
}

.risk-item.risk-medium {
  border-left: 3px solid #ff9800;
}

.risk-item.risk-high {
  border-left: 3px solid #ff5722;
}

.risk-item.risk-critical {
  border-left: 3px solid #d32f2f;
  background: rgba(211, 47, 47, 0.05);
}

.bulk-scan-section {
  padding: 1rem;
}

.btn-bulk-scan {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.btn-bulk-scan:hover {
  background: var(--primary-dark);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
}
</style>

