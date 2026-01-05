const { createDescriptionService } = require('../../../services/description-service');

describe('description-service (unit)', () => {
  test('generateDescription parses language + description from structured markdown', async () => {
    const axios = {
      post: jest.fn(async () => ({
        data: {
          message: {
            content: [
              '# Language',
              'Hebrew',
              '',
              '# Description',
              'Line one.',
              'Line two.'
            ].join('\n')
          }
        }
      }))
    };

    const svc = createDescriptionService({
      axios,
      ollamaUrl: 'http://127.0.0.1:11434/api/embed',
      authToken: null,
      descriptionModel: 'mock-desc'
    });

    const result = await svc.generateDescription('שלום עולם. This is a mixed sample.', 'txt');

    expect(result).toEqual({
      language: 'Hebrew',
      description: 'Line one. Line two.'
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toContain('/api/chat');
    expect(body.model).toBe('mock-desc');
  });

  test('generateDescription falls back when response is not structured', async () => {
    const axios = {
      post: jest.fn(async () => ({
        data: {
          message: {
            content: 'Unstructured response without headings.'
          }
        }
      }))
    };

    const svc = createDescriptionService({
      axios,
      ollamaUrl: 'http://127.0.0.1:11434/api/embed',
      authToken: null,
      descriptionModel: 'mock-desc'
    });

    const result = await svc.generateDescription('Hello', 'txt');

    expect(result.language).toBe('Unknown');
    expect(result.description).toContain('Unstructured response');
  });
});
