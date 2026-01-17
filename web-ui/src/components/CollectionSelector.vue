<template>
  <div class="collection-selector">
    <div class="selector-container">
      <button 
        class="collection-button"
        @click="toggleDropdown"
        :disabled="loading"
      >
        <span class="collection-icon">{{ currentCollectionIcon }}</span>
        <span class="collection-name">{{ currentCollectionDisplay }}</span>
        <span class="collection-count">({{ currentCollectionCount }})</span>
        <span class="dropdown-arrow">▼</span>
      </button>
      
      <div v-if="showDropdown" class="dropdown-menu">
        <div class="dropdown-header">
          <span>Select Collection</span>
          <button class="close-button" @click="showDropdown = false">✕</button>
        </div>
        
        <div class="dropdown-list">
          <button
            v-for="collection in collections"
            :key="collection.collectionId"
            class="collection-option"
            :class="{ active: collection.collectionId === currentCollectionId }"
            @click="selectCollection(collection)"
          >
            <span class="option-icon">{{ collection.isDefault ? '🏠' : '📦' }}</span>
            <span class="option-name">{{ collection.displayName }}</span>
            <span class="option-count">({{ collection.documentCount || 0 }})</span>
            <span v-if="collection.collectionId === currentCollectionId" class="checkmark">✓</span>
          </button>
        </div>
        
        <div class="dropdown-footer">
          <button class="action-button create" @click="createNew">
            ➕ Create New Collection
          </button>
          <button class="action-button manage" @click="openManagement">
            ⚙️ Manage Collections
          </button>
        </div>
      </div>
    </div>
    
    <!-- Backdrop to close dropdown when clicking outside -->
    <div v-if="showDropdown" class="backdrop" @click="showDropdown = false"></div>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fetchCollections } from '../api';

export default {
  name: 'CollectionSelector',
  props: {
    currentCollectionId: {
      type: String,
      required: true
    }
  },
  emits: ['collection-changed', 'create-collection', 'manage-collections'],
  setup(props, { emit }) {
    const collections = ref([]);
    const showDropdown = ref(false);
    const loading = ref(false);

    const currentCollection = computed(() => {
      return collections.value.find(c => c.collectionId === props.currentCollectionId) || null;
    });

    const currentCollectionIcon = computed(() => {
      if (!currentCollection.value) return '📦';
      return currentCollection.value.isDefault ? '🏠' : '📦';
    });

    const currentCollectionDisplay = computed(() => {
      return currentCollection.value?.displayName || 'Loading...';
    });

    const currentCollectionCount = computed(() => {
      return currentCollection.value?.documentCount || 0;
    });

    const toggleDropdown = () => {
      showDropdown.value = !showDropdown.value;
      if (showDropdown.value) {
        loadCollections();
      }
    };

    const loadCollections = async () => {
      loading.value = true;
      try {
        const data = await fetchCollections();
        collections.value = data;
      } catch (error) {
        console.error('Failed to load collections:', error);
      } finally {
        loading.value = false;
      }
    };

    const selectCollection = (collection) => {
      emit('collection-changed', collection.collectionId);
      showDropdown.value = false;
    };

    const createNew = () => {
      showDropdown.value = false;
      emit('create-collection');
    };

    const openManagement = () => {
      showDropdown.value = false;
      emit('manage-collections');
    };

    // Close dropdown when clicking escape
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showDropdown.value) {
        showDropdown.value = false;
      }
    };

    onMounted(() => {
      loadCollections();
      window.addEventListener('keydown', handleKeyDown);
    });

    onUnmounted(() => {
      window.removeEventListener('keydown', handleKeyDown);
    });

    return {
      collections,
      showDropdown,
      loading,
      currentCollectionIcon,
      currentCollectionDisplay,
      currentCollectionCount,
      toggleDropdown,
      selectCollection,
      createNew,
      openManagement,
      refresh: loadCollections  // Expose refresh method
    };
  }
};
</script>

<style scoped lang="scss" src="@/scss/components/CollectionSelector.scss"></style>
