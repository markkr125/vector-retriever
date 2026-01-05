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
  // Only documented PII types from PII_DETECTION.md
  const icons = {
    credit_card: '💳',
    credit_card_last4: '💳',
    email: '📧',
    phone: '📞',
    address: '📍',
    ssn: '🆔',
    name: '👤',
    bank_account: '🏦',
    passport: '🛂',
    driver_license: '🚗',
    date_of_birth: '📅',
    ip_address: '🌐',
    medical: '🏥'
  }
  return icons[type] || '🔒'
}

const formatPIILabel = (type) => {
  // Only documented PII types from PII_DETECTION.md
  const labels = {
    credit_card: 'Credit Card',
    credit_card_last4: 'Credit Card Last 4',
    email: 'Email Address',
    phone: 'Phone Number',
    address: 'Physical Address',
    ssn: 'SSN',
    name: 'Personal Name',
    bank_account: 'Bank Account',
    passport: 'Passport',
    driver_license: 'Driver License',
    date_of_birth: 'Date of Birth',
    ip_address: 'IP Address',
    medical: 'Medical Info'
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

<style scoped src="@/css/PIIDetailsModal.css"></style>
