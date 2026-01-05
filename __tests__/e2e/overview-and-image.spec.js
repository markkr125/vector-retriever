import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

async function writeTempPng() {
  // 1x1 transparent PNG
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9Wf6cAAAAASUVORK5CYII=';
  const filePath = path.join(os.tmpdir(), `copilot-test-${Date.now()}.png`);
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

test.describe('Overview + Image features (E2E)', () => {
  test.beforeAll(async ({ browser }) => {
    // Seed one text document via the real UI upload flow.
    const page = await browser.newPage();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 15000 });
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, '../fixtures/documents/test_hotel.txt')
    ]);

    const submitBtn = page.locator('button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.modal-overlay')).toContainText(/success|completed/i, {
      timeout: 60000
    });

    const closeBtn = page.locator('.modal-overlay button').filter({ hasText: 'Close' }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }

    await page.close();
  });

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
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(250);

    // Ensure search view
    await page.locator('.nav-buttons button').filter({ hasText: /Search/ }).first().click().catch(() => {});
    await expect(page.locator('.search-form')).toBeVisible({ timeout: 5000 });
  });

  test('overview generate sets and shows detected language (and persists after reload)', async ({ page }) => {
    // Search seeded doc
    const searchInput = page.locator('textarea.textarea[placeholder*="search" i]').first();
    await searchInput.fill('hotel Paris');
    await page.locator('.search-form select').first().selectOption('hybrid');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Expand first result and open Overview
    await page.locator('.result-card').first().locator('button').filter({ hasText: /Show More/ }).first().click();
    await page.locator('.result-card').first().locator('button.tab-btn').filter({ hasText: /Overview/ }).click();

    // Generate description
    await page.locator('.result-card').first().locator('button.btn-refresh').click();

    await expect(page.locator('.result-card').first().locator('.language-badge')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.result-card').first().locator('.language-badge')).toContainText(/English/i);

    // Reload and re-run search; language badge should still render
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const searchInput2 = page.locator('textarea.textarea[placeholder*="search" i]').first();
    await searchInput2.fill('hotel Paris');
    await page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first().click();
    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    await page.locator('.result-card').first().locator('button').filter({ hasText: /Show More/ }).first().click();
    await page.locator('.result-card').first().locator('button.tab-btn').filter({ hasText: /Overview/ }).click();

    await expect(page.locator('.result-card').first().locator('.language-badge')).toBeVisible({ timeout: 15000 });
  });

  test('by-document search accepts an image and returns results', async ({ page }) => {
    const pngPath = await writeTempPng();

    await page.locator('.search-form select').first().selectOption('by-document');

    const fileInput = page.locator('#search-file-input');
    await fileInput.setInputFiles(pngPath);

    const searchBtn = page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first();
    await searchBtn.click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });
  });

  test('uploaded image overview refresh is disabled when image_data is not stored', async ({ page }) => {
    const pngPath = await writeTempPng();
    const pngName = path.basename(pngPath);

    // Upload an image document
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();
    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([pngPath]);

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.modal-overlay')).toContainText(/success|completed/i, {
      timeout: 60000
    });

    const closeBtn = page.locator('.modal-overlay button').filter({ hasText: 'Close' }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }

    // Browse and open overview for the image doc
    await page.locator('.nav-buttons button').filter({ hasText: /Browse/ }).first().click();
    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    // Narrow down results to the uploaded file (browse is paginated/sorted)
    const filenameFilter = page.locator('input.filename-filter-input[placeholder*="filename" i]').first();
    await expect(filenameFilter).toBeVisible({ timeout: 10000 });
    await filenameFilter.fill(pngName);
    await page.waitForTimeout(600); // allow debounce + request

    // Find the card for the uploaded image
    const imageCard = page.locator('.result-card').filter({ hasText: pngName }).first();
    await expect(imageCard).toBeVisible({ timeout: 15000 });

    await expect(imageCard.locator('.badge').filter({ hasText: '📷 Image' })).toBeVisible({ timeout: 15000 });

    await imageCard.locator('button').filter({ hasText: /Show More/ }).first().click();
    await imageCard.locator('button.tab-btn').filter({ hasText: /Overview/ }).click();

    const refreshBtn = imageCard.locator('button.btn-refresh');
    await expect(refreshBtn).toBeDisabled();
    await expect(imageCard.locator('.info-message')).toContainText(/original image was not stored/i);
  });
});
