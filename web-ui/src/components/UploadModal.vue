<template>
  <div class="upload-modal-overlay">
    <div class="upload-modal card">
      <div class="modal-header">
        <h2>Add New Document</h2>
        <button @click="close" class="close-btn">&times;</button>
      </div>

      <div class="modal-body">
        <form @submit.prevent="handleSubmit">
          <!-- Upload Method Selector -->
          <div class="form-group">
            <label class="label">Upload Method</label>
            <div class="upload-method-selector">
              <button 
                type="button"
                @click="uploadMethod = 'file'"
                :class="['method-btn', { active: uploadMethod === 'file' }]"
              >
                📁 Upload File
              </button>
              <button 
                type="button"
                @click="uploadMethod = 'cloud'"
                :class="['method-btn', { active: uploadMethod === 'cloud' }]"
              >
                ☁️ Cloud Import
              </button>
              <button 
                type="button"
                @click="uploadMethod = 'text'"
                :class="['method-btn', { active: uploadMethod === 'text' }]"
              >
                📝 Paste Text
              </button>
            </div>
          </div>

          <!-- File Upload Section -->
          <div v-if="uploadMethod === 'file'" class="file-upload-section">
            <div class="form-group">
              <label class="label">Select Files *</label>
              <div class="file-input-wrapper">
                <input 
                  type="file"
                  ref="fileInput"
                  @change="handleFileSelect"
                  :accept="acceptFileTypes"
                  class="file-input"
                  id="file-upload"
                  multiple
                >
                <label for="file-upload" class="file-input-label">
                  <span v-if="selectedFiles.length === 0">📎 Choose files...</span>
                  <span v-else>{{ selectedFiles.length }} file{{ selectedFiles.length > 1 ? 's' : '' }} selected</span>
                </label>
              </div>
              <span class="hint">Supported: {{ acceptFileTypes }} (max {{ maxFileSizeMB }}MB each) - Select multiple files</span>
            </div>

            <div v-if="selectedFiles.length > 0" class="files-list">
              <div v-for="(file, index) in selectedFiles" :key="index" class="file-item">
                <div class="file-item-info">
                  <span class="file-icon">📄</span>
                  <div class="file-details">
                    <p class="file-name">{{ file.name }}</p>
                    <p class="file-meta">{{ formatFileSize(file.size) }} • {{ file.type || 'Unknown' }}</p>
                  </div>
                </div>
                <button 
                  type="button" 
                  @click="removeFile(index)" 
                  class="remove-file-btn"
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <!-- Cloud Import Section -->
          <div v-else-if="uploadMethod === 'cloud'" class="cloud-import-section">
            <!-- Provider Selection (conditionally shown) -->
            <div v-if="cloudProviders.gdrive?.enabled" class="form-group">
              <label class="label">Cloud Provider</label>
              <div class="provider-selector">
                <button 
                  type="button"
                  @click="cloudProvider = 's3'"
                  :class="['provider-btn', { active: cloudProvider === 's3' }]"
                >
                  <span class="provider-icon">🪣</span>
                  AWS S3
                </button>
                <button 
                  type="button"
                  @click="cloudProvider = 'gdrive'"
                  :class="['provider-btn', { active: cloudProvider === 'gdrive' }]"
                  :disabled="!cloudProviders.gdrive?.enabled"
                >
                  <span class="provider-icon">📁</span>
                  Google Drive
                  <span v-if="!cloudProviders.gdrive?.enabled" class="provider-disabled">🔒</span>
                </button>
              </div>
            </div>

            <!-- URL Input -->
            <div class="form-group">
              <label class="label">
                <span v-if="cloudProvider === 's3'">S3 Bucket URL *</span>
                <span v-else>Google Drive Folder URL *</span>
              </label>
              <input 
                v-model="cloudUrl"
                type="text"
                class="input"
                :placeholder="cloudProvider === 's3' ? 'https://bucket-name.s3.amazonaws.com/folder/' : 'https://drive.google.com/drive/folders/FOLDER_ID'"
                @input="clearAnalysis"
              >
              <span class="hint" v-if="cloudProvider === 's3'">
                Supported: https://bucket.s3.amazonaws.com/folder/ or s3://bucket/folder/
              </span>
              <span class="hint" v-else>
                Public shared folder link from Google Drive
              </span>
            </div>

            <!-- Analyze Button -->
            <button 
              type="button"
              @click="analyzeFolder"
              :disabled="!cloudUrl"
              class="btn btn-primary"
              style="width: 100%; margin-bottom: 1rem;"
            >
              <span v-if="resumableAnalysis && resumableAnalysis.status === 'paused'">▶️ Continue Analysis</span>
              <span v-else>🔍 Analyze Folder</span>
            </button>

            <!-- Analysis Results -->
            <div v-if="folderAnalysis" class="analysis-results">
              <div class="analysis-header">
                <h3>📊 Folder Analysis</h3>
                <button
                  type="button"
                  class="btn btn-secondary btn-small btn-clear-analysis"
                  @click="confirmClearAnalysis"
                >
                  🧹 Clear Analysis
                </button>
              </div>
              
              <div class="analysis-stats">
                <div class="stat-item">
                  <span class="stat-label">Total Files:</span>
                  <span class="stat-value">{{ folderAnalysis.totalFiles }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Total Size:</span>
                  <span class="stat-value">{{ formatFileSize(folderAnalysis.totalSize) }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">File Types:</span>
                  <span class="stat-value">{{ Object.keys(folderAnalysis.fileTypes).length }} types</span>
                </div>
              </div>

              <!-- File Types Breakdown -->
              <div class="file-types-breakdown">
                <h4>File Types:</h4>
                <div class="type-list">
                  <div v-for="(count, type) in folderAnalysis.fileTypes" :key="type" class="type-item">
                    <span class="type-name">{{ type || 'unknown' }}</span>
                    <span class="type-count">{{ count }}</span>
                  </div>
                </div>
              </div>

              <!-- Import Options -->
              <div class="import-options">
                <h4>Import Options:</h4>
                
                <!-- Error Message for Cloud Import -->
                <div v-if="cloudErrorMessage || errorMessage" class="error-message" style="margin-bottom: 1rem;">
                  <button 
                    type="button" 
                    @click="cloudErrorMessage = ''; errorMessage = ''" 
                    class="error-close-btn"
                    aria-label="Close error"
                  >
                    ✕
                  </button>
                  <span>❌ {{ cloudErrorMessage || errorMessage }}</span>
                </div>
                
                <div class="option-group">
                  <label class="radio-label">
                    <input 
                      type="radio"
                      v-model="importOption"
                      value="all"
                    >
                    <span>Import all {{ folderAnalysis.totalFiles }} files</span>
                  </label>
                </div>

                <div class="option-group">
                  <label class="radio-label">
                    <input 
                      type="radio"
                      v-model="importOption"
                      value="first"
                    >
                    <span>Import first</span>
                  </label>
                  <input 
                    v-model.number="importLimit"
                    type="number"
                    min="1"
                    :max="folderAnalysis.totalFiles"
                    class="input-small"
                    :disabled="importOption !== 'first'"
                  >
                  <span>files (for testing)</span>
                </div>

                <div class="option-group">
                  <label class="radio-label">
                    <input 
                      type="radio"
                      v-model="importOption"
                      value="select"
                    >
                    <span>Select specific files</span>
                  </label>
                  <button 
                    type="button"
                    @click="showFileSelector = true"
                    :disabled="importOption !== 'select'"
                    class="btn btn-secondary btn-small"
                  >
                    Choose Files ({{ selectedCloudFiles.length }} selected)
                  </button>
                </div>
              </div>

              <!-- Auto-categorization for cloud imports -->
              <div class="form-group auto-categorize-group">
                <label class="checkbox-label" :class="{ disabled: !categorizationEnabled }">
                  <input 
                    type="checkbox"
                    v-model="autoCategorize"
                    :disabled="!categorizationEnabled"
                  >
                  <span class="checkbox-text">
                    🤖 Auto-categorize using AI
                    <span v-if="!categorizationEnabled" class="disabled-hint">(disabled - set CATEGORIZATION_MODEL in .env)</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <!-- Text Input Section -->
          <div v-else>
            <!-- Filename -->
            <div class="form-group">
              <label class="label">Filename *</label>
              <input 
                v-model="document.filename"
                type="text"
                class="input"
                placeholder="my_document.txt"
                required
              >
              <span class="hint">Include file extension</span>
            </div>

            <!-- Content -->
            <div class="form-group">
              <label class="label">Content *</label>
              <textarea 
                v-model="document.content"
                class="textarea"
                rows="10"
                placeholder="Enter document content here...

You can include structured metadata at the top:
Category: hotel
Location: Paris
Tags: luxury, spa
Price: 450.00
Rating: 4.8
Coordinates: 48.8566, 2.3522

Or just plain text for unstructured documents."
                required
              ></textarea>
              <span class="hint">{{ document.content.split(/\s+/).length }} words, {{ document.content.length }} characters</span>
            </div>
          </div>

          <!-- Auto-categorization (always visible for file uploads) -->
          <div v-if="uploadMethod === 'file'" class="form-group auto-categorize-group">
            <label class="checkbox-label" :class="{ disabled: !categorizationEnabled }">
              <input 
                type="checkbox"
                v-model="autoCategorize"
                :disabled="!categorizationEnabled"
              >
              <span class="checkbox-text">
                🤖 Auto-categorize using AI
                <span v-if="!categorizationEnabled" class="disabled-hint">(disabled - set CATEGORIZATION_MODEL in .env)</span>
              </span>
            </label>
            <span v-if="categorizationEnabled" class="hint">Automatically extract category, location, tags, price, and more using Ollama</span>
          </div>

          <!-- Optional Metadata -->
          <div class="metadata-section">
            <button 
              type="button"
              @click="showMetadata = !showMetadata"
              class="btn btn-secondary"
              style="width: 100%; margin-bottom: 1rem;"
            >
              {{ showMetadata ? '▼' : '▶' }} Optional Metadata
            </button>

            <div v-if="showMetadata" class="metadata-fields">
              <div class="form-row">
                <div class="form-group">
                  <label class="label">Category</label>
                  <input 
                    v-model="document.metadata.category"
                    type="text"
                    class="input"
                    placeholder="e.g., hotel, restaurant"
                  >
                </div>
                <div class="form-group">
                  <label class="label">Location</label>
                  <input 
                    v-model="document.metadata.location"
                    type="text"
                    class="input"
                    placeholder="e.g., Paris"
                  >
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="label">Price</label>
                  <input 
                    v-model.number="document.metadata.price"
                    type="number"
                    step="0.01"
                    class="input"
                    placeholder="e.g., 99.99"
                  >
                </div>
                <div class="form-group">
                  <label class="label">Rating</label>
                  <input 
                    v-model.number="document.metadata.rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    class="input"
                    placeholder="e.g., 4.5"
                  >
                </div>
              </div>

              <div class="form-group">
                <label class="label">Tags (comma-separated)</label>
                <input 
                  v-model="document.metadata.tagsInput"
                  type="text"
                  class="input"
                  placeholder="e.g., luxury, spa, romantic"
                >
              </div>

              <div class="form-group">
                <label class="label">Status</label>
                <select v-model="document.metadata.status" class="select">
                  <option value="">Not specified</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="label">Latitude</label>
                  <input 
                    v-model.number="document.metadata.lat"
                    type="number"
                    step="0.0001"
                    class="input"
                    placeholder="e.g., 48.8566"
                  >
                </div>
                <div class="form-group">
                  <label class="label">Longitude</label>
                  <input 
                    v-model.number="document.metadata.lon"
                    type="number"
                    step="0.0001"
                    class="input"
                    placeholder="e.g., 2.3522"
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Submit -->
          <div class="modal-actions">
            <button 
              type="button"
              @click="close"
              class="btn btn-secondary"
            >
              Cancel
            </button>
            <button 
              type="submit"
              :disabled="uploading || !canSubmit"
              class="btn btn-primary"
            >
              <span v-if="uploading" class="loading"></span>
              <span v-else>📄 Add Document</span>
            </button>
          </div>
        </form>

        <!-- Success Message -->
        <div v-if="successMessage" class="success-message">
          ✅ {{ successMessage }}
        </div>
      </div>
    </div>

    <!-- File Selector Modal -->
    <FileSelector
      :show="showFileSelector"
      :provider="cloudProvider"
      :rootPrefix="cloudProvider === 's3' ? getS3PrefixFromUrl(cloudUrl) : ''"
      :files="folderAnalysis?.files || []"
      @close="showFileSelector = false"
      @confirm="handleFileSelection"
    />

    <!-- Analysis Progress Modal -->
    <AnalysisProgressModal
      :show="showAnalysisProgress"
      :jobId="analysisJobId"
      :provider="cloudProvider"
      @close="handleAnalysisClose"
      @complete="handleAnalysisComplete"
      @cancelled="handleAnalysisCancelled"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../api'
import AnalysisProgressModal from './AnalysisProgressModal.vue'
import FileSelector from './FileSelector.vue'

const emit = defineEmits(['close', 'success', 'job-started'])

const uploadMethod = ref('file')
const selectedFiles = ref([])
const fileInput = ref(null)
const maxFileSizeMB = ref(10) // Default value
const categorizationEnabled = ref(false)
const visionEnabled = ref(false)
const supportedImageTypes = ref([])
const acceptFileTypes = ref('.txt,.json,.pdf,.docx,.csv,.xlsx,.pptx,.rtf')
const autoCategorize = ref(false)

// Cloud import state
const cloudProvider = ref('s3')
const cloudProviders = ref({
  s3: { enabled: true, requiresAuth: false },
  gdrive: { enabled: false, requiresAuth: true }
})
const cloudUrl = ref('')
const showAnalysisProgress = ref(false)
const analysisJobId = ref(null)
const folderAnalysis = ref(null)
const resumableAnalysis = ref(null)
const importOption = ref('first')
const importLimit = ref(10)
const maxCloudImportDocs = ref(1000)
const maxCloudImportSizeMB = ref(500)
const selectedCloudFiles = ref([])
const showFileSelector = ref(false)
const cloudErrorMessage = ref('')

const document = ref({
  filename: '',
  content: '',
  metadata: {
    category: '',
    location: '',
    price: null,
    rating: null,
    tagsInput: '',
    status: '',
    lat: null,
    lon: null
  }
})

const showMetadata = ref(false)
const uploading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

const canSubmit = computed(() => {
  if (uploadMethod.value === 'file') {
    return selectedFiles.value.length > 0
  } else if (uploadMethod.value === 'cloud') {
    return folderAnalysis.value && (
      importOption.value === 'all' ||
      (importOption.value === 'first' && importLimit.value > 0) ||
      (importOption.value === 'select' && selectedCloudFiles.value.length > 0)
    )
  } else {
    return document.value.filename.trim() && document.value.content.trim()
  }
})

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

const clearAnalysis = () => {
  folderAnalysis.value = null
  selectedCloudFiles.value = []
  cloudErrorMessage.value = ''
  resumableAnalysis.value = null
  analysisJobId.value = null
  showAnalysisProgress.value = false
  showFileSelector.value = false
  importOption.value = 'first'
  importLimit.value = 10
}

const confirmClearAnalysis = () => {
  if (!folderAnalysis.value && !resumableAnalysis.value) return
  const ok = confirm(
    'Clear the folder analysis results? This will reset file selection and import options.'
  )
  if (!ok) return
  clearAnalysis()
}

let resumableLookupTimer = null
const lookupResumableAnalysis = () => {
  if (resumableLookupTimer) {
    clearTimeout(resumableLookupTimer)
    resumableLookupTimer = null
  }

  if (!cloudUrl.value || !cloudProvider.value) {
    resumableAnalysis.value = null
    return
  }

  // Debounce to avoid spamming while typing.
  resumableLookupTimer = setTimeout(async () => {
    try {
      const response = await api.get('/cloud-import/analysis-jobs/by-url', {
        params: { provider: cloudProvider.value, url: cloudUrl.value }
      })
      resumableAnalysis.value = response.data?.found ? response.data : null
    } catch (error) {
      resumableAnalysis.value = null
    }
  }, 350)
}

const analyzeFolder = async () => {
  cloudErrorMessage.value = ''
  folderAnalysis.value = null

  try {
    // Start analysis job
    const response = await api.post('/cloud-import/analyze', {
      provider: cloudProvider.value,
      url: cloudUrl.value
    })

    // Store job ID and show progress modal
    analysisJobId.value = response.data.jobId
    showAnalysisProgress.value = true
    resumableAnalysis.value = null
  } catch (error) {
    console.error('Folder analysis error:', error)
    cloudErrorMessage.value = error.response?.data?.error || error.message || 'Failed to start analysis'
  }
}

const handleAnalysisComplete = (result) => {
  console.log('Analysis complete:', result)
  
  // Store analysis results
  folderAnalysis.value = {
    provider: result.provider,
    totalFiles: result.files.length,
    totalSize: result.totalSize,
    fileTypes: result.fileTypes,
    files: result.files
  }
  
  importOption.value = 'first' // Default to first files
  showAnalysisProgress.value = false

  // If the modal completed due to pause, mark resumable.
  if (result.paused) {
    resumableAnalysis.value = { found: true, jobId: analysisJobId.value, status: 'paused' }
  }
}

const handleAnalysisClose = () => {
  showAnalysisProgress.value = false
}

const handleAnalysisCancelled = () => {
  showAnalysisProgress.value = false
  cloudErrorMessage.value = 'Analysis was cancelled'
  resumableAnalysis.value = null
}

const handleFileSelection = (files) => {
  selectedCloudFiles.value = files
  showFileSelector.value = false
}

const fetchConfig = async () => {
  try {
    const response = await api.get('/config')
    maxFileSizeMB.value = response.data.maxFileSizeMB
    maxCloudImportDocs.value = response.data.maxCloudImportDocs || 1000
    maxCloudImportSizeMB.value = response.data.maxCloudImportSizeMB || 500
    categorizationEnabled.value = response.data.categorizationEnabled
    visionEnabled.value = response.data.visionEnabled || false
    supportedImageTypes.value = response.data.supportedImageTypes || []
    
    // Build accept file types from backend config
    if (response.data.supportedUploadFileTypes) {
      acceptFileTypes.value = response.data.supportedUploadFileTypes.join(',')
    } else {
      // Fallback to default
      let baseTypes = '.txt,.json,.pdf,.docx,.csv,.xlsx,.pptx,.rtf'
      if (visionEnabled.value && supportedImageTypes.value.length > 0) {
        baseTypes += ',' + supportedImageTypes.value.join(',')
      }
      acceptFileTypes.value = baseTypes
    }
    
    // Default to checked if enabled
    if (categorizationEnabled.value) {
      autoCategorize.value = true
    }

    // Fetch cloud providers availability
    try {
      const providersResponse = await api.get('/cloud-import/providers')
      cloudProviders.value = providersResponse.data
    } catch (err) {
      console.warn('Cloud import not available:', err)
      // Cloud import endpoints not available yet
    }
  } catch (error) {
    console.error('Failed to fetch config:', error)
    // Keep default values
  }
}

const getS3PrefixFromUrl = (url) => {
  if (!url || typeof url !== 'string') return ''

  // s3://bucket/prefix
  if (url.startsWith('s3://')) {
    const match = url.match(/^s3:\/\/[^\/]+\/(.*)$/)
    return match && match[1] ? match[1] : ''
  }

  // https://bucket.s3.amazonaws.com/prefix
  const match = url.match(/^https?:\/\/[^/]+\.s3(?:[.-][^.]*)?\.amazonaws\.com\/(.*)$/)
  return match && match[1] ? match[1] : ''
}

onMounted(() => {
  fetchConfig()
})

// When URL/provider changes, check if a paused job exists to allow "Continue Analysis".
watch([cloudUrl, cloudProvider], () => {
  lookupResumableAnalysis()
})

const handleFileSelect = (event) => {
  const files = Array.from(event.target.files)
  
  // Validate file sizes
  const maxBytes = maxFileSizeMB.value * 1024 * 1024
  const invalidFiles = files.filter(file => file.size > maxBytes)
  if (invalidFiles.length > 0) {
    errorMessage.value = `${invalidFiles.length} file(s) exceed ${maxFileSizeMB.value}MB limit`
    return
  }
  
  selectedFiles.value = files
  errorMessage.value = ''
}

const removeFile = (index) => {
  selectedFiles.value.splice(index, 1)
}

const close = () => {
  emit('close')
}

const handleSubmit = async () => {
  uploading.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    if (uploadMethod.value === 'file') {
      // File upload mode with job system
      if (selectedFiles.value.length === 0) {
        errorMessage.value = 'Please select at least one file'
        uploading.value = false
        return
      }

      // Prepare metadata once
      const metadata = {}
      if (document.value.metadata.category) metadata.category = document.value.metadata.category
      if (document.value.metadata.location) metadata.location = document.value.metadata.location
      if (document.value.metadata.price) metadata.price = document.value.metadata.price
      if (document.value.metadata.rating) metadata.rating = document.value.metadata.rating
      if (document.value.metadata.status) metadata.status = document.value.metadata.status
      
      if (document.value.metadata.tagsInput) {
        metadata.tags = document.value.metadata.tagsInput
          .split(',')
          .map(t => t.trim())
          .filter(t => t)
      }
      
      if (document.value.metadata.lat && document.value.metadata.lon) {
        metadata.coordinates = {
          lat: document.value.metadata.lat,
          lon: document.value.metadata.lon
        }
      }

      // Create FormData with all files
      const formData = new FormData()
      for (const file of selectedFiles.value) {
        formData.append('files', file)
      }

      // Add auto-categorization flag
      if (categorizationEnabled.value && autoCategorize.value) {
        formData.append('auto_categorize', 'true')
      }

      if (Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata))
      }

      // Upload and get job ID
      const response = await api.post('/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      // Emit job started event with job ID
      emit('job-started', response.data.jobId)
      
      // Close this modal (progress modal will open)
      close()

    } else if (uploadMethod.value === 'cloud') {
      // Cloud import mode
      if (!folderAnalysis.value) {
        errorMessage.value = 'Please analyze the folder first'
        uploading.value = false
        return
      }

      // Calculate size and count
      let filesToImport = []
      let totalSizeMB = 0
      let fileCount = 0

      if (importOption.value === 'all') {
        filesToImport = folderAnalysis.value.files
        totalSizeMB = folderAnalysis.value.totalSize / (1024 * 1024)
        fileCount = folderAnalysis.value.totalFiles
      } else if (importOption.value === 'first') {
        filesToImport = folderAnalysis.value.files.slice(0, importLimit.value)
        totalSizeMB = filesToImport.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024)
        fileCount = filesToImport.length
      } else if (importOption.value === 'select') {
        filesToImport = selectedCloudFiles.value
        totalSizeMB = filesToImport.reduce((sum, f) => sum + (f.size || 0), 0) / (1024 * 1024)
        fileCount = filesToImport.length
      }

      // Check size limit
      if (totalSizeMB > maxCloudImportSizeMB.value) {
        cloudErrorMessage.value = `Total size (${formatBytes(totalSizeMB * 1024 * 1024)}) exceeds maximum allowed (${maxCloudImportSizeMB.value} MB). Please reduce the number of files.`
        uploading.value = false
        return
      }

      // Check document count and cap if needed (don't fail, just cap)
      let cappedFiles = filesToImport
      let cappedCount = fileCount
      if (fileCount > maxCloudImportDocs.value) {
        cappedFiles = filesToImport.slice(0, maxCloudImportDocs.value)
        cappedCount = maxCloudImportDocs.value
      }

      // Confirm for "import all" option
      if (importOption.value === 'all') {
        const sizeStr = totalSizeMB >= 1024 
          ? `${(totalSizeMB / 1024).toFixed(2)} GB` 
          : `${totalSizeMB.toFixed(2)} MB`
        
        const countWarning = cappedCount < fileCount 
          ? ` (capped at ${cappedCount} documents due to limit)` 
          : ''
        
        const confirmed = window.confirm(
          `This will import ${sizeStr} of data and ${cappedCount} documents${countWarning}. Are you sure you wish to proceed?`
        )
        
        if (!confirmed) {
          uploading.value = false
          return
        }
      }

      // Batch upload to avoid PayloadTooLarge error
      const BATCH_SIZE = 50 // Upload 50 files at a time
      const batches = []
      for (let i = 0; i < cappedFiles.length; i += BATCH_SIZE) {
        batches.push(cappedFiles.slice(i, i + BATCH_SIZE))
      }

      // If single batch, use simple import
      if (batches.length === 1) {
        const importRequest = {
          provider: cloudProvider.value,
          url: cloudUrl.value,
          autoCategorize: categorizationEnabled.value && autoCategorize.value,
          files: cappedFiles
        }

        const response = await api.post('/cloud-import/import', importRequest)
        emit('job-started', response.data.jobId)
        close()
      } else {
        // Multiple batches - submit first batch and get jobId
        const firstRequest = {
          provider: cloudProvider.value,
          url: cloudUrl.value,
          autoCategorize: categorizationEnabled.value && autoCategorize.value,
          files: batches[0]
        }

        const firstResponse = await api.post('/cloud-import/import', firstRequest)
        const jobId = firstResponse.data.jobId

        emit('job-started', jobId)
        close()

        // Append remaining batches sequentially (avoids starting multiple server workers at once)
        ;(async () => {
          for (let i = 1; i < batches.length; i++) {
            const batchRequest = {
              provider: cloudProvider.value,
              url: cloudUrl.value,
              autoCategorize: categorizationEnabled.value && autoCategorize.value,
              files: batches[i],
              appendToJob: jobId
            }

            try {
              await api.post('/cloud-import/import', batchRequest)
            } catch (err) {
              console.error(`Batch ${i + 1} failed:`, err)
            }
          }
        })()
      }

    } else {
      // Text input mode (original functionality)
      const metadata = {}
      
      if (document.value.metadata.category) metadata.category = document.value.metadata.category
      if (document.value.metadata.location) metadata.location = document.value.metadata.location
      if (document.value.metadata.price) metadata.price = document.value.metadata.price
      if (document.value.metadata.rating) metadata.rating = document.value.metadata.rating
      if (document.value.metadata.status) metadata.status = document.value.metadata.status
      
      if (document.value.metadata.tagsInput) {
        metadata.tags = document.value.metadata.tagsInput
          .split(',')
          .map(t => t.trim())
          .filter(t => t)
      }
      
      if (document.value.metadata.lat && document.value.metadata.lon) {
        metadata.coordinates = {
          lat: document.value.metadata.lat,
          lon: document.value.metadata.lon
        }
      }

      // Submit to API
      const response = await api.post('/documents/add', {
        filename: document.value.filename,
        content: document.value.content,
        metadata: metadata
      })

      successMessage.value = response.data.message
      
      // Emit success and close after delay
      setTimeout(() => {
        emit('success')
        close()
      }, 1500)
    }

  } catch (error) {
    console.error('Upload error:', error)
    errorMessage.value = error.response?.data?.error || error.message || 'Failed to add document'
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped lang="scss" src="@/scss/components/modals/UploadModal.scss"></style>
