require('dotenv').config({ path: '.env.test' });

// Mock Ollama API for unit tests
global.mockOllamaEmbedding = () => {
  return Array(768).fill(0).map(() => Math.random() * 2 - 1);
};

// Mock sparse vector generation
global.mockSparseVector = () => {
  return {
    indices: [1234, 5678, 9012],
    values: [3, 2, 1]
  };
};

// Setup and teardown for integration tests
const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

beforeAll(async () => {
  if (shouldRunIntegration) {
    console.log('Setting up integration test environment...');
    // Integration tests will handle their own collection setup
  }
});

afterAll(async () => {
  if (shouldRunIntegration) {
    console.log('Cleaning up integration test environment...');
  }
});
