module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server.js',
    'pii-detector.js',
    'visualization-service.js',
    'index.js',
    '!node_modules/**'
  ],
  testMatch: [
    '**/__tests__/unit/**/*.test.js',
    '**/__tests__/integration/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000, // 30s for integration tests
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 65,
      lines: 70,
      statements: 70
    }
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/web-ui/'
  ]
};
