function createCategorizationService({ axios, ollamaUrl, authToken, categorizationModel }) {
  async function categorizeDocument(content) {
    if (!categorizationModel) {
      return {};
    }

    console.log('Starting automatic categorization...');

    // Truncate content if too long (first 3000 chars for context)
    const textSample = content.substring(0, 3000);

    const systemPrompt = `You are a data extraction assistant.
From the text below, produce only a JSON object that follows this exact schema:
{
  "category": "single main category/subject of the text",
  "country": "country name",
  "city": "city name",
  "coordinates": [latitude, longitude],
  "date": "most relevant date in ISO-8601 format (YYYY-MM-DD)",
  "tags": ["array", "of", "lowercase", "tags"],
  "price": 0,
  "currency": "3-letter currency code (e.g., USD, EUR)",
  "short_description": "a few words describing what's in this text"
}

Requirements:
- Output ONLY the JSON object, no explanations or additional text
- If a field cannot be determined, use empty values: "" for strings, [] for arrays, 0 for numbers
- Do not round prices; keep the exact numeric value present in the text
- Tags should be lowercase with no punctuation or special characters
- Coordinates should be [latitude, longitude] or empty array [] if not found
- Keep all keys exactly as shown above`;

    try {
      const ollamaChatUrl = ollamaUrl.replace('/api/embed', '/api/chat');

      const headers = {
        'Content-Type': 'application/json'
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await axios.post(ollamaChatUrl, {
        model: categorizationModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: textSample }
        ],
        stream: false
      }, { headers });

      const result = response.data.message.content.trim();

      // Parse JSON response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Clean up empty values
        Object.keys(parsed).forEach(key => {
          if (parsed[key] === null ||
              parsed[key] === '' ||
              (Array.isArray(parsed[key]) && parsed[key].length === 0) ||
              parsed[key] === 0) {
            delete parsed[key];
          }
        });

        console.log('Categorization complete:', parsed);
        return parsed;
      }

      console.warn('Could not parse JSON from categorization response');
      return {};
    } catch (error) {
      console.error('Error during categorization:', error.message);
      return {};
    }
  }

  return { categorizeDocument };
}

module.exports = {
  createCategorizationService
};
