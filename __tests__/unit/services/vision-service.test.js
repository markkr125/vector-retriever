jest.mock('sharp', () => {
  return () => ({
    png: () => ({
      toBuffer: async () => Buffer.from('png-bytes')
    })
  });
});

const { createVisionService } = require('../../../services/vision-service');

describe('vision-service (unit)', () => {
  test('processImage parses language, description, and content from structured markdown', async () => {
    const axios = {
      post: jest.fn(async () => ({
        data: {
          message: {
            content: [
              '# Language',
              'English',
              '',
              '# Description',
              'Mock image description.',
              '',
              '# Content',
              'Mock extracted image content.'
            ].join('\n')
          }
        }
      }))
    };

    const svc = createVisionService({
      axios,
      ollamaUrl: 'http://127.0.0.1:11434/api/embed',
      authToken: null,
      visionModel: 'mock-vision'
    });

    const result = await svc.processImage(Buffer.from('raw-image-bytes'), 'image/png');

    expect(result).toEqual({
      language: 'English',
      description: 'Mock image description.',
      markdownContent: 'Mock extracted image content.'
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toContain('/api/chat');
    expect(body.model).toBe('mock-vision');
    // Should attach images to user message
    expect(body.messages[1].images).toHaveLength(1);
  });
});
