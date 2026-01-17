import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Collection state (set by App.vue)
let currentCollectionId = null;

export function setCurrentCollection(collectionId) {
  currentCollectionId = collectionId;
}

export function getCurrentCollection() {
  return currentCollectionId;
}

// Add collection parameter to all requests
api.interceptors.request.use(config => {
  if (currentCollectionId) {
    // Skip collection management endpoints
    if (config.url.includes('/collections') && config.method !== 'get') {
      return config;
    }
    
    // Add collection to query params for GET requests
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        collection: currentCollectionId
      };
    }
    // Add collection to params for POST requests
    else if (config.method === 'post') {
      if (!config.params) {
        config.params = {};
      }
      config.params.collection = currentCollectionId;
    }
  }
  return config;
});

// Collection Management APIs
export async function fetchCollections() {
  const response = await api.get('/collections');
  return response.data;
}

export async function createCollection(data) {
  const response = await api.post('/collections', data);
  return response.data;
}

export async function renameCollection(collectionId, { displayName, description }) {
  const response = await api.patch(`/collections/${collectionId}`, {
    displayName,
    description
  });
  return response.data;
}

export async function deleteCollection(collectionId) {
  const response = await api.delete(`/collections/${collectionId}`);
  return response.data;
}

export async function emptyCollection(collectionId) {
  const response = await api.post(`/collections/${collectionId}/empty`);
  return response.data;
}

export async function getCollectionStats(collectionId) {
  const response = await api.get(`/collections/${collectionId}/stats`);
  return response.data;
}

// Upload job management
export async function getUploadJobStatus(jobId, params = undefined) {
  const response = await api.get(`/upload-jobs/${jobId}`, { params });
  return response.data;
}

export async function getUploadJobFiles(jobId, { offset = 0, limit = 200, signal } = {}) {
  const response = await api.get(`/upload-jobs/${jobId}/files`, {
    params: { offset, limit },
    signal
  });
  return response.data;
}

export async function getActiveUploadJob() {
  const response = await api.get('/upload-jobs/active');
  return response.data;
}

export async function stopUploadJob(jobId) {
  const response = await api.post(`/upload-jobs/${jobId}/stop`);
  return response.data;
}

export async function resumeUploadJob(jobId) {
  const response = await api.post(`/upload-jobs/${jobId}/resume`);
  return response.data;
}

// Description generation
export async function generateDescription(documentId, collectionId) {
  const response = await api.post(`/documents/${documentId}/generate-description`, {}, {
    params: { collection: collectionId }
  });
  return response.data;
}

export default api;
