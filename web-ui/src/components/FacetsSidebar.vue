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
  // Only documented PII types from PII_DETECTION.md
  const icons = {
    credit_card: '💳',
    credit_card_last4: '💳',
    email: '📧',
    phone: '📞',
    address: '📍',
    ssn: '🆔',
    name: '👤',
    bank_account: '🏦',
    passport: '🛂',
    driver_license: '🚗',
    date_of_birth: '📅',
    ip_address: '🌐',
    medical: '🏥'
  }
  return icons[type] || '🔒'
}

const formatPIILabel = (type) => {
  // Only documented PII types from PII_DETECTION.md
  const labels = {
    credit_card: 'Credit Card',
    credit_card_last4: 'Credit Card Last 4',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    ssn: 'SSN',
    name: 'Name',
    bank_account: 'Bank Account',
    passport: 'Passport',
    driver_license: 'Driver License',
    date_of_birth: 'Date of Birth',
    ip_address: 'IP Address',
    medical: 'Medical Info'
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

<style scoped src="@/css/FacetsSidebar.css"></style>
