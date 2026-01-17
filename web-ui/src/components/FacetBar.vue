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
              @click="selectPIIRisk('never_scanned')"
              class="popup-item"
              :class="{ selected: selectedPIIRisk === 'never_scanned' }"
            >
              <span class="item-name">❓ Never Scanned</span>
              <span class="item-count">{{ facets.piiRiskLevels.never_scanned || 0 }}</span>
            </button>
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
  },
  currentCollectionId: {
    type: [String, null],
    default: null
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

// Always show all collection-wide facets for better discoverability
// Users can select any facet even when filters are active
const facets = computed(() => {
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

const loadFacets = async () => {
  try {
    const response = await api.get('/facets')
    const data = response.data
    allFacets.value = {
      categories: data.categories || [],
      locations: data.locations || [],
      tags: data.tags || [],
      piiRiskLevels: data.piiStats?.riskLevels || { never_scanned: 0, none: 0, low: 0, medium: 0, high: 0, critical: 0 },
      piiTypes: data.piiTypes || []
    }
  } catch (error) {
    console.error('Failed to load facets:', error)
  }
}

onMounted(async () => {
  // Load all facets from API
  await loadFacets()
  
  // Add click listener to close dropdowns
  document.addEventListener('click', handleClickOutside)
})

// Watch for collection changes and reload facets
watch(() => props.currentCollectionId, async (newId, oldId) => {
  if (newId !== oldId) {
    await loadFacets()
  }
})

// Cleanup
watch(() => {}, () => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped lang="scss" src="@/scss/components/FacetBar.scss"></style>
