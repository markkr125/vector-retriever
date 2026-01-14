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
        <div v-if="statusTitle" class="status-message" :class="jobStatus">
          <div class="status-title">{{ statusTitle }}</div>
          <div v-if="statusDetail" class="status-detail">{{ statusDetail }}</div>
        </div>

        <!-- File List (virtualized) -->
        <div ref="listEl" class="files-list" @scroll="onFilesScroll">
          <div :style="{ paddingTop: visibleRange.padTop + 'px', paddingBottom: visibleRange.padBottom + 'px' }">
            <div
              v-for="row in visibleFiles"
              :key="row.index"
              class="file-item"
              :class="row.file?.status || 'pending'"
              :style="{ height: ROW_HEIGHT + 'px' }"
            >
              <span class="file-icon">{{ getFileIcon(row.file?.status || 'pending') }}</span>
              <div class="file-info">
                <div class="file-title" :title="row.file?.name || 'Loading…'">{{ row.file?.name || 'Loading…' }}</div>
                <div v-if="row.file?.bucket" class="file-subtitle" :title="row.file.bucket">{{ row.file.bucket }}</div>
                <div v-if="getRowStage(row.file)" class="file-stage">{{ getRowStage(row.file) }}</div>
                <div v-if="row.file?.error" class="file-error" :title="row.file.error">{{ row.file.error }}</div>
              </div>
            </div>
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
import { getUploadJobFiles, getUploadJobStatus } from '../api';

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
    const filesTotal = ref(0);
    const filesByIndex = ref([]);

    const listEl = ref(null);
    const listHeight = ref(0);
    const scrollTop = ref(0);

    const FILE_PAGE_SIZE = 300;
    const OVERSCAN = 10;
    const ROW_HEIGHT = 76;
    const SCROLL_FETCH_DEBOUNCE_MS = 150;

    const inFlightPages = new Set();
    let pollInterval = null;
    let scrollFetchTimer = null;
    let scrollFilesAbortController = null;
    const pendingScrollFetch = ref({ offset: 0, limit: 0 });

    const jobStatus = computed(() => jobData.value?.status || 'processing');
    const totalFiles = computed(() => jobData.value?.totalFiles || 0);
    const processedFiles = computed(() => jobData.value?.processedFiles || 0);
    const successfulFiles = computed(() => jobData.value?.successfulFiles || 0);
    const failedFiles = computed(() => jobData.value?.failedFiles || 0);
    const currentStage = computed(() => jobData.value?.currentStage || null);
    
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

    const totalRows = computed(() => filesTotal.value || 0);

    const visibleRange = computed(() => {
      const total = totalRows.value;
      if (total === 0) {
        return { start: 0, end: 0, padTop: 0, padBottom: 0 };
      }

      const viewport = Math.max(0, listHeight.value);
      const startUnclamped = Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN;
      const start = Math.max(0, startUnclamped);
      const visibleCount = Math.ceil(viewport / ROW_HEIGHT) + OVERSCAN * 2;
      const end = Math.min(total, start + visibleCount);
      const padTop = start * ROW_HEIGHT;
      const padBottom = (total - end) * ROW_HEIGHT;
      return { start, end, padTop, padBottom };
    });

    const visibleFiles = computed(() => {
      const { start, end } = visibleRange.value;
      const items = [];
      for (let idx = start; idx < end; idx++) {
        items.push({
          index: idx,
          file: filesByIndex.value[idx] || null
        });
      }
      return items;
    });

    const statusTitle = computed(() => {
      if (jobStatus.value === 'completed') {
        if (failedFiles.value === 0) {
          return `✅ All ${totalFiles.value} files uploaded successfully!`;
        }
        return `⚠️ Upload completed with ${failedFiles.value} error(s)`;
      }

      if (jobStatus.value === 'stopped') {
        return `⏸️ Upload stopped. ${successfulFiles.value} files uploaded before stopping.`;
      }

      if (jobData.value?.currentFile) {
        return `Processing: ${jobData.value.currentFile}`;
      }

      return 'Processing...';
    });

    const statusDetail = computed(() => {
      if (jobStatus.value !== 'processing') return null;
      return currentStage.value || null;
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

    function isCurrentProcessingFile(file) {
      if (!file) return false;
      if (file.status !== 'processing') return false;
      if (!jobData.value?.currentFile) return true;
      return file.name === jobData.value.currentFile;
    }

    function getRowStage(file) {
      if (!file) return null;
      if (!jobData.value?.currentStage) return null;
      if (!jobData.value?.currentFile) return null;
      return file.name === jobData.value.currentFile ? jobData.value.currentStage : null;
    }

    async function ensureFilesArraySized(total) {
      if (!total || total <= 0) {
        filesByIndex.value = [];
        return;
      }
      if (filesByIndex.value.length !== total) {
        const next = new Array(total);
        const prev = filesByIndex.value;
        const copyLen = Math.min(prev.length, total);
        for (let i = 0; i < copyLen; i++) {
          next[i] = prev[i];
        }
        filesByIndex.value = next;
      }
    }

    async function loadFilesPage(offset, limit, options = undefined) {
      if (!props.jobId) return;
      if (limit <= 0) return;

      const safeOffset = Math.max(0, offset);
      const safeLimit = Math.max(1, Math.min(1000, limit));
      const key = `${safeOffset}:${safeLimit}`;
      if (inFlightPages.has(key)) return;
      inFlightPages.add(key);

      try {
        const data = await getUploadJobFiles(props.jobId, { offset: safeOffset, limit: safeLimit, signal: options?.signal });
        if (typeof data?.filesTotal === 'number') {
          filesTotal.value = data.filesTotal;
          await ensureFilesArraySized(data.filesTotal);
        }

        const base = typeof data?.offset === 'number' ? data.offset : safeOffset;
        const files = Array.isArray(data?.files) ? data.files : [];
        for (let i = 0; i < files.length; i++) {
          const idx = base + i;
          if (idx >= 0 && idx < filesByIndex.value.length) {
            filesByIndex.value[idx] = files[i];
          }
        }
      } catch (error) {
        // Ignore aborts (e.g., user is still scrolling)
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
          console.error('Error loading job files page:', error);
        }
      } finally {
        inFlightPages.delete(key);
      }
    }

    function loadAroundProgress() {
      const total = totalRows.value;
      if (!total) return;
      const center = processedFiles.value || 0;
      const start = Math.max(0, center - Math.floor(FILE_PAGE_SIZE / 3));
      const end = Math.min(total, start + FILE_PAGE_SIZE);
      loadFilesPage(start, end - start);
    }

    function onFilesScroll(evt) {
      const el = evt?.target;
      if (!el) return;
      scrollTop.value = el.scrollTop || 0;

      const { start, end } = visibleRange.value;
      const pageStart = Math.max(0, start - FILE_PAGE_SIZE);
      const pageEnd = Math.min(totalRows.value, end + FILE_PAGE_SIZE);

      // Hybrid approach:
      // - update visible window immediately (cheap)
      // - fetch the window after scrolling stops (debounced)
      pendingScrollFetch.value = { offset: pageStart, limit: pageEnd - pageStart };

      if (scrollFetchTimer) {
        clearTimeout(scrollFetchTimer);
        scrollFetchTimer = null;
      }

      if (scrollFilesAbortController) {
        scrollFilesAbortController.abort();
        scrollFilesAbortController = null;
      }

      scrollFetchTimer = setTimeout(() => {
        scrollFetchTimer = null;
        const { offset, limit } = pendingScrollFetch.value || { offset: 0, limit: 0 };
        if (!limit || limit <= 0) return;

        scrollFilesAbortController = new AbortController();
        loadFilesPage(offset, limit, { signal: scrollFilesAbortController.signal });
      }, SCROLL_FETCH_DEBOUNCE_MS);
    }

    function measureList() {
      if (!listEl.value) return;
      listHeight.value = listEl.value.clientHeight || 0;
    }

    async function pollJobStatus() {
      if (!props.jobId) return;
      
      try {
        const data = await getUploadJobStatus(props.jobId, { filesLimit: 0 });
        jobData.value = data;

        if (typeof data?.filesTotal === 'number') {
          filesTotal.value = data.filesTotal;
          await ensureFilesArraySized(data.filesTotal);
        }

        // Keep a fresh window around current progress.
        loadAroundProgress();
        
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

    function stopScrollFileFetching() {
      if (scrollFetchTimer) {
        clearTimeout(scrollFetchTimer);
        scrollFetchTimer = null;
      }
      if (scrollFilesAbortController) {
        scrollFilesAbortController.abort();
        scrollFilesAbortController = null;
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
      if (confirm('Are you sure you want to stop the upload? In-progress processing will be cancelled (when supported), and remaining files will be skipped.')) {
        emit('stop', props.jobId);
      }
    }

    onMounted(() => {
      if (props.show && props.jobId) {
        startPolling();
      }

      measureList();
      window.addEventListener('resize', measureList);
    });

    onUnmounted(() => {
      stopPolling();
      stopScrollFileFetching();
      window.removeEventListener('resize', measureList);
    });

    // Watch for prop changes - start/stop polling based on show state
    watch(() => props.show, (newShow) => {
      if (newShow && props.jobId) {
        startPolling();
      } else {
        stopPolling();
        stopScrollFileFetching();
      }
    });

    // Watch for jobId changes
    watch(() => props.jobId, (newJobId, oldJobId) => {
      if (newJobId !== oldJobId) {
        stopPolling();
        stopScrollFileFetching();
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
      listEl,
      visibleFiles,
      visibleRange,
      ROW_HEIGHT,
      progressPercent,
      isComplete,
      canStop,
      statusTitle,
      statusDetail,
      currentStage,
      getFileIcon,
      isCurrentProcessingFile,
      getRowStage,
      onFilesScroll,
      handleClose,
      handleOverlayClick,
      confirmStop
    };
  }
};
</script>

<style scoped src="@/css/UploadProgressModal.css"></style>
