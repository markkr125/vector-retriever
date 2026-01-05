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

        <!-- Error Message -->
        <div v-if="errorMessage" class="error-message">
          ❌ {{ errorMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../api'

const emit = defineEmits(['close', 'success', 'job-started'])

const uploadMethod = ref('file')
const selectedFiles = ref([])
const fileInput = ref(null)
const maxFileSizeMB = ref(10) // Default value
const categorizationEnabled = ref(false)
const visionEnabled = ref(false)
const supportedImageTypes = ref([])
const acceptFileTypes = ref('.txt,.json,.pdf,.doc,.docx')
const autoCategorize = ref(false)

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
  } else {
    return document.value.filename.trim() && document.value.content.trim()
  }
})

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

const fetchConfig = async () => {
  try {
    const response = await api.get('/config')
    maxFileSizeMB.value = response.data.maxFileSizeMB
    categorizationEnabled.value = response.data.categorizationEnabled
    visionEnabled.value = response.data.visionEnabled || false
    supportedImageTypes.value = response.data.supportedImageTypes || []
    
    // Build accept file types dynamically
    let baseTypes = '.txt,.json,.pdf,.doc,.docx'
    if (visionEnabled.value && supportedImageTypes.value.length > 0) {
      baseTypes += ',' + supportedImageTypes.value.join(',')
    }
    acceptFileTypes.value = baseTypes
    
    // Default to checked if enabled
    if (categorizationEnabled.value) {
      autoCategorize.value = true
    }
  } catch (error) {
    console.error('Failed to fetch config:', error)
    // Keep default values
  }
}

onMounted(() => {
  fetchConfig()
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

<style scoped src="@/css/UploadModal.css"></style>
