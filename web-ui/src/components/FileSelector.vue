<template>
  <div v-if="show" class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content file-selector-modal">
      <div class="modal-header">
        <h2>Select Files to Import</h2>
        <button class="close-btn" @click="handleCancel" title="Close">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Summary Stats -->
        <div class="selection-summary">
          <div class="summary-item">
            <span class="summary-label">Available:</span>
            <span class="summary-value">{{ filteredFiles.length }} files</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Selected:</span>
            <span class="summary-value selected-count">{{ selectedFiles.length }} files</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Total Size:</span>
            <span class="summary-value">{{ formatBytes(selectedTotalSize) }}</span>
          </div>
        </div>

        <!-- Folder Navigation (S3 keys / path-like providers) -->
        <div v-if="hasFolderNavigation" class="folder-nav">
          <div class="breadcrumbs">
            <button
              class="crumb"
              :class="{ active: currentFolder === '' }"
              @click="goToFolder('')"
              title="Root"
            >
              Root
            </button>
            <template v-for="(crumb, i) in breadcrumbs" :key="crumb.path">
              <span class="crumb-sep">/</span>
              <button
                class="crumb"
                :class="{ active: i === breadcrumbs.length - 1 }"
                @click="goToFolder(crumb.path)"
                :title="crumb.path"
              >
                {{ crumb.name }}
              </button>
            </template>
          </div>

          <div v-if="currentFolder" class="folder-actions">
            <button class="folder-up" @click="goUpFolder" title="Go up one level">
              ⬅️ Up
            </button>
            <span class="folder-path" :title="currentFolder">{{ currentFolder }}</span>
          </div>
        </div>

        <!-- Filters Row -->
        <div class="filters-row">
          <!-- Search -->
          <div class="filter-group">
            <label>Search:</label>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Filter by filename..."
              class="filter-input"
            />
          </div>

          <!-- File Type Filter -->
          <div class="filter-group">
            <label>File Type:</label>
            <select v-model="selectedType" class="filter-select">
              <option value="">All Types</option>
              <option v-for="type in availableTypes" :key="type" :value="type">
                {{ type }}
              </option>
            </select>
          </div>

          <!-- Size Range Filter -->
          <div class="filter-group">
            <label>Size:</label>
            <select v-model="selectedSizeRange" class="filter-select">
              <option value="">Any Size</option>
              <option value="0-100000">< 100 KB</option>
              <option value="100000-1000000">100 KB - 1 MB</option>
              <option value="1000000-10000000">1 MB - 10 MB</option>
              <option value="10000000-100000000">10 MB - 100 MB</option>
              <option value="100000000-999999999999">> 100 MB</option>
            </select>
          </div>
        </div>

        <!-- Bulk Actions -->
        <div class="bulk-actions">
          <button @click="selectAll" class="action-btn">Select All</button>
          <button @click="clearSelection" class="action-btn">Clear Selection</button>
        </div>

        <!-- Files List -->
        <div class="files-list">
          <!-- Folders (not selectable) -->
          <div
            v-for="folder in currentFolders"
            :key="folder.path"
            class="file-item folder-item"
            @click="goToFolder(folder.path)"
            :title="folder.path"
          >
            <span class="folder-icon">📁</span>
            <div class="file-info">
              <div class="file-name">{{ folder.name }}</div>
              <div class="file-meta">
                <span class="file-size">Folder</span>
              </div>
            </div>
          </div>

          <div
            v-for="file in paginatedFiles"
            :key="getFileIdentity(file)"
            class="file-item"
            :class="{ selected: isSelected(file) }"
            @click="toggleFile(file)"
          >
            <input
              type="checkbox"
              :checked="isSelected(file)"
              @click.stop="toggleFile(file)"
              class="file-checkbox"
            />
            <div class="file-info">
              <div class="file-name" :title="file.name">{{ file.name }}</div>
              <div
                v-if="isGlobalFilterMode && getFileFolderPath(file)"
                class="file-path"
                :title="getFileFolderPath(file)"
              >
                📁 {{ getFileFolderPath(file) }}
              </div>
              <div class="file-meta">
                <span class="file-type">{{ file.extension }}</span>
                <span class="file-size">{{ formatBytes(file.size) }}</span>
                <span v-if="file.lastModified" class="file-date">
                  {{ formatDate(file.lastModified) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="currentFolders.length === 0 && filteredFiles.length === 0" class="empty-state">
            No files match your filters
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="pagination">
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="page-btn"
          >
            Previous
          </button>
          <span class="page-info">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <button
            @click="currentPage++"
            :disabled="currentPage === totalPages"
            class="page-btn"
          >
            Next
          </button>
        </div>
      </div>

      <div class="modal-footer">
        <button @click="handleCancel" class="btn-cancel">Cancel</button>
        <button
          @click="handleConfirm"
          class="btn-confirm"
          :disabled="selectedFiles.length === 0"
        >
          Import {{ selectedFiles.length }} File{{ selectedFiles.length !== 1 ? 's' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  show: Boolean,
  provider: {
    type: String,
    default: ''
  },
  rootPrefix: {
    type: String,
    default: ''
  },
  files: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close', 'confirm'])

// State
const searchQuery = ref('')
const selectedType = ref('')
const selectedSizeRange = ref('')
const selectedFiles = ref([])
const currentPage = ref(1)
const currentFolder = ref('')
const itemsPerPage = 20

const isGlobalFilterMode = computed(() => {
  return hasFolderNavigation.value && (searchQuery.value || selectedType.value || selectedSizeRange.value)
})

// Computed
const normalizedRootPrefix = computed(() => {
  if (!props.rootPrefix) return ''
  let prefix = String(props.rootPrefix)
  // Normalize: no leading slash, ensure trailing slash when non-empty
  prefix = prefix.replace(/^\/+/, '')
  if (prefix && !prefix.endsWith('/')) prefix += '/'
  return prefix
})

const hasFolderNavigation = computed(() => {
  // Only show folder navigation when there are path-like keys.
  return props.files.some(f => typeof f?.key === 'string' && f.key.includes('/'))
})

const folderIndex = computed(() => {
  const index = new Map()
  const ensure = (path) => {
    if (!index.has(path)) {
      index.set(path, { folders: new Set(), files: [] })
    }
    return index.get(path)
  }

  ensure('')

  for (const file of props.files) {
    const key = typeof file?.key === 'string' ? file.key : ''
    if (!key) {
      ensure('').files.push(file)
      continue
    }

    const rootPrefix = normalizedRootPrefix.value
    const relKey = rootPrefix && key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key
    const parts = relKey.split('/').filter(Boolean)

    // Folder path = all but last segment
    const fileNameFromKey = parts.length ? parts[parts.length - 1] : (file?.name || key)
    const folderParts = parts.slice(0, -1)
    const folderPath = folderParts.join('/')
    ensure(folderPath).files.push({
      ...file,
      name: file?.name || fileNameFromKey
    })

    // Build folder hierarchy
    for (let i = 0; i < folderParts.length; i++) {
      const parent = folderParts.slice(0, i).join('/')
      const child = folderParts[i]
      ensure(parent).folders.add(child)
      ensure(parent + (parent ? '/' : '') + child)
    }
  }

  return index
})

const currentFolderNode = computed(() => folderIndex.value.get(currentFolder.value) || { folders: new Set(), files: [] })

const currentFolders = computed(() => {
  if (!hasFolderNavigation.value) return []
  // When global filters are active, show matching files across all folders.
  // Showing the folder list at the same time is confusing.
  if (searchQuery.value || selectedType.value || selectedSizeRange.value) return []
  const base = currentFolder.value
  return Array.from(currentFolderNode.value.folders)
    .map(name => ({
      name,
      path: base ? `${base}/${name}` : name
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const currentFolderFiles = computed(() => {
  if (!hasFolderNavigation.value) return props.files
  return currentFolderNode.value.files
})

const filesForFiltering = computed(() => {
  // With folder navigation, the default view is scoped to the current folder.
  // But when the user applies filters, treat it as a global search/filter over
  // all files (so selecting a file type at Root can still find matches).
  if (!hasFolderNavigation.value) return props.files
  if (searchQuery.value || selectedType.value || selectedSizeRange.value) return props.files
  return currentFolderFiles.value
})

const breadcrumbs = computed(() => {
  const path = currentFolder.value
  if (!path) return []
  const parts = path.split('/').filter(Boolean)
  const out = []
  for (let i = 0; i < parts.length; i++) {
    out.push({
      name: parts[i],
      path: parts.slice(0, i + 1).join('/')
    })
  }
  return out
})

const availableTypes = computed(() => {
  const types = new Set()
  // Use the full file list to populate the dropdown even when the current folder
  // contains only subfolders (no files).
  props.files.forEach(file => {
    if (file.extension) types.add(file.extension)
  })
  return Array.from(types).sort()
})

const filteredFiles = computed(() => {
  let filtered = filesForFiltering.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(file =>
      file.name.toLowerCase().includes(query)
    )
  }

  // Type filter
  if (selectedType.value) {
    filtered = filtered.filter(file => file.extension === selectedType.value)
  }

  // Size range filter
  if (selectedSizeRange.value) {
    const [min, max] = selectedSizeRange.value.split('-').map(Number)
    filtered = filtered.filter(file => file.size >= min && file.size <= max)
  }

  return filtered
})

const totalPages = computed(() => {
  return Math.ceil(filteredFiles.value.length / itemsPerPage)
})

const paginatedFiles = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredFiles.value.slice(start, end)
})

const selectedTotalSize = computed(() => {
  return selectedFiles.value.reduce((total, file) => total + file.size, 0)
})

// Methods
const getFileIdentity = (file) => {
  const direct = file?.key ?? file?.id ?? file?.url
  if (direct !== undefined && direct !== null && String(direct).length > 0) {
    return String(direct)
  }

  const name = file?.name ?? ''
  const size = typeof file?.size === 'number' ? file.size : parseInt(file?.size || 0, 10)
  const lastModified = file?.lastModified ?? ''
  return `${name}|${size}|${lastModified}`
}

const getFileFolderPath = (file) => {
  // Only meaningful for path-like providers (S3). Google Drive items generally
  // don't have a stable folder path in our current analysis results.
  if (!hasFolderNavigation.value) return ''
  const key = typeof file?.key === 'string' ? file.key : ''
  if (!key) return ''

  const rootPrefix = normalizedRootPrefix.value
  const relKey = rootPrefix && key.startsWith(rootPrefix) ? key.slice(rootPrefix.length) : key

  const parts = relKey.split('/').filter(Boolean)
  if (parts.length <= 1) return 'Root'
  return parts.slice(0, -1).join('/')
}

const isSelected = (file) => {
  const id = getFileIdentity(file)
  return selectedFiles.value.some(f => getFileIdentity(f) === id)
}

const toggleFile = (file) => {
  const id = getFileIdentity(file)
  const index = selectedFiles.value.findIndex(f => getFileIdentity(f) === id)
  if (index >= 0) {
    selectedFiles.value.splice(index, 1)
  } else {
    selectedFiles.value.push(file)
  }
}

const goToFolder = (path) => {
  if (!hasFolderNavigation.value) return
  currentFolder.value = path || ''
  currentPage.value = 1
  // Reset filters when navigating to reduce confusion
  searchQuery.value = ''
  selectedType.value = ''
  selectedSizeRange.value = ''
}

const goUpFolder = () => {
  if (!currentFolder.value) return
  const parts = currentFolder.value.split('/').filter(Boolean)
  parts.pop()
  goToFolder(parts.join('/'))
}

const selectAll = () => {
  selectedFiles.value = [...filteredFiles.value]
}

const clearSelection = () => {
  selectedFiles.value = []
}

const handleCancel = () => {
  selectedFiles.value = []
  searchQuery.value = ''
  selectedType.value = ''
  selectedSizeRange.value = ''
  currentPage.value = 1
  currentFolder.value = ''
  emit('close')
}

const handleConfirm = () => {
  if (selectedFiles.value.length > 0) {
    emit('confirm', selectedFiles.value)
    handleCancel()
  }
}

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

const formatDate = (date) => {
  if (!date) return ''
  return new Date(date).toLocaleDateString()
}

// Reset page when filters change
watch([searchQuery, selectedType, selectedSizeRange], () => {
  currentPage.value = 1
})

// Reset state when modal opens
watch(() => props.show, (newVal) => {
  if (!newVal) {
    selectedFiles.value = []
    searchQuery.value = ''
    selectedType.value = ''
    selectedSizeRange.value = ''
    currentPage.value = 1
    currentFolder.value = ''
  }
})
</script>

<style scoped lang="scss" src="@/scss/components/modals/FileSelector.scss"></style>
