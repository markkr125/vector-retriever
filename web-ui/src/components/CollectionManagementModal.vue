<template>
  <div v-if="isOpen" class="modal-overlay">
    <div class="modal-container">
      <div class="modal-header">
        <h2>Manage Collections</h2>
        <button class="close-button" @click="close">✕</button>
      </div>
      
      <div class="modal-body">
        <!-- Create New Collection Section -->
        <div class="create-section">
          <h3>Create New Collection</h3>
          <div class="create-form">
            <input
              v-model="newCollectionName"
              type="text"
              placeholder="Collection name"
              maxlength="50"
              class="input-field"
              @keyup.enter="createCollection"
            />
            <textarea
              v-model="newCollectionDescription"
              placeholder="Description (optional)"
              rows="2"
              class="input-field"
            ></textarea>
            <button 
              class="btn btn-create"
              @click="createCollection"
              :disabled="!newCollectionName.trim() || creating"
            >
              {{ creating ? '⏳ Creating...' : '➕ Create Collection' }}
            </button>
          </div>
          <div v-if="createError" class="error-message">{{ createError }}</div>
        </div>
        
        <!-- Existing Collections Section -->
        <div class="collections-section">
          <div class="section-header">
            <h3>Existing Collections</h3>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="🔍 Search collections..."
              class="search-input"
            />
          </div>
          <div v-if="loading" class="loading">Loading collections...</div>
          
          <div v-else class="collections-list">
            <div
              v-for="collection in paginatedCollections"
              :key="collection.collectionId"
              class="collection-card"
              :class="{ 
                active: collection.collectionId === currentCollectionId,
                default: collection.isDefault,
                editing: editingCollection === collection.collectionId
              }"
            >
              <!-- View Mode -->
              <div v-if="editingCollection !== collection.collectionId" class="collection-info">
                <div class="collection-title">
                  <span class="icon">{{ collection.isDefault ? '🏠' : '📦' }}</span>
                  <span class="name">{{ collection.displayName }}</span>
                  <span v-if="collection.collectionId === currentCollectionId" class="badge active-badge">
                    Active
                  </span>
                  <span v-if="collection.isDefault" class="badge default-badge">
                    Default
                  </span>
                </div>
                <div class="collection-meta">
                  <span class="count">{{ collection.documentCount || 0 }} documents</span>
                  <span class="separator">•</span>
                  <span class="date">Created {{ formatDate(collection.createdAt) }}</span>
                </div>
                <div v-if="collection.description" class="collection-description">
                  {{ collection.description }}
                </div>
              </div>
              
              <!-- Edit Mode -->
              <div v-else class="collection-edit-form">
                <div class="edit-field-group">
                  <label>Collection Name</label>
                  <input
                    v-model="editName"
                    type="text"
                    class="edit-input"
                    placeholder="Collection name"
                    @keyup.enter="saveRename(collection)"
                    @keyup.esc="cancelRename"
                  />
                </div>
                <div class="edit-field-group">
                  <label>Description</label>
                  <input
                    v-model="editDescription"
                    type="text"
                    class="edit-input"
                    placeholder="Description (optional)"
                    @keyup.enter="saveRename(collection)"
                    @keyup.esc="cancelRename"
                  />
                </div>
                <div v-if="renameError" class="error-message">
                  {{ renameError }}
                </div>
              </div>
              
              <!-- Action Buttons -->
              <div class="collection-actions">
                <!-- View Mode Buttons -->
                <template v-if="editingCollection !== collection.collectionId">
                  <button
                    v-if="collection.collectionId !== currentCollectionId"
                    class="btn btn-sm btn-switch"
                    @click="switchToCollection(collection.collectionId)"
                  >
                    🔄 Switch
                  </button>
                  <button
                    v-if="!collection.isDefault"
                    class="btn btn-sm btn-rename"
                    @click="startRename(collection)"
                  >
                    ✏️ Rename
                  </button>
                  <button
                    class="btn btn-sm btn-empty"
                    @click="confirmEmpty(collection)"
                    :disabled="emptying === collection.collectionId"
                  >
                    {{ emptying === collection.collectionId ? '⏳ Emptying...' : '🗑️ Empty' }}
                  </button>
                  <button
                    v-if="!collection.isDefault"
                    class="btn btn-sm btn-delete"
                    @click="confirmDelete(collection)"
                    :disabled="deleting === collection.collectionId"
                  >
                    {{ deleting === collection.collectionId ? '⏳ Deleting...' : '❌ Delete' }}
                  </button>
                </template>
                
                <!-- Edit Mode Buttons -->
                <template v-else>
                  <button
                    class="btn btn-sm btn-save"
                    @click="saveRename(collection)"
                    :disabled="!editName.trim() || renaming === collection.collectionId"
                  >
                    {{ renaming === collection.collectionId ? '⏳ Saving...' : '✅ Save' }}
                  </button>
                  <button
                    class="btn btn-sm btn-cancel"
                    @click="cancelRename"
                    :disabled="renaming === collection.collectionId"
                  >
                    ❌ Cancel
                  </button>
                </template>
              </div>
            </div>
            
            <!-- Pagination Controls -->
            <div v-if="totalPages > 1" class="pagination">
              <button 
                class="pagination-btn"
                @click="prevPage"
                :disabled="currentPage === 1"
              >
                ‹ Previous
              </button>
              
              <div class="pagination-pages">
                <button
                  v-for="page in totalPages"
                  :key="page"
                  class="pagination-page"
                  :class="{ active: page === currentPage }"
                  @click="goToPage(page)"
                >
                  {{ page }}
                </button>
              </div>
              
              <button 
                class="pagination-btn"
                @click="nextPage"
                :disabled="currentPage === totalPages"
              >
                Next ›
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Confirmation Dialog -->
      <div v-if="confirmDialog.show" class="confirm-dialog">
        <div class="confirm-content">
          <h4>{{ confirmDialog.title }}</h4>
          <p>{{ confirmDialog.message }}</p>
          <div class="confirm-actions">
            <button class="btn btn-cancel" @click="cancelConfirm">Cancel</button>
            <button 
              class="btn btn-confirm"
              :class="{ danger: confirmDialog.danger }"
              @click="executeConfirm"
            >
              {{ confirmDialog.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
    createCollection,
    deleteCollection,
    emptyCollection,
    fetchCollections,
    renameCollection
} from '@/api';
import { computed, onMounted, ref, watch } from 'vue';

export default {
  name: 'CollectionManagementModal',
  props: {
    isOpen: {
      type: Boolean,
      default: false
    },
    currentCollectionId: {
      type: [String, null],
      required: false,
      default: null
    }
  },
  emits: ['close', 'collection-created', 'collection-switched', 'collection-deleted', 'collection-emptied', 'collection-renamed'],
  setup(props, { emit }) {
    const collections = ref([]);
    const loading = ref(false);
    const creating = ref(false);
    const deleting = ref(null);
    const emptying = ref(null);
    const renaming = ref(null);
    const editingCollection = ref(null);
    const editName = ref('');
    const editDescription = ref('');
    const renameError = ref('');
    const searchQuery = ref('');
    const currentPage = ref(1);
    const itemsPerPage = ref(5);
    
    const newCollectionName = ref('');
    const newCollectionDescription = ref('');
    const createError = ref('');
    
    const confirmDialog = ref({
      show: false,
      title: '',
      message: '',
      confirmText: '',
      danger: false,
      action: null,
      collection: null
    });

    const filteredCollections = computed(() => {
      if (!searchQuery.value.trim()) {
        return collections.value;
      }
      const query = searchQuery.value.toLowerCase();
      return collections.value.filter(c => 
        c.displayName.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query))
      );
    });

    const totalPages = computed(() => {
      return Math.ceil(filteredCollections.value.length / itemsPerPage.value);
    });

    const paginatedCollections = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage.value;
      const end = start + itemsPerPage.value;
      return filteredCollections.value.slice(start, end);
    });

    const goToPage = (page) => {
      if (page >= 1 && page <= totalPages.value) {
        currentPage.value = page;
      }
    };

    const nextPage = () => {
      if (currentPage.value < totalPages.value) {
        currentPage.value++;
      }
    };

    const prevPage = () => {
      if (currentPage.value > 1) {
        currentPage.value--;
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

    const createNewCollection = async () => {
      creating.value = true;
      createError.value = '';
      
      try {
        const collection = await createCollection({
          displayName: newCollectionName.value.trim(),
          description: newCollectionDescription.value.trim()
        });
        
        newCollectionName.value = '';
        newCollectionDescription.value = '';
        
        await loadCollections();
        emit('collection-created', collection);
      } catch (error) {
        createError.value = error.response?.data?.error || error.message;
      } finally {
        creating.value = false;
      }
    };

    const switchToCollection = (collectionId) => {
      emit('collection-switched', collectionId);
      close();
    };

    const startRename = (collection) => {
      editingCollection.value = collection.collectionId;
      editName.value = collection.displayName;
      editDescription.value = collection.description || '';
      renameError.value = '';
    };

    const cancelRename = () => {
      editingCollection.value = null;
      editName.value = '';
      editDescription.value = '';
      renameError.value = '';
    };

    const saveRename = async (collection) => {
      renaming.value = collection.collectionId;
      renameError.value = '';
      
      try {
        await renameCollection(collection.collectionId, {
          displayName: editName.value.trim(),
          description: editDescription.value.trim()
        });
        
        await loadCollections();
        emit('collection-renamed', collection.collectionId);
        cancelRename();
      } catch (error) {
        renameError.value = error.response?.data?.error || error.message;
      } finally {
        renaming.value = null;
      }
    };

    const confirmEmpty = (collection) => {
      confirmDialog.value = {
        show: true,
        title: 'Empty Collection',
        message: `Are you sure you want to empty "${collection.displayName}"? This will delete all ${collection.documentCount} documents. This action cannot be undone.`,
        confirmText: 'Empty Collection',
        danger: true,
        action: 'empty',
        collection
      };
    };

    const confirmDelete = (collection) => {
      confirmDialog.value = {
        show: true,
        title: 'Delete Collection',
        message: `Are you sure you want to delete "${collection.displayName}"? This will permanently remove the collection and all its ${collection.documentCount} documents. This action cannot be undone.`,
        confirmText: 'Delete Collection',
        danger: true,
        action: 'delete',
        collection
      };
    };

    const executeConfirm = async () => {
      const { action, collection } = confirmDialog.value;
      
      if (action === 'empty') {
        await emptyCollectionHandler(collection);
      } else if (action === 'delete') {
        await deleteCollectionHandler(collection);
      }
      
      cancelConfirm();
    };

    const cancelConfirm = () => {
      confirmDialog.value = {
        show: false,
        title: '',
        message: '',
        confirmText: '',
        danger: false,
        action: null,
        collection: null
      };
    };

    const emptyCollectionHandler = async (collection) => {
      emptying.value = collection.collectionId;
      
      try {
        await emptyCollection(collection.collectionId);
        await loadCollections();
        emit('collection-emptied', collection.collectionId);
      } catch (error) {
        console.error('Failed to empty collection:', error);
        alert(error.response?.data?.error || 'Failed to empty collection');
      } finally {
        emptying.value = null;
      }
    };

    const deleteCollectionHandler = async (collection) => {
      deleting.value = collection.collectionId;
      
      try {
        await deleteCollection(collection.collectionId);
        await loadCollections();
        emit('collection-deleted', collection.collectionId);
      } catch (error) {
        console.error('Failed to delete collection:', error);
        alert(error.response?.data?.error || 'Failed to delete collection');
      } finally {
        deleting.value = null;
      }
    };

    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now - date);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
      return date.toLocaleDateString();
    };

    const close = () => {
      emit('close');
    };

    // Load collections when modal opens
    watch(() => props.isOpen, (newValue) => {
      if (newValue) {
        loadCollections();
        currentPage.value = 1;
      }
    });

    // Reset to page 1 when search changes
    watch(searchQuery, () => {
      currentPage.value = 1;
    });

    onMounted(() => {
      if (props.isOpen) {
        loadCollections();
      }
    });

    return {
      collections,
      filteredCollections,
      paginatedCollections,
      currentPage,
      totalPages,
      loading,
      creating,
      deleting,
      emptying,
      renaming,
      editingCollection,
      editName,
      editDescription,
      renameError,
      searchQuery,
      newCollectionName,
      newCollectionDescription,
      createError,
      confirmDialog,
      loadCollections,
      createCollection: createNewCollection,
      switchToCollection,
      startRename,
      saveRename,
      cancelRename,
      confirmEmpty,
      confirmDelete,
      executeConfirm,
      cancelConfirm,
      formatDate,
      goToPage,
      nextPage,
      prevPage,
      close
    };
  }
};
</script>

<style scoped lang="scss" src="@/scss/components/modals/CollectionManagementModal.scss"></style>
