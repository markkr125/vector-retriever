<template>
  <div class="upload-modal-overlay">
    <div class="upload-modal card">
      <div class="modal-header">
        <h2>Add New Document</h2>
        <button @click="close" class="close-btn">&times;</button>
      </div>

      <div class="modal-body">
        <form @submit.prevent="handleSubmit">
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
            <span class="hint">Include .txt extension</span>
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
import { computed, ref } from 'vue'
import api from '../api'

const emit = defineEmits(['close', 'success'])

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
  return document.value.filename.trim() && document.value.content.trim()
})

const close = () => {
  emit('close')
}

const handleSubmit = async () => {
  uploading.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    // Prepare metadata
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
</style>
