/**
 * Vision Service - Process images with vision models
 * Extracts language, description, and content from images in a single API call
 */

function createVisionService({ axios, ollamaUrl, authToken, visionModel }) {
  /**
   * Process image with vision model
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg')
   * @returns {Promise<{language: string, description: string, markdownContent: string}>}
   */
  async function processImage(imageBuffer, mimeType) {
    if (!visionModel) {
      throw new Error('Vision model not configured. Set VISION_MODEL in .env');
    }

    console.log('Processing image with vision model...');
    const startTime = Date.now();

    try {
      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');

      const headers = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Replace /api/embed with /api/chat for vision models
      const ollamaChatUrl = ollamaUrl.replace('/api/embed', '/api/chat');

      const systemPrompt = `You are a document analysis assistant. Analyze this image thoroughly.

Provide your response in the following markdown format:

# Language
[State the primary language(s) detected in any text within the image. If multiple languages, list them. If no text is present, state "None" or "Visual content only"]

# Description  
[Provide a comprehensive overview of this image. Be as concise as possible while including EVERYTHING important:
- What type of document/content this is
- Main subject or purpose
- Key information, data, or details visible
- Important context or notable elements
- Any critical numbers, dates, names, or identifiers
Include all essential information someone would need to understand what this document contains without seeing it.]

# Content
[Extract or describe the full content in detail:
- If document/screenshot with text: Extract ALL text in markdown format, preserving structure (headings, lists, tables, etc.)
- If diagram/chart: Describe all elements, labels, data points, relationships in structured markdown
- If photo/scene: Provide detailed description in markdown including all visible elements, text, objects, context
- Preserve exact wording of any text present
- Maintain logical structure and organization]

Be thorough and precise. Capture every detail from the image.`;

      const response = await axios.post(ollamaChatUrl, {
        model: visionModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: 'Please analyze this image.',
            images: [base64Image]
          }
        ],
        stream: false
      }, {
        headers,
        timeout: 300000 // 5 minute timeout for vision processing
      });

      const result = response.data.message.content.trim();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Parse structured response
      const parsed = parseVisionResponse(result);

      console.log(`✓ Vision processing complete (${duration}s)`);
      console.log(`  Language: ${parsed.language}`);
      console.log(`  Description: ${parsed.description.substring(0, 100)}...`);
      console.log(`  Content length: ${parsed.markdownContent.length} chars`);

      return parsed;

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error('❌ Ollama service is not running or not accessible at', ollamaUrl);
        throw new Error('Ollama service unavailable. Please start Ollama.');
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        console.error('❌ Vision processing timed out after 5 minutes');
        throw new Error('Vision processing timed out. Image may be too large or complex.');
      } else if (error.response?.status === 400) {
        console.error('❌ Ollama rejected the vision request:', error.response.data);
        throw new Error('Invalid vision request. Model may not support vision or image format is unsupported.');
      } else if (error.response?.status === 404) {
        console.error('❌ Vision model not found:', visionModel);
        throw new Error(`Vision model "${visionModel}" not found. Please pull it with: ollama pull ${visionModel}`);
      }
      console.error('Error processing image with vision model:', error.message);
      throw error;
    }
  }

  /**
   * Parse vision model response into structured format
   * @param {string} response - Raw response from vision model
   * @returns {{language: string, description: string, markdownContent: string}}
   */
  function parseVisionResponse(response) {
    const result = {
      language: 'Unknown',
      description: '',
      markdownContent: ''
    };

    try {
      // Extract Language section
      const languageMatch = response.match(/# Language\s*\n([\s\S]*?)(?=\n# |$)/i);
      if (languageMatch) {
        result.language = languageMatch[1].trim();
      }

      // Extract Description section
      const descriptionMatch = response.match(/# Description\s*\n([\s\S]*?)(?=\n# |$)/i);
      if (descriptionMatch) {
        result.description = descriptionMatch[1].trim();
      }

      // Extract Content section
      const contentMatch = response.match(/# Content\s*\n([\s\S]*?)$/i);
      if (contentMatch) {
        result.markdownContent = contentMatch[1].trim();
      }

      // Fallback: if parsing failed, use entire response as content
      if (!result.markdownContent && response.length > 0) {
        result.markdownContent = response;
        console.warn('⚠️  Could not parse structured vision response, using full response as content');
      }

    } catch (error) {
      console.error('Error parsing vision response:', error.message);
      // Use entire response as fallback
      result.markdownContent = response;
    }

    return result;
  }

  return {
    processImage
  };
}

module.exports = {
  createVisionService
};
