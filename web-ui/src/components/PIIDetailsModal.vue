<template>
  <div class="pii-modal-overlay" @click="$emit('close')">
    <div class="pii-modal card" @click.stop>
      <!-- Header -->
      <div class="modal-header">
        <div class="header-content">
          <h2>🔒 Sensitive Data Report</h2>
          <div class="risk-badge" :class="`risk-${riskLevel || 'low'}`">
            {{ (riskLevel || 'low').toUpperCase() }} RISK
          </div>
        </div>
        <button @click="$emit('close')" class="close-btn">&times;</button>
      </div>

      <!-- Document Info -->
      <div class="document-info">
        <h3>{{ filename }}</h3>
        <p class="scan-info">
          Scanned: {{ formatDate(scanDate) }} • 
          {{ piiDetails.length }} sensitive data point{{ piiDetails.length !== 1 ? 's' : '' }} detected
        </p>
      </div>

      <!-- PII Types Summary -->
      <div class="pii-types-grid">
        <div 
          v-for="type in uniquePIITypes" 
          :key="type"
          class="pii-type-card"
        >
          <span class="type-icon">{{ getPIIIcon(type) }}</span>
          <div class="type-info">
            <span class="type-label">{{ formatPIILabel(type) }}</span>
            <span class="type-count">{{ countByType(type) }} found</span>
          </div>
        </div>
      </div>

      <!-- Detailed Findings -->
      <div class="pii-details-section">
        <h4>Detailed Findings</h4>
        <div class="findings-list">
          <div 
            v-for="(detail, index) in piiDetails" 
            :key="index"
            class="finding-card"
            :class="{ 'expanded': expandedItems.has(index) }"
          >
            <div class="finding-header" @click="toggleExpand(index)">
              <div class="finding-type">
                <span class="type-icon">{{ getPIIIcon(detail.type) }}</span>
                <span class="type-label">{{ formatPIILabel(detail.type) }}</span>
              </div>
              <div class="finding-meta">
                <span class="confidence-badge">{{ (detail.confidence * 100).toFixed(0) }}%</span>
                <span class="expand-icon">{{ expandedItems.has(index) ? '▼' : '▶' }}</span>
              </div>
            </div>
            
            <transition name="expand">
              <div v-if="expandedItems.has(index)" class="finding-details">
                <div class="detail-row">
                  <span class="detail-label">Value:</span>
                  <code class="detail-value">{{ detail.value }}</code>
                </div>
                <div class="detail-row" v-if="detail.context">
                  <span class="detail-label">Context:</span>
                  <p class="detail-context">{{ detail.context }}</p>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Location:</span>
                  <span class="detail-text">{{ detail.location || 'Unknown' }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Detected by:</span>
                  <span class="detail-badge">{{ detail.detectedBy || 'unknown' }}</span>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="modal-actions">
        <button @click="downloadReport" class="btn btn-secondary">
          📥 Download Report
        </button>
        <button @click="$emit('close')" class="btn btn-primary">
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  filename: String,
  piiTypes: Array,
  piiDetails: Array,
  riskLevel: String,
  scanDate: String
})

const emit = defineEmits(['close'])

const expandedItems = ref(new Set())

const toggleExpand = (index) => {
  if (expandedItems.value.has(index)) {
    expandedItems.value.delete(index)
  } else {
    expandedItems.value.add(index)
  }
}

const uniquePIITypes = computed(() => {
  return [...new Set(props.piiDetails.map(d => d.type))]
})

const countByType = (type) => {
  return props.piiDetails.filter(d => d.type === type).length
}

const getPIIIcon = (type) => {
  const icons = {
    credit_card: '💳',
    email: '📧',
    phone: '📱',
    ssn: '🆔',
    address: '🏠',
    bank_account: '🏦',
    name: '👤',
    dob: '🎂',
    medical: '🏥',
    ip_address: '🌐'
  }
  return icons[type] || '🔒'
}

const formatPIILabel = (type) => {
  const labels = {
    credit_card: 'Credit Card',
    email: 'Email Address',
    phone: 'Phone Number',
    ssn: 'SSN / National ID',
    address: 'Physical Address',
    bank_account: 'Bank Account',
    name: 'Personal Name',
    dob: 'Date of Birth',
    medical: 'Medical Info',
    ip_address: 'IP Address'
  }
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

const formatDate = (dateStr) => {
  if (!dateStr) return 'Unknown'
  return new Date(dateStr).toLocaleString()
}

const downloadReport = () => {
  const report = {
    filename: props.filename,
    scanDate: props.scanDate,
    riskLevel: props.riskLevel,
    summary: {
      totalFindings: props.piiDetails.length,
      uniqueTypes: uniquePIITypes.value.length,
      types: uniquePIITypes.value
    },
    findings: props.piiDetails
  }
  
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pii-report-${props.filename}-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.pii-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.pii-modal {
  max-width: 900px;
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
  align-items: flex-start;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--border-color);
}

.header-content {
  flex: 1;
}

.header-content h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
}

.risk-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.risk-badge.risk-low {
  background: #4caf50;
  color: white;
}

.risk-badge.risk-medium {
  background: #ff9800;
  color: white;
}

.risk-badge.risk-high {
  background: #ff5722;
  color: white;
}

.risk-badge.risk-critical {
  background: #d32f2f;
  color: white;
  animation: pulse 2s infinite;
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

.document-info {
  margin-bottom: 1.5rem;
}

.document-info h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.2rem;
}

.scan-info {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 0;
}

.pii-types-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.pii-type-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--background);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.pii-type-card:hover {
  border-color: #ff9800;
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.2);
}

.type-icon {
  font-size: 2rem;
}

.type-info {
  display: flex;
  flex-direction: column;
}

.type-label {
  font-weight: 600;
  color: var(--text-primary);
}

.type-count {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.pii-details-section {
  margin: 1.5rem 0;
}

.pii-details-section h4 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
}

/* Findings List - Card Style */
.findings-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.finding-card {
  background: white;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.finding-card:hover {
  border-color: #ff9800;
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.15);
}

.finding-card.expanded {
  border-color: #ff9800;
}

.finding-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.finding-header:hover {
  background: var(--background);
}

.finding-type {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.type-icon {
  font-size: 1.5rem;
}

.type-label {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-primary);
}

.finding-meta {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.confidence-badge {
  padding: 0.25rem 0.75rem;
  background: #4caf50;
  color: white;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.expand-icon {
  color: var(--text-secondary);
  font-size: 0.85rem;
  transition: transform 0.3s;
}

.finding-details {
  padding: 0 1rem 1rem 1rem;
  border-top: 1px solid var(--border-color);
  background: var(--background);
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border-color);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  background: white;
  padding: 0.75rem;
  border-radius: 6px;
  font-family: monospace;
  font-size: 1rem;
  color: #d32f2f;
  border: 1px solid var(--border-color);
  word-break: break-all;
}

.detail-context {
  background: white;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.detail-text {
  font-size: 0.95rem;
  color: var(--text-primary);
}

.detail-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
}

/* Expand Animation */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  max-height: 1000px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>
