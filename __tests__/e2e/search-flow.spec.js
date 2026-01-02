import { expect, test } from '@playwright/test';

test.describe('Search Flow E2E', () => {
  test.beforeEach(async ({ page, request }) => {
    // Ensure prior runs don't leave the app in "Uploading..." state.
    try {
      const activeJob = await request.get('http://localhost:3001/api/upload-jobs/active');
      const job = await activeJob.json();
      if (job?.id) {
        await request.post(`http://localhost:3001/api/upload-jobs/${job.id}/stop`).catch(() => {});
      }
    } catch {
      // ignore
    }

    await page.addInitScript(() => {
      try {
        localStorage.removeItem('activeUploadJobId');
      } catch {
        // ignore
      }
    });

    await page.goto('/');
    // Wait for app to be ready
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Ensure we're in search view (header nav, not the form submit button)
    await page.locator('.nav-buttons button').filter({ hasText: /Search/ }).first().click().catch(() => {});
    await expect(page.locator('.search-form')).toBeVisible({ timeout: 5000 });
  });

  test('complete search and bookmark flow', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1')).toBeVisible();

    // Enter search query
    const searchInput = page.locator('textarea.textarea[placeholder*="search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('luxury hotel Paris');

    // Select search type
    const searchTypeSelect = page.locator('.search-form select').first();
    await searchTypeSelect.selectOption('hybrid');

    // Click search button
    const searchButton = page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first();
    await searchButton.click();

    // Wait for results
    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Verify results are displayed
    const firstResult = page.locator('.result-card').first();
    await expect(firstResult).toBeVisible();

    // Bookmark first result
    const bookmarkBtn = firstResult.locator('[data-testid="bookmark-btn"], .btn-bookmark').first();
    await bookmarkBtn.click();

    // Navigate to bookmarks view
    const bookmarksBtn = page.locator('button:has-text("Bookmarks")');
    if (await bookmarksBtn.isVisible()) {
      await bookmarksBtn.click();

      // Verify bookmarked item is shown
      await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 5000 });
    }

    // Verify bookmark persists after page refresh
    await page.reload();
    
    const bookmarksBtnAfterReload = page.locator('button:has-text("Bookmarks")');
    if (await bookmarksBtnAfterReload.isVisible()) {
      await bookmarksBtnAfterReload.click();
      await expect(page.locator('.result-card')).toHaveCount(1);
    }
  });

  test('semantic vs hybrid search comparison', async ({ page }) => {
    // Semantic search
    await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('expensive accommodation');
    await page.locator('.search-form select').first().selectOption('semantic');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });
    const semanticFirstResult = await page.locator('.result-card').first().textContent();

    // Hybrid search with same query
    await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('expensive accommodation');
    await page.locator('.search-form select').first().selectOption('hybrid');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });
    const hybridFirstResult = await page.locator('.result-card').first().textContent();

    // Results may differ between semantic and hybrid
    console.log('Semantic first result:', semanticFirstResult);
    console.log('Hybrid first result:', hybridFirstResult);
  });

  test('filter search results by category', async ({ page }) => {
    // Perform search
    await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('hotel');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Apply category filter
    const categoryFilter = page.locator('.facet-item:has-text("hotel")').first();
    if (await categoryFilter.isVisible()) {
      await categoryFilter.click();

      // Wait for filtered results
      await page.waitForTimeout(1000);

      // All results should be hotels
      const results = page.locator('.result-card');
      const count = await results.count();

      for (let i = 0; i < Math.min(count, 5); i++) {
        const resultText = await results.nth(i).textContent();
        expect(resultText.toLowerCase()).toContain('hotel');
      }
    }
  });

  test('pagination navigation', async ({ page }) => {
    // Search with many results
    await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('hotel');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Navigate to page 2
    const nextButton = page.locator('[data-testid="next-page"], button:has-text("Next")').first();
    if (await nextButton.isVisible()) {
      await nextButton.click();

      // Wait for new results
      await page.waitForTimeout(1000);

      // Should still have results
      await expect(page.locator('.result-card').first()).toBeVisible();

      // URL should reflect page 2
      expect(page.url()).toContain('page=2');
    }
  });

  test('find similar documents', async ({ page }) => {
    // Perform initial search
    await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('hotel');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Click "Find Similar" on first result
    const firstResult = page.locator('.result-card').first();
    const findSimilarBtn = firstResult.locator('[data-testid="find-similar"], button:has-text("Similar")').first();

    if (await findSimilarBtn.isVisible()) {
      await findSimilarBtn.click();

      // Wait for similar results
      await page.waitForTimeout(2000);

      // Should show similar documents
      await expect(page.locator('.result-card').first()).toBeVisible();

      // URL should contain similarTo parameter
      expect(page.url()).toContain('similarTo=');
    }
  });

  test('surprise me feature', async ({ page }) => {
    // Click surprise me button
    const surpriseBtn = page.locator('button').filter({ hasText: /Surprise Me/ }).first();

    if (await surpriseBtn.isVisible()) {
      await surpriseBtn.click();

      // Should show random results
      await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

      // URL should contain randomSeed
      expect(page.url()).toContain('randomSeed=');
    }
  });

  test('clear search and filters', async ({ page }) => {
    // Perform search with filters
    await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('hotel');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Apply filter
    const categoryFilter = page.locator('.facet-item').first();
    if (await categoryFilter.isVisible()) {
      await categoryFilter.click();
      await page.waitForTimeout(1000);
    }

    // Clear all
    const clearBtn = page.locator('button:has-text("Clear")').first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();

      // Search input should be cleared
      const searchInput = page.locator('textarea.textarea[placeholder*="search" i]').first();
      await expect(searchInput).toHaveValue('');
    }
  });

  test('adjusts dense weight slider', async ({ page }) => {
    // Select hybrid search
    await page.locator('select').first().selectOption('hybrid');

    // Find and adjust slider
    const slider = page.locator('input[type="range"]').first();
    
    if (await slider.isVisible()) {
      // Move slider to 0.3 (more keyword-focused)
      await slider.evaluate((el, value) => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, '0.3');

      // Perform search
      await page.locator('textarea.textarea[placeholder*="search" i]').first().fill('luxury hotel');
      await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

      await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });
    }
  });
});
