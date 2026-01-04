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

<style scoped>
.upload-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.upload-modal {
  max-width: 700px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--background);
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1.25rem;
}

.label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.metadata-section {
  margin: 1.5rem 0;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.metadata-fields {
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-color);
}

.modal-actions button {
  flex: 1;
}

.success-message {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid var(--secondary-color);
  border-radius: 8px;
  color: var(--secondary-color);
  font-weight: 500;
}

.error-message {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--error);
  border-radius: 8px;
  color: var(--error);
  font-weight: 500;
}

/* Upload Method Selector - Tab Style */
.upload-method-selector {
  display: flex;
  gap: 0;
  background: var(--background);
  border-radius: 10px;
  padding: 4px;
  border: 1px solid var(--border-color);
}

.method-btn {
  flex: 1;
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.method-btn:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(79, 70, 229, 0.05);
}

.method-btn.active {
  background: var(--primary-color);
  color: white;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
}

.method-btn:active {
  transform: scale(0.98);
}

/* File List Styles */
.files-list {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
  padding: 0.5rem;
  background: var(--background);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;
}

.file-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
}

.file-item-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.file-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0 0 0.25rem 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0;
}

.remove-file-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.25rem;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.remove-file-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--error);
}

.auto-categorize-group {
  padding: 1rem;
  background: rgba(79, 70, 229, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(79, 70, 229, 0.1);
  margin-bottom: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.checkbox-label.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-label input[type="checkbox"] {
  margin-top: 0.2rem;
  cursor: pointer;
}

.checkbox-label.disabled input[type="checkbox"] {
  cursor: not-allowed;
}

.checkbox-text {
  flex: 1;
  font-size: 0.95rem;
  line-height: 1.5;
}

.disabled-hint {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.auto-categorize-group .hint {
  margin-left: 1.75rem;
  margin-top: 0.5rem;
}
</style>
