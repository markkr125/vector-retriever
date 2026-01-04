/**
 * Description Service - Generate comprehensive document descriptions
 * Works for any document type (text, PDF, etc.)
 */

function createDescriptionService({ axios, ollamaUrl, authToken, descriptionModel }) {
  /**
   * Generate comprehensive description for a document
   * @param {string} content - Document content
   * @param {string} fileType - File type (e.g., 'txt', 'pdf', 'docx')
   * @returns {Promise<{description: string}>}
   */
  async function generateDescription(content, fileType = 'unknown') {
    if (!descriptionModel) {
      throw new Error('Description model not configured. Set DESCRIPTION_MODEL in .env');
    }

    console.log(`Generating description for ${fileType} document...`);
    const startTime = Date.now();

    try {
      // Truncate content if too long (use first 4000 chars for context)
      const textSample = content.substring(0, 4000);

      const headers = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Replace /api/embed with /api/chat for LLM models
      const ollamaChatUrl = ollamaUrl.replace('/api/embed', '/api/chat');

      const systemPrompt = `Provide a concise 4-5 sentence summary of this document in plain text.

Focus only on:
- What type of document it is
- The most important details (key numbers, dates, names)
- Main purpose or action

Keep it brief and scannable. Use **bold** for critical information only.`;

      const response = await axios.post(ollamaChatUrl, {
        model: descriptionModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Please provide a comprehensive description of this ${fileType} document:\n\n${textSample}`
          }
        ],
        stream: false
      }, {
        headers,
        timeout: 120000 // 2 minute timeout
      });

      const description = response.data.message.content.trim();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`✓ Description generated (${duration}s): ${description.substring(0, 100)}...`);

      return { description };

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('❌ Ollama service is not running or not accessible at', ollamaUrl);
        throw new Error('Ollama service unavailable. Please start Ollama.');
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error('❌ Description generation timed out');
        throw new Error('Description generation timed out.');
      } else if (error.response?.status === 404) {
        console.error('❌ Description model not found:', descriptionModel);
        throw new Error(`Description model "${descriptionModel}" not found. Please pull it with: ollama pull ${descriptionModel}`);
      }
      console.error('Error generating description:', error.message);
      throw error;
    }
  }

  return {
    generateDescription
  };
}

module.exports = {
  createDescriptionService
};
