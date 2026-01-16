import { expect, test } from '@playwright/test';

test.describe('Cloud Import Flow E2E (mocked providers)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock provider availability to show Google Drive option in the UI.
    await page.route('**/api/cloud-import/providers**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          s3: { enabled: true, requiresAuth: false },
          gdrive: { enabled: true, requiresAuth: true }
        })
      });
    });

    // Mock analysis job start
    await page.route('**/api/cloud-import/analyze**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: 'analysis_test_1', status: 'analyzing' })
      });
    });

    // Mock analysis job polling (analyzing -> completed)
    let pollCount = 0;
    await page.route('**/api/cloud-import/analysis-jobs/analysis_test_1**', async (route) => {
      pollCount += 1;

      if (pollCount < 2) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jobId: 'analysis_test_1',
            status: 'analyzing',
            provider: 'gdrive',
            url: 'https://drive.google.com/drive/folders/FAKE_FOLDER',
            filesDiscovered: 1,
            totalSize: 10,
            fileTypes: { '.pdf': 1 },
            pagesProcessed: 1,
            error: null,
            startTime: Date.now(),
            endTime: null
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'analysis_test_1',
          status: 'completed',
          provider: 'gdrive',
          url: 'https://drive.google.com/drive/folders/FAKE_FOLDER',
          filesDiscovered: 2,
          totalSize: 15,
          fileTypes: { '.pdf': 1, '.txt': 1 },
          pagesProcessed: 2,
          files: [
            { id: 'g1', name: 'doc1.pdf', size: 10, mimeType: 'application/pdf', extension: '.pdf' },
            { id: 'g2', name: 'doc2.txt', size: 5, mimeType: 'text/plain', extension: '.txt' }
          ],
          error: null,
          startTime: Date.now() - 50,
          endTime: Date.now()
        })
      });
    });

    // Mock cloud import start
    await page.route('**/api/cloud-import/import**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId: 'job_cloud_test_1',
          message: 'Cloud import job started',
          totalFiles: 1
        })
      });
    });

    // Mock job status polling (UploadProgressModal)
    await page.route('**/api/upload-jobs/job_cloud_test_1**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'job_cloud_test_1',
          status: 'completed',
          totalFiles: 1,
          processedFiles: 1,
          successfulFiles: 1,
          failedFiles: 0,
          currentFile: null,
          currentStage: null,
          startTime: Date.now() - 100,
          endTime: Date.now(),
          source: 'cloud',
          provider: 'gdrive',
          filesTotal: 1,
          filesOffset: 0,
          filesLimit: 0,
          files: []
        })
      });
    });

    await page.route('**/api/upload-jobs/job_cloud_test_1/files?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'job_cloud_test_1',
          filesTotal: 1,
          offset: 0,
          limit: 200,
          files: [{ name: 'doc1.pdf', status: 'success', id: 'doc_g1', error: null, bucket: null }]
        })
      });
    });

    // Clear persisted client state before app code runs.
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
  });

  test('analyze Google Drive folder and start import (mocked)', async ({ page }) => {
    // Open upload modal
    await page.locator('button').filter({ hasText: 'Add Document' }).first().click();
    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 5000 });

    // Switch to Cloud Import
    await page.locator('button').filter({ hasText: 'Cloud Import' }).click();

    // Select Google Drive provider (visible because providers endpoint is mocked)
    await page.locator('button').filter({ hasText: 'Google Drive' }).click();

    // Enter a folder URL
    const cloudSection = page.locator('.cloud-import-section');
    await cloudSection
      .getByPlaceholder('https://drive.google.com/drive/folders/FOLDER_ID')
      .fill('https://drive.google.com/drive/folders/FAKE_FOLDER');

    // Start analysis
    await page.locator('button').filter({ hasText: 'Analyze Folder' }).click();

    // Analysis modal should appear and then close after completion
    await expect(page.locator('.analysis-modal-overlay')).toBeVisible({ timeout: 5000 });

    // Folder analysis results should appear
    await expect(page.locator('.analysis-results')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.analysis-results')).toContainText(/Total Files/i);
    await expect(page.locator('.analysis-results')).toContainText(/2/);

    // Choose "Import first" and set to 1
    await cloudSection.locator('input[type="radio"][value="first"]').check();
    await cloudSection.locator('input[type="number"]').first().fill('1');

    // Submit (starts import job)
    await page.locator('button[type="submit"]').first().click();

    // Progress modal should appear and show completed
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.modal-overlay')).toContainText(/completed|success/i, { timeout: 10000 });
  });
});
