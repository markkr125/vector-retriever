<template>
  <div class="facet-bar card">
    <div class="facet-bar-content">
      <div class="facet-buttons">
        <!-- Categories Button -->
        <div class="facet-dropdown">
          <button 
            @click="toggleDropdown('categories')"
            class="facet-btn"
            :class="{ active: openDropdown === 'categories', selected: selectedCategory }"
          >
            📂 Categories
            <span class="count-badge">{{ facets.categories.length }}</span>
          </button>
        
        <div v-if="openDropdown === 'categories'" class="facet-popup" @click.stop>
          <div class="popup-header">
            <input 
              v-model="categorySearch"
              type="text"
              class="popup-search"
              placeholder="Search categories..."
              @click.stop
            />
            <button 
              v-if="selectedCategory"
              @click="clearCategoryFilter"
              class="popup-clear-btn"
              title="Clear category filter"
            >
              ✕ Clear
            </button>
          </div>
          <div class="popup-list">
            <button
              v-for="cat in filteredCategories"
              :key="cat.name"
              @click="selectCategory(cat.name)"
              class="popup-item"
              :class="{ selected: cat.name === selectedCategory }"
            >
              <span class="item-name">{{ cat.name }}</span>
              <span class="item-count">{{ cat.count }}</span>
            </button>
            <div v-if="filteredCategories.length === 0" class="no-results">
              No categories found
            </div>
          </div>
        </div>
      </div>

      <!-- Locations Button -->
      <div class="facet-dropdown">
        <button 
          @click="toggleDropdown('locations')"
          class="facet-btn"
          :class="{ active: openDropdown === 'locations', selected: selectedLocation }"
        >
          📍 Locations
          <span class="count-badge">{{ facets.locations.length }}</span>
        </button>
        
        <div v-if="openDropdown === 'locations'" class="facet-popup" @click.stop>
          <div class="popup-header">
            <input 
              v-model="locationSearch"
              type="text"
              class="popup-search"
              placeholder="Search locations..."
              @click.stop
            />
            <button 
              v-if="selectedLocation"
              @click="clearLocationFilter"
              class="popup-clear-btn"
              title="Clear location filter"
            >
              ✕ Clear
            </button>
          </div>
          <div class="popup-list">
            <button
              v-for="loc in filteredLocations"
              :key="loc.name"
              @click="selectLocation(loc.name)"
              class="popup-item"
              :class="{ selected: loc.name === selectedLocation }"
            >
              <span class="item-name">{{ loc.name }}</span>
              <span class="item-count">{{ loc.count }}</span>
            </button>
            <div v-if="filteredLocations.length === 0" class="no-results">
              No locations found
            </div>
          </div>
        </div>
      </div>

      <!-- Tags Button -->
      <div class="facet-dropdown">
        <button 
          @click="toggleDropdown('tags')"
          class="facet-btn"
          :class="{ active: openDropdown === 'tags', selected: selectedTags.length > 0 }"
        >
          🏷️ Tags
          <span class="count-badge">{{ facets.tags.length }}</span>
        </button>
        
        <div v-if="openDropdown === 'tags'" class="facet-popup" @click.stop>
          <div class="popup-header">
            <input 
              v-model="tagSearch"
              type="text"
              class="popup-search"
              placeholder="Search tags..."
              @click.stop
            />
            <button 
              v-if="selectedTags.length > 0"
              @click="clearTagsFilter"
              class="popup-clear-btn"
              title="Clear tag filters"
            >
              ✕ Clear {{ selectedTags.length > 1 ? 'All' : '' }}
            </button>
          </div>
          <div class="popup-list">
            <button
              v-for="tag in filteredTags"
              :key="tag.name"
              @click="selectTag(tag.name)"
              class="popup-item"
              :class="{ selected: selectedTags.includes(tag.name) }"
            >
              <span class="item-name">{{ tag.name }}</span>
              <span class="item-count">{{ tag.count }}</span>
            </button>
            <div v-if="filteredTags.length === 0" class="no-results">
              No tags found
            </div>
          </div>
        </div>
      </div>

      <!-- PII Risk Level Button -->
      <div class="facet-dropdown">
        <button 
          @click="toggleDropdown('piiRisk')"
          class="facet-btn"
          :class="{ active: openDropdown === 'piiRisk', selected: selectedPIIRisk }"
        >
          ⚠️ PII Severity
          <span v-if="selectedPIIRisk" class="count-badge selected">1</span>
        </button>
        
        <div v-if="openDropdown === 'piiRisk'" class="facet-popup" @click.stop>
          <div class="popup-header">
            <button 
              v-if="selectedPIIRisk"
              @click="clearPIIRiskFilter"
              class="popup-clear-btn"
              title="Clear severity filter"
            >
              ✕ Clear
            </button>
          </div>
          <div class="popup-list">
            <button
              @click="selectPIIRisk('none')"
              class="popup-item"
              :class="{ selected: selectedPIIRisk === 'none' }"
            >
              <span class="item-name">✅ No PII</span>
              <span class="item-count">{{ facets.piiRiskLevels.none || 0 }}</span>
            </button>
            <button
              @click="selectPIIRisk('low')"
              class="popup-item"
              :class="{ selected: selectedPIIRisk === 'low' }"
            >
              <span class="item-name">🟢 Low Risk</span>
              <span class="item-count">{{ facets.piiRiskLevels.low || 0 }}</span>
            </button>
            <button
              @click="selectPIIRisk('medium')"
              class="popup-item"
              :class="{ selected: selectedPIIRisk === 'medium' }"
            >
              <span class="item-name">🟡 Medium Risk</span>
              <span class="item-count">{{ facets.piiRiskLevels.medium || 0 }}</span>
            </button>
            <button
              @click="selectPIIRisk('high')"
              class="popup-item"
              :class="{ selected: selectedPIIRisk === 'high' }"
            >
              <span class="item-name">🔴 High Risk</span>
              <span class="item-count">{{ facets.piiRiskLevels.high || 0 }}</span>
            </button>
            <button
              @click="selectPIIRisk('critical')"
              class="popup-item"
              :class="{ selected: selectedPIIRisk === 'critical' }"
            >
              <span class="item-name">⛔ Critical Risk</span>
              <span class="item-count">{{ facets.piiRiskLevels.critical || 0 }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- PII Type Button -->
      <div class="facet-dropdown">
        <button 
          @click="toggleDropdown('piiTypes')"
          class="facet-btn"
          :class="{ active: openDropdown === 'piiTypes', selected: selectedPIITypes.length > 0 }"
        >
          🔒 PII Types
          <span class="count-badge">{{ facets.piiTypes.length }}</span>
        </button>
        
        <div v-if="openDropdown === 'piiTypes'" class="facet-popup" @click.stop>
          <div class="popup-header">
            <input 
              v-model="piiTypeSearch"
              type="text"
              class="popup-search"
              placeholder="Search PII types..."
              @click.stop
            />
            <button 
              v-if="selectedPIITypes.length > 0"
              @click="clearPIITypesFilter"
              class="popup-clear-btn"
              title="Clear PII type filters"
            >
              ✕ Clear {{ selectedPIITypes.length > 1 ? 'All' : '' }}
            </button>
          </div>
          <div class="popup-list">
            <button
              v-for="type in filteredPIITypes"
              :key="type.name"
              @click="selectPIIType(type.name)"
              class="popup-item"
              :class="{ selected: selectedPIITypes.includes(type.name) }"
            >
              <span class="item-name">{{ formatPIITypeName(type.name) }}</span>
              <span class="item-count">{{ type.count }}</span>
            </button>
            <div v-if="filteredPIITypes.length === 0" class="no-results">
              No PII types found
            </div>
          </div>
        </div>
      </div>
    </div>
      
    <!-- Clear Filter Button -->
    <button 
      v-if="activeFilters.length > 0"
      @click="clearFilter"
      class="clear-filter-btn"
    >
      ✕ Clear {{ activeFilters.length > 1 ? 'Filters' : 'Filter' }}
    </button>
  </div>
</div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../api'

const props = defineProps({
  results: {
    type: Array,
    default: () => []
  },
  activeFilters: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['filter-category', 'filter-location', 'filter-tag', 'filter-pii-risk', 'filter-pii-type', 'clear-filter'])

const allFacets = ref({
  categories: [],
  locations: [],
  tags: [],
  piiRiskLevels: {},
  piiTypes: []
})

const openDropdown = ref(null)
const categorySearch = ref('')
const locationSearch = ref('')
const tagSearch = ref('')
const piiTypeSearch = ref('')

// Get selected values from props
const selectedCategory = computed(() => {
  const filter = props.activeFilters.find(f => f.type === 'category')
  return filter ? filter.value : null
})
const selectedLocation = computed(() => {
  const filter = props.activeFilters.find(f => f.type === 'location')
  return filter ? filter.value : null
})
const selectedTags = computed(() => {
  return props.activeFilters.filter(f => f.type === 'tag').map(f => f.value)
})
const selectedPIIRisk = computed(() => {
  const filter = props.activeFilters.find(f => f.type === 'pii_risk')
  return filter ? filter.value : null
})
const selectedPIITypes = computed(() => {
  return props.activeFilters.filter(f => f.type === 'pii_type').map(f => f.value)
})

// Compute facets from current results if available, otherwise show collection counts
const facets = computed(() => {
  // If we have results (like from Find Similar or Surprise Me), calculate from those
  if (props.results.length > 0) {
    const categoryCounts = {}
    const locationCounts = {}
    const tagCounts = {}
    const riskLevelCounts = { none: 0, low: 0, medium: 0, high: 0, critical: 0 }
    const piiTypeCounts = {}
    
    props.results.forEach(result => {
      // Count categories
      if (result.payload?.category) {
        categoryCounts[result.payload.category] = (categoryCounts[result.payload.category] || 0) + 1
      }
      
      // Count locations
      if (result.payload?.location) {
        locationCounts[result.payload.location] = (locationCounts[result.payload.location] || 0) + 1
      }
      
      // Count tags
      if (result.payload?.tags && Array.isArray(result.payload.tags)) {
        result.payload.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1
        })
      }
      
      // Count PII risk levels
      if (result.payload?.pii_detected) {
        const riskLevel = result.payload.pii_risk_level || 'medium'
        riskLevelCounts[riskLevel] = (riskLevelCounts[riskLevel] || 0) + 1
        
        // Count PII types
        if (result.payload.pii_types && Array.isArray(result.payload.pii_types)) {
          result.payload.pii_types.forEach(type => {
            piiTypeCounts[type] = (piiTypeCounts[type] || 0) + 1
          })
        }
      } else {
        // No PII detected
        riskLevelCounts.none++
      }
    })
    
    return {
      categories: Object.entries(categoryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      locations: Object.entries(locationCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      tags: Object.entries(tagCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      piiRiskLevels: riskLevelCounts,
      piiTypes: Object.entries(piiTypeCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    }
  }
  
  // Otherwise show collection-wide counts
  return allFacets.value
})

const filteredCategories = computed(() => {
  if (!categorySearch.value) return facets.value.categories
  const search = categorySearch.value.toLowerCase()
  return facets.value.categories.filter(cat => 
    cat.name.toLowerCase().includes(search)
  )
})

const filteredLocations = computed(() => {
  if (!locationSearch.value) return facets.value.locations
  const search = locationSearch.value.toLowerCase()
  return facets.value.locations.filter(loc => 
    loc.name.toLowerCase().includes(search)
  )
})

const filteredTags = computed(() => {
  if (!tagSearch.value) return facets.value.tags
  const search = tagSearch.value.toLowerCase()
  return facets.value.tags.filter(tag => 
    tag.name.toLowerCase().includes(search)
  )
})

const filteredPIITypes = computed(() => {
  if (!piiTypeSearch.value) return facets.value.piiTypes
  const search = piiTypeSearch.value.toLowerCase()
  return facets.value.piiTypes.filter(type => 
    type.name.toLowerCase().includes(search)
  )
})

const formatPIITypeName = (type) => {
  const icons = {
    'name': '👤',
    'email': '📧',
    'phone': '📞',
    'address': '🏠',
    'ssn': '🆔',
    'credit_card': '💳',
    'passport': '🛂',
    'driver_license': '🚗',
    'ip_address': '🌐',
    'date_of_birth': '🎂'
  }
  const icon = icons[type] || '🔒'
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  return `${icon} ${label}`
}

const toggleDropdown = (dropdown) => {
  openDropdown.value = openDropdown.value === dropdown ? null : dropdown
  // Reset search when opening
  if (openDropdown.value === dropdown) {
    categorySearch.value = ''
    locationSearch.value = ''
    tagSearch.value = ''
    piiTypeSearch.value = ''
  }
}

const selectCategory = (category) => {
  emit('filter-category', category)
  openDropdown.value = null
}

const selectLocation = (location) => {
  emit('filter-location', location)
  openDropdown.value = null
}

const selectTag = (tag) => {
  emit('filter-tag', tag)
  openDropdown.value = null
}

const selectPIIRisk = (level) => {
  emit('filter-pii-risk', level)
  openDropdown.value = null
}

const selectPIIType = (type) => {
  emit('filter-pii-type', type)
  // Don't close dropdown to allow multi-select
}

const clearCategoryFilter = () => {
  if (selectedCategory.value) {
    emit('filter-category', selectedCategory.value) // Toggle off
  }
}

const clearLocationFilter = () => {
  if (selectedLocation.value) {
    emit('filter-location', selectedLocation.value) // Toggle off
  }
}

const clearTagsFilter = () => {
  // Clear all selected tags one by one
  selectedTags.value.forEach(tag => {
    emit('filter-tag', tag) // Toggle each off
  })
}

const clearPIIRiskFilter = () => {
  if (selectedPIIRisk.value) {
    emit('filter-pii-risk', selectedPIIRisk.value) // Toggle off
  }
}

const clearPIITypesFilter = () => {
  // Clear all selected PII types one by one
  selectedPIITypes.value.forEach(type => {
    emit('filter-pii-type', type) // Toggle each off
  })
}

const clearFilter = () => {
  emit('clear-filter')
}

// Close dropdown when clicking outside
const handleClickOutside = (e) => {
  if (!e.target.closest('.facet-dropdown')) {
    openDropdown.value = null
  }
}

onMounted(async () => {
  // Load all facets from API
  try {
    const response = await api.get('/facets')
    const data = response.data
    allFacets.value = {
      categories: data.categories || [],
      locations: data.locations || [],
      tags: data.tags || [],
      piiRiskLevels: data.piiStats?.riskLevels || { none: 0, low: 0, medium: 0, high: 0, critical: 0 },
      piiTypes: data.piiTypes || []
    }
  } catch (error) {
    console.error('Failed to load facets:', error)
  }
  
  // Add click listener to close dropdowns
  document.addEventListener('click', handleClickOutside)
})

// Cleanup
watch(() => {}, () => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.facet-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: white;
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  border-radius: 8px;
}

.facet-bar-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.facet-buttons {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  flex: 1;
}

.facet-dropdown {
  position: relative;
}

.clear-filter-btn {
  font-size: 0.85rem;
  padding: 0.5rem 1rem;
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(220, 38, 38, 0.3);
  flex-shrink: 0;
}

.clear-filter-btn:hover {
  background: #b91c1c;
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(220, 38, 38, 0.4);
}

.facet-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  transition: all 0.2s;
}

.facet-btn:hover {
  border-color: var(--primary-color);
  background: var(--background);
}

.facet-btn.active {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: white;
}

.facet-btn.selected {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: white;
}

.count-badge {
  background: var(--background);
  color: var(--text-secondary);
  padding: 0.15rem 0.5rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

.facet-btn.active .count-badge {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.facet-popup {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  z-index: 100;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  min-width: 280px;
  max-width: 400px;
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.popup-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.popup-search {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9rem;
}

.popup-search:focus {
  outline: none;
  border-color: var(--primary-color);
}

.popup-clear-btn {
  padding: 0.5rem 0.75rem;
  background: #f3f4f6;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.85rem;
  color: #dc2626;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  font-weight: 500;
}

.popup-clear-btn:hover {
  background: #fee2e2;
  border-color: #dc2626;
}

.popup-list {
  overflow-y: auto;
  max-height: 320px;
}

.popup-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  text-align: left;
  transition: background 0.2s;
}

.popup-item:last-child {
  border-bottom: none;
}

.popup-item:hover {
  background: var(--background);
}

.popup-item.selected {
  background: var(--primary-color);
  color: white;
}

.popup-item.selected .item-name {
  color: white;
  font-weight: 600;
}

.popup-item.selected .item-count {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.item-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.item-count {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--background);
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  min-width: 2rem;
  text-align: center;
}

.no-results {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
</style>
