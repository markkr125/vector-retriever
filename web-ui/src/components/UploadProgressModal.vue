<template>
  <div v-if="show" class="modal-overlay" @click.self="handleOverlayClick">
    <div class="modal-dialog">
      <div class="modal-header">
        <h2>Upload Progress</h2>
        <div class="header-actions">
          <button v-if="canStop" @click="confirmStop" class="stop-btn" title="Stop upload">
            ⏸️ Stop
          </button>
          <button @click="handleClose" class="close-btn" title="Close">
            ×
          </button>
        </div>
      </div>
      
      <div class="modal-body">
        <!-- Overall Progress -->
        <div class="progress-summary">
          <div class="progress-stats">
            <span class="stat">{{ processedFiles }}/{{ totalFiles }} files processed</span>
            <span v-if="successfulFiles > 0" class="stat success">✅ {{ successfulFiles }} successful</span>
            <span v-if="failedFiles > 0" class="stat failed">❌ {{ failedFiles }} failed</span>
          </div>
          
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              :style="{ width: progressPercent + '%' }"
              :class="{ 'stopped': jobStatus === 'stopped' }"
            ></div>
          </div>
          
          <div class="progress-percent">{{ progressPercent }}%</div>
        </div>

        <!-- Status Message -->
        <div v-if="statusMessage" class="status-message" :class="jobStatus">
          {{ statusMessage }}
        </div>

        <!-- File List -->
        <div class="files-list">
          <div 
            v-for="(file, index) in files" 
            :key="index"
            class="file-item"
            :class="file.status"
          >
            <span class="file-icon">{{ getFileIcon(file.status) }}</span>
            <span class="file-name">{{ file.name }}</span>
            <span v-if="file.error" class="file-error" :title="file.error">{{ truncateError(file.error) }}</span>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button 
          @click="handleClose" 
          class="btn btn-secondary"
        >
          Close
        </button>
        <button 
          v-if="canStop"
          @click="confirmStop" 
          class="btn btn-warning"
        >
          Stop Upload
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { getUploadJobStatus } from '../api';

export default {
  name: 'UploadProgressModal',
  props: {
    show: {
      type: Boolean,
      required: true
    },
    jobId: {
      type: String,
      required: true
    }
  },
  emits: ['close', 'stop'],
  setup(props, { emit }) {
    const jobData = ref(null);
    let pollInterval = null;

    const jobStatus = computed(() => jobData.value?.status || 'processing');
    const totalFiles = computed(() => jobData.value?.totalFiles || 0);
    const processedFiles = computed(() => jobData.value?.processedFiles || 0);
    const successfulFiles = computed(() => jobData.value?.successfulFiles || 0);
    const failedFiles = computed(() => jobData.value?.failedFiles || 0);
    const files = computed(() => jobData.value?.files || []);
    
    const progressPercent = computed(() => {
      if (totalFiles.value === 0) return 0;
      return Math.round((processedFiles.value / totalFiles.value) * 100);
    });

    const isComplete = computed(() => {
      return jobStatus.value === 'completed' || jobStatus.value === 'stopped';
    });

    const canStop = computed(() => {
      return jobStatus.value === 'processing';
    });

    const statusMessage = computed(() => {
      if (jobStatus.value === 'completed') {
        if (failedFiles.value === 0) {
          return `✅ All ${totalFiles.value} files uploaded successfully!`;
        } else {
          return `⚠️ Upload completed with ${failedFiles.value} error(s)`;
        }
      } else if (jobStatus.value === 'stopped') {
        return `⏸️ Upload stopped. ${successfulFiles.value} files uploaded before stopping.`;
      } else if (jobData.value?.currentFile) {
        return `Processing: ${jobData.value.currentFile}`;
      }
      return 'Processing...';
    });

    function getFileIcon(status) {
      switch (status) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'processing': return '⏳';
        case 'pending': return '⏱️';
        default: return '⏱️';
      }
    }

    function truncateError(error) {
      if (!error) return '';
      if (error.length <= 60) return error;
      return error.substring(0, 60) + '...';
    }

    async function pollJobStatus() {
      if (!props.jobId) return;
      
      try {
        const data = await getUploadJobStatus(props.jobId);
        jobData.value = data;
        
        // Stop polling when complete
        if (data.status === 'completed' || data.status === 'stopped') {
          stopPolling();
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }

    function startPolling() {
      // Stop any existing polling first
      stopPolling();
      
      // Poll immediately
      pollJobStatus();
      // Then poll every second
      pollInterval = setInterval(pollJobStatus, 1000);
    }

    function stopPolling() {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }

    function handleClose() {
      emit('close');
    }

    function handleOverlayClick() {
      // Only allow closing if upload is complete
      if (isComplete.value) {
        handleClose();
      }
    }

    function confirmStop() {
      if (confirm('Are you sure you want to stop the upload? The current file will complete, but remaining files will be skipped.')) {
        emit('stop', props.jobId);
      }
    }

    onMounted(() => {
      if (props.show && props.jobId) {
        startPolling();
      }
    });

    onUnmounted(() => {
      stopPolling();
    });

    // Watch for prop changes - start/stop polling based on show state
    watch(() => props.show, (newShow) => {
      if (newShow && props.jobId) {
        startPolling();
      } else {
        stopPolling();
      }
    });

    // Watch for jobId changes
    watch(() => props.jobId, (newJobId, oldJobId) => {
      if (newJobId !== oldJobId) {
        stopPolling();
        if (props.show && newJobId) {
          startPolling();
        }
      }
    });

    return {
      jobStatus,
      totalFiles,
      processedFiles,
      successfulFiles,
      failedFiles,
      files,
      progressPercent,
      isComplete,
      canStop,
      statusMessage,
      getFileIcon,
      truncateError,
      handleClose,
      handleOverlayClick,
      confirmStop
    };
  }
};
</script>

<style scoped src="@/css/UploadProgressModal.css"></style>
