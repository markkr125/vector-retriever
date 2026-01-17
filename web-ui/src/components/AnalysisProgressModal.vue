<template>
  <div v-if="show" class="analysis-modal-overlay" @click.self="handleClose">
    <div class="analysis-modal">
      <div class="analysis-header">
        <h2>📊 Analyzing {{ providerName }} Folder</h2>
        <button class="close-btn" @click="handleClose" title="Close">&times;</button>
      </div>

      <div class="analysis-body">
        <!-- Progress Bar -->
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <p class="progress-text">Discovering files...</p>
        </div>

        <!-- Live Statistics -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">📄</div>
            <div class="stat-content">
              <div class="stat-label">Files Discovered</div>
              <div class="stat-value">{{ animatedFilesCount }}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">💾</div>
            <div class="stat-content">
              <div class="stat-label">Total Size</div>
              <div class="stat-value">{{ formatBytes(job.totalSize) }}</div>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon">📑</div>
            <div class="stat-content">
              <div class="stat-label">Pages Processed</div>
              <div class="stat-value">{{ job.pagesProcessed }}</div>
            </div>
          </div>
        </div>

        <!-- File Types Breakdown -->
        <div v-if="Object.keys(job.fileTypes).length > 0" class="file-types-section">
          <h3>File Types:</h3>
          <div class="file-types-list">
            <div
              v-for="[ext, count] in sortedFileTypes"
              :key="ext"
              class="file-type-item"
            >
              <span class="file-type-icon">{{ getFileIcon(ext) }}</span>
              <span class="file-type-ext">{{ ext }}</span>
              <span class="file-type-count">{{ count }} files</span>
            </div>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="job.status === 'error'" class="error-message">
          <span class="error-icon">⚠️</span>
          <span>{{ job.error }}</span>
        </div>

        <!-- Cancelled Message -->
        <div v-if="job.status === 'cancelled'" class="cancelled-message">
          <span class="cancelled-icon">🛑</span>
          <span>Analysis cancelled</span>
        </div>

        <!-- Paused Message -->
        <div v-if="job.status === 'paused'" class="paused-message">
          <span class="paused-icon">⏸️</span>
          <span>
            Analysis paused. You can close now and continue later from where you left off.
          </span>
        </div>
      </div>

      <div class="analysis-footer">
        <div v-if="job.status === 'analyzing'" class="analysis-actions">
          <button
            @click="handlePause"
            class="pause-btn"
            :disabled="isPausing"
          >
            ⏸️ Pause & Use Current Results
          </button>
          <button
            @click="handleCancel"
            class="cancel-btn"
          >
            🛑 Cancel Analysis
          </button>
        </div>
        <button
          v-else
          @click="handleClose"
          class="close-modal-btn"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import api from '../api'

const props = defineProps({
  show: Boolean,
  jobId: String,
  provider: String
})

const emit = defineEmits(['close', 'complete', 'cancelled'])

const job = ref({
  status: 'analyzing',
  filesDiscovered: 0,
  totalSize: 0,
  fileTypes: {},
  pagesProcessed: 0,
  files: [],
  error: null
})

const animatedFilesCount = ref(0)
const isPausing = ref(false)
let pollingInterval = null

const providerName = computed(() => {
  return props.provider === 's3' ? 'S3' : 'Google Drive'
})

const sortedFileTypes = computed(() => {
  return Object.entries(job.value.fileTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10) // Show top 10 file types
})

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Get icon for file type
 */
function getFileIcon(ext) {
  const iconMap = {
    '.pdf': '📄',
    '.doc': '📝',
    '.docx': '📝',
    '.txt': '📝',
    '.jpg': '🖼️',
    '.jpeg': '🖼️',
    '.png': '🖼️',
    '.gif': '🖼️',
    '.webp': '🖼️',
    '.bmp': '🖼️',
    '.mp4': '🎥',
    '.mp3': '🎵',
    '.zip': '📦',
    '.rar': '📦',
    '.json': '📋',
    '.xml': '📋',
    '.csv': '📊',
    '.xls': '📊',
    '.xlsx': '📊'
  }
  return iconMap[ext] || '📎'
}

