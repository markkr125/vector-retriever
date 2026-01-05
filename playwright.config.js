import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  // E2E tests share server state (in-memory uploadJobs) and a shared DB.
  // Running in parallel causes cross-test interference (e.g., one test stopping another's upload).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // CI retries can hide failures and waste time; keep this low.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['github']] : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'bash scripts/start-e2e-webui.sh',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 90000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
