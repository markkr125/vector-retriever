import { expect, test } from '@playwright/test';

// These tests validate that the UI issues the correct API requests when the
// filename filter changes. They do not assume any particular dataset.

test.describe('Filename Filter E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(250);
  });

  test('browse filename filter triggers /api/browse?filename=... request', async ({ page }) => {
    // Go to browse view
    await page.locator('button:has-text("Browse")').first().click();

    // Ensure filter UI exists
    const filterInput = page.locator('input.filename-filter-input').first();
    await expect(filterInput).toBeVisible();

    // Wait for the next browse request that includes the filename param
    const filename = `hotel_${Date.now()}`;

    const requestPromise = page.waitForRequest(req => {
      if (req.method() !== 'GET') return false;
      const url = req.url();
      return url.includes('/api/browse') && url.includes(`filename=${encodeURIComponent(filename)}`);
    });

    await filterInput.fill(filename);

    // Debounce is 300ms; allow some slack
    await requestPromise;

    // Clear should also trigger a request (empty filename)
    const clearBtn = page.locator('button.clear-filter-btn').first();
    await expect(clearBtn).toBeVisible();

    const clearRequestPromise = page.waitForRequest(req => {
      if (req.method() !== 'GET') return false;
      const url = req.url();
      return url.includes('/api/browse') && !url.includes('filename=');
    });

    await clearBtn.click();
    await clearRequestPromise;
  });
});