/**
 * Animate file count (count-up effect)
 */
function animateFilesCount(target) {
  const current = animatedFilesCount.value
  const diff = target - current
  const step = Math.ceil(diff / 10)
  
  if (diff > 0) {
    const timer = setInterval(() => {
      if (animatedFilesCount.value < target) {
        animatedFilesCount.value = Math.min(animatedFilesCount.value + step, target)
      } else {
        clearInterval(timer)
      }
    }, 30)
  } else {
    animatedFilesCount.value = target
  }
}

/**
 * Poll for analysis progress
 */
async function pollJobStatus() {
  if (!props.jobId) return

  try {
    const response = await api.get(`/cloud-import/analysis-jobs/${props.jobId}`)
    const newJob = response.data

    // Update job data
    job.value = newJob

    // Animate files count
    if (newJob.filesDiscovered !== animatedFilesCount.value) {
      animateFilesCount(newJob.filesDiscovered)
    }

    // Stop polling if job is complete
    if (newJob.status === 'completed') {
      stopPolling()
      emit('complete', {
        provider: newJob.provider,
        files: newJob.files,
        totalSize: newJob.totalSize,
        fileTypes: newJob.fileTypes
      })
    } else if (newJob.status === 'cancelled') {
      stopPolling()
      emit('cancelled')
    } else if (newJob.status === 'paused') {
      // Stop polling; parent will decide whether to resume later.
      stopPolling()
    } else if (newJob.status === 'error') {
      stopPolling()
    }
  } catch (error) {
    console.error('Error polling analysis job:', error)
    stopPolling()
    job.value.status = 'error'
    job.value.error = error.response?.data?.error || error.message || 'Failed to get analysis status'
  }
}

async function handlePause() {
  if (!props.jobId) return

  if (!confirm('Pause analysis now and use the files discovered so far? You can continue later.')) {
    return
  }

  isPausing.value = true

  try {
    await api.post(`/cloud-import/analysis-jobs/${props.jobId}/pause`)

    // Fetch job with partial file list so parent can show Folder Analysis.
    const response = await api.get(`/cloud-import/analysis-jobs/${props.jobId}?includeFiles=1`)
    job.value = response.data

    stopPolling()

    emit('complete', {
      provider: job.value.provider,
      files: job.value.files || [],
      totalSize: job.value.totalSize,
      fileTypes: job.value.fileTypes,
      paused: true
    })
  } catch (error) {
    console.error('Error pausing analysis:', error)
    alert('Failed to pause analysis: ' + (error.response?.data?.error || error.message))
  } finally {
    isPausing.value = false
  }
}

/**
 * Start polling
 */
function startPolling() {
  stopPolling() // Clear any existing interval
  pollingInterval = setInterval(pollJobStatus, 500) // Poll every 500ms
  pollJobStatus() // Immediate first poll
}

/**
 * Stop polling
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

/**
 * Cancel analysis
 */
async function handleCancel() {
  if (!props.jobId) return

  if (!confirm('Are you sure you want to cancel this analysis? Progress will be lost.')) {
    return
  }

  try {
    await api.post(`/cloud-import/analysis-jobs/${props.jobId}/cancel`)
    job.value.status = 'cancelled'
    stopPolling()
    emit('cancelled')
  } catch (error) {
    console.error('Error cancelling analysis:', error)
    alert('Failed to cancel analysis: ' + (error.response?.data?.error || error.message))
  }
}

/**
 * Close modal
 */
function handleClose() {
  stopPolling()
  emit('close')
}

// Watch for show prop changes
watch(() => props.show, (newVal) => {
  if (newVal && props.jobId) {
    startPolling()
  } else {
    stopPolling()
  }
})

// Watch for jobId changes
watch(() => props.jobId, (newVal) => {
  if (newVal && props.show) {
    // Reset state
    job.value = {
      status: 'analyzing',
      filesDiscovered: 0,
      totalSize: 0,
      fileTypes: {},
      pagesProcessed: 0,
      files: [],
      error: null
    }
    animatedFilesCount.value = 0
    startPolling()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped lang="scss" src="@/scss/components/AnalysisProgressModal.scss"></style>
