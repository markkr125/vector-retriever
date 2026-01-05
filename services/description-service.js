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

      const systemPrompt = `Analyze this document and provide your response in the following markdown format:

# Language
[State the primary language(s) detected in the text. If multiple languages, list them. Examples: "English", "Spanish and English", "Japanese", "Hebrew"]

# Description
[Provide a concise 4-5 sentence summary. Focus on:
- What type of document it is
- The most important details (key numbers, dates, names)
- Main purpose or action

Keep it brief and scannable. Use **bold** for critical information only.]`;

      const response = await axios.post(ollamaChatUrl, {
        model: descriptionModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Please analyze this ${fileType} document:\n\n${textSample}`
          }
        ],
        stream: false
      }, {
        headers,
        timeout: 120000 // 2 minute timeout
      });

      const result = response.data.message.content.trim();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Parse structured response
      const parsed = parseDescriptionResponse(result);

      console.log(`✓ Description generated (${duration}s)`);
      console.log(`  Language: ${parsed.language}`);
      console.log(`  Description: ${parsed.description.substring(0, 100)}...`);

      return { language: parsed.language, description: parsed.description };

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

  /**
   * Parse structured markdown response (# Language, # Description)
   * @param {string} response - Raw LLM response
   * @returns {{language: string, description: string}}
   */
  function parseDescriptionResponse(response) {
    const lines = response.split('\n');
    let language = 'Unknown';
    let description = '';
    let currentSection = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed === '# Language') {
        currentSection = 'language';
      } else if (trimmed === '# Description') {
        currentSection = 'description';
      } else if (trimmed && !trimmed.startsWith('#')) {
        if (currentSection === 'language') {
          language = trimmed;
          currentSection = null;
        } else if (currentSection === 'description') {
          description += (description ? ' ' : '') + trimmed;
        }
      }
    }

    // Fallback: if parsing failed, treat entire response as description
    if (!description && response) {
      description = response.replace(/^#.*$/gm, '').trim();
      language = 'Unknown';
    }

    return { language, description };
  }

  return {
    generateDescription
  };
}

module.exports = {
  createDescriptionService
};
