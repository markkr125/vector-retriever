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

<style scoped>
.scan-notification {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  overflow: hidden;
}

.notification-content {
  padding: 1.5rem;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.notification-icon {
  font-size: 2rem;
}

.notification-title {
  flex: 1;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s;
}

.close-btn:hover {
  background: var(--background);
}

.notification-message {
  margin: 0 0 1rem 0;
  color: var(--text-primary);
  font-size: 1rem;
}

.pii-types-list {
  background: var(--background);
  padding: 1rem;
  border-radius: 8px;
}

.pii-types-list strong {
  display: block;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.pii-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pii-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.75rem;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 500;
}

/* Notification variants */
.notification-warning {
  border-top: 4px solid #ff9800;
}

.notification-success {
  border-top: 4px solid #4caf50;
}

.notification-error {
  border-top: 4px solid #f44336;
}

/* Animations */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translate(-50%, -20px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
