# Testing Documentation

This document provides instructions for running and maintaining tests in the Ollama-Qdrant-Experiment project.

## Quick Start

```bash
# Install dependencies (first time)
npm install
cd web-ui && npm install && cd ..
npx playwright install --with-deps

# Run all tests
npm run test:all

# Run specific test suites
npm run test:unit              # Backend unit tests
npm run test:integration       # API integration tests (requires Qdrant)
cd web-ui && npm run test      # Frontend component tests
npm run test:e2e              # End-to-end tests (requires full stack)
```

## Test Structure

```
__tests__/
├── unit/                      # Unit tests (fast, isolated)
│   ├── services/             # PII detector, visualization service
│   └── utils/                # Utility functions (sparse vectors, metadata parsing)
├── integration/              # Integration tests (require Qdrant)
│   └── api/                  # API endpoint tests
├── e2e/                      # End-to-end tests (Playwright)
├── fixtures/
│   ├── documents/            # Test documents
│   ├── mock-responses/       # Mock API responses
│   └── test-helpers.js       # Shared test utilities
```

## Prerequisites

### For Unit Tests
- Node.js 16+
- No external services required (tests use mocks)

### For Integration Tests
- Qdrant running on `localhost:6333`
- Set `RUN_INTEGRATION_TESTS=true` in environment

```bash
# Start Qdrant for integration tests
docker-compose -f qdrant-docker-compose.yml up -d

# Run integration tests
npm run test:integration
```

### For E2E Tests
- Qdrant running
- Full application stack (server + web UI)
- Playwright browsers installed

```bash
# Install Playwright browsers (first time)
npx playwright install --with-deps

# Run E2E tests
npm run test:e2e

# Run with UI for debugging
npm run test:e2e:ui

# Debug specific test
npm run test:e2e:debug
```

## Test Commands

### Backend Tests

```bash
# Run unit tests only
npm run test:unit

# Run integration tests (requires Qdrant)
npm run test:integration

# Run all backend tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Frontend Tests

```bash
cd web-ui

# Run component tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in UI mode (interactive)
npm run test:e2e:ui

# Debug mode (step through tests)
npm run test:e2e:debug

# Run specific test file
npx playwright test __tests__/e2e/search-flow.spec.js

# Run tests in headed mode (see browser)
npx playwright test --headed
```

## Environment Configuration

### .env.test
Used for test environment:

```bash
OLLAMA_URL=http://localhost:11434/api/embed
MODEL=embeddinggemma:latest
QDRANT_URL=http://localhost:6333
COLLECTION_NAME=test_documents

VIZ_CACHE_STRATEGY=memory
VIZ_CACHE_TTL=60000

PII_DETECTION_ENABLED=false
SERVER_PORT=3099
MAX_FILE_SIZE_MB=5
```

## Writing Tests

### Unit Test Example

```javascript
// __tests__/unit/services/example.test.js
describe('MyService', () => {
  test('performs operation correctly', () => {
    const result = myService.doSomething('input');
    expect(result).toBe('expected output');
  });
});
```

### Integration Test Example

```javascript
// __tests__/integration/api/example.test.js
const request = require('supertest');

describe('POST /api/example', () => {
  test('returns expected response', async () => {
    const response = await request(app)
      .post('/api/example')
      .send({ data: 'test' })
      .expect(200);

    expect(response.body).toHaveProperty('result');
  });
});
```

### E2E Test Example

```javascript
// __tests__/e2e/example.spec.js
import { test, expect } from '@playwright/test';

test('user can complete flow', async ({ page }) => {
  await page.goto('/');
  await page.locator('button').click();
  await expect(page.locator('.result')).toBeVisible();
});
```

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main`

GitHub Actions workflow: `.github/workflows/test.yml`

### Workflow Jobs
1. **unit-tests**: Fast unit tests with mocks
2. **integration-tests**: API tests with Qdrant service
3. **frontend-tests**: Vue component tests
4. **e2e-tests**: Full application E2E tests
5. **test-summary**: Aggregates results

## Coverage Goals

| Layer | Target | Current |
|-------|--------|---------|
| Service Modules | 85% | TBD |
| API Endpoints | 80% | TBD |
| Vue Components | 75% | TBD |
| Utility Functions | 90% | TBD |
| **Overall** | **80%** | **TBD** |

View coverage reports:
- Backend: `coverage/lcov-report/index.html`
- Frontend: `web-ui/coverage/index.html`

## Debugging Tests

### Jest Tests (Backend)

```bash
# Run single test file
npx jest __tests__/unit/services/pii-detector.test.js

# Run tests matching pattern
npx jest --testNamePattern="detects SSN"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand

# Verbose output
npx jest --verbose
```

### Vitest Tests (Frontend)

```bash
cd web-ui

# Run single test file
npx vitest SearchForm.test.js

# Run with UI
npx vitest --ui

# Debug in browser
npx vitest --inspect
```

### Playwright Tests

```bash
# Debug specific test
npx playwright test --debug search-flow.spec.js

# Pause on failure
npx playwright test --pause-on-failure

# Generate test code
npx playwright codegen http://localhost:5173
```

## Common Issues

### "Collection not found" in integration tests
**Solution**: Ensure Qdrant is running and test collection setup completes:
```bash
docker-compose -f qdrant-docker-compose.yml up -d
```

### Integration tests skipped
**Solution**: Set environment variable:
```bash
export RUN_INTEGRATION_TESTS=true
npm run test:integration
```

### Playwright timeout errors
**Solution**: Increase timeout in `playwright.config.js` or use `{ timeout: 60000 }`:
```javascript
test('slow operation', async ({ page }) => {
  // ...
}, { timeout: 60000 });
```

### Port already in use (E2E tests)
**Solution**: E2E tests start their own server. Stop any running instances:
```bash
pkill -f "node server.js"
pkill -f "vite"
```

## Test Maintenance

### Adding New Tests
1. Create test file in appropriate directory
2. Follow existing naming conventions: `*.test.js` or `*.spec.js`
3. Add to relevant test suite (unit/integration/e2e)
4. Update this README if adding new test commands

### Updating Fixtures
Test fixtures are in `__tests__/fixtures/`:
- `documents/` - Sample documents for upload tests
- `mock-responses/` - Canned API responses
- `test-helpers.js` - Shared test utilities

### Flaky Test Protocol
If a test is flaky:
1. Add `.skip` to the test: `test.skip('flaky test', ...)`
2. Create GitHub issue with details
3. Investigate and fix root cause
4. Remove `.skip` and verify stability

## Performance Benchmarks

Typical test run times:
- Unit tests: ~10 seconds
- Integration tests: ~30 seconds
- Frontend tests: ~15 seconds
- E2E tests: ~2-5 minutes

CI/CD pipeline: ~5-10 minutes total

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Testing Library](https://testing-library.com/)

## Support

For test-related questions:
1. Check this documentation
2. Review existing test examples
3. Search GitHub issues
4. Create new issue with `testing` label
