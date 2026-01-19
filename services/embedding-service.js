function createEmbeddingService({ axios, ollamaUrl, authToken, model }) {
  // Model context size (fetched on startup)
  let modelMaxContextTokens = 2048;

  // Embedding vector dimension (fetched lazily)
  let embeddingDimension = null;
  let embeddingDimensionPromise = null;

  function normalizeOllamaApiUrl(inputUrl, endpointPath) {
    if (!inputUrl) return null;

    const cleaned = String(inputUrl).trim().replace(/\/+$/, '');
    const apiIndex = cleaned.lastIndexOf('/api/');

    if (apiIndex !== -1) {
      const base = cleaned.slice(0, apiIndex);
      return `${base}${endpointPath}`;
    }

    // Treat as base URL (e.g. http://localhost:11434)
    return `${cleaned}${endpointPath}`;
  }

  const embedUrl = normalizeOllamaApiUrl(ollamaUrl, '/api/embed');
  const showUrl = normalizeOllamaApiUrl(ollamaUrl, '/api/show');

  /**
   * Fetch model's max context size from Ollama
   */
  async function fetchModelContextSize() {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await axios.post(showUrl, {
        name: model
      }, {
        headers,
        timeout: 10000 // 10 second timeout
      });

      // Parse parameters string to extract num_ctx
      const params = response.data.parameters || '';
      const numCtxMatch = params.match(/num_ctx\s+(\d+)/);

      if (numCtxMatch) {
        modelMaxContextTokens = parseInt(numCtxMatch[1], 10);
        console.log(`✓ Model ${model} context size: ${modelMaxContextTokens} tokens`);
      } else {
        console.warn(`⚠️  Could not parse context size from model, using default: ${modelMaxContextTokens}`);
      }
    } catch (error) {
      console.error(`⚠️  Failed to fetch model context size: ${error.message}`);
      console.log(`   Using default context size: ${modelMaxContextTokens} tokens`);
    }
  }

  /**
   * Estimate token count from text (rough approximation: 4 chars = 1 token)
   */
  function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get dense embedding from Ollama
   */
  async function getDenseEmbedding(text, options = {}) {
    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await axios.post(embedUrl, {
        model: model,
        input: text
      }, {
        headers,
        timeout: 300000, // 5 minute timeout for large documents
        signal: options.signal
      });
      return response.data.embeddings[0];
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('❌ Ollama service is not running or not accessible at', embedUrl);
        throw new Error('Ollama service unavailable. Please start Ollama.');
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error('❌ Ollama request timed out after 5 minutes');
        console.error('   Document may be too large for embedding model');
        throw new Error('Embedding generation timed out. Document may be too large.');
      } else if (error.response?.status === 400) {
        console.error('❌ Ollama rejected the request:', error.response.data);
        throw new Error('Invalid embedding request. Document may exceed model context limit.');
      }
      console.error('Error getting dense embedding:', error.message);
      throw error;
    }
  }

  async function fetchEmbeddingDimension() {
    if (embeddingDimension) return embeddingDimension;
    if (embeddingDimensionPromise) return embeddingDimensionPromise;

    embeddingDimensionPromise = (async () => {
      const embedding = await getDenseEmbedding('dimension_probe');
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Unexpected embedding response (missing vector)');
      }
      const dimension = embedding.length;
      embeddingDimension = dimension;
      console.log(`✓ Model ${model} embedding dimension: ${dimension}`);
      return dimension;
    })();

    try {
      return await embeddingDimensionPromise;
    } finally {
      embeddingDimensionPromise = null;
    }
  }

  function getEmbeddingDimension() {
    return embeddingDimension;
  }

  function getModelMaxContextTokens() {
    return modelMaxContextTokens;
  }

  return {
    fetchModelContextSize,
    fetchEmbeddingDimension,
    estimateTokenCount,
    getDenseEmbedding,
    getEmbeddingDimension,
    getModelMaxContextTokens
  };
}

module.exports = {
  createEmbeddingService
};
