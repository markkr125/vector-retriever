<template>
  <transition name="slide-down">
    <div v-if="visible" class="scan-notification" :class="notificationClass">
      <div class="notification-content">
        <div class="notification-header">
          <span class="notification-icon">{{ icon }}</span>
          <h3 class="notification-title">{{ title }}</h3>
          <button @click="close" class="close-btn">×</button>
        </div>
        
        <p class="notification-message">{{ message }}</p>
        
        <div v-if="piiTypes && piiTypes.length > 0" class="pii-types-list">
          <strong>Types found:</strong>
          <div class="pii-badges">
            <span 
              v-for="type in piiTypes" 
              :key="type"
              class="pii-type-badge"
            >
              {{ getPIIIcon(type) }} {{ formatPIILabel(type) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, watch } from 'vue'

const props = defineProps({
  visible: Boolean,
  success: Boolean,
  piiDetected: Boolean,
  message: String,
  piiTypes: Array,
  piiCount: Number,
  error: String
})

const emit = defineEmits(['close'])

const icon = computed(() => {
  if (props.error) return '❌'
  if (props.piiDetected) return '⚠️'
  return '✅'
})

const title = computed(() => {
  if (props.error) return 'Scan Failed'
  if (props.piiDetected) return 'Sensitive Data Found'
  return 'Scan Complete'
})

const notificationClass = computed(() => {
  if (props.error) return 'notification-error'
  if (props.piiDetected) return 'notification-warning'
  return 'notification-success'
})

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
    date: '📅',
    medical: '🏥',
    ip_address: '🌐'
  }
  return icons[type] || '🔒'
}

const formatPIILabel = (type) => {
  return type.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

const close = () => {
  emit('close')
}

// Auto-close after 10 seconds
watch(() => props.visible, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      close()
    }, 10000)
  }
})
</script>

<style scoped lang="scss" src="@/scss/components/ScanNotification.scss"></style>
