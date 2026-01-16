import { expect, test } from '@playwright/test';

test.describe('Cloud Import Flow E2E (mocked providers)', () => {
  test.beforeEach(async ({ page }) => {
    const NORMAL_FOLDER_URL = 'https://drive.google.com/drive/folders/FAKE_FOLDER';
    const PAUSE_FOLDER_URL = 'https://drive.google.com/drive/folders/FAKE_FOLDER_PAUSE';
    const isPauseUrl = (value) => typeof value === 'string' && value.includes('FAKE_FOLDER_PAUSE');

    const analysisState = {
      // normal analyze -> completed
      analysis_test_1: { status: 'analyzing', pollCount: 0, provider: 'gdrive', url: NORMAL_FOLDER_URL },
      // pause -> resume -> completed
      analysis_pause_1: { status: 'analyzing', pollCount: 0, provider: 'gdrive', url: PAUSE_FOLDER_URL, pausedOnce: false, resumedOnce: false }
    };

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

    // Mock by-url lookup for resumable analysis.
    await page.route('**/api/cloud-import/analysis-jobs/by-url**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const provider = requestUrl.searchParams.get('provider');
      const url = requestUrl.searchParams.get('url');

      if (provider === 'gdrive' && isPauseUrl(url)) {
        const pauseJob = analysisState.analysis_pause_1;
        if (pauseJob.status === 'paused') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              found: true,
              jobId: 'analysis_pause_1',
              status: 'paused',
              provider: 'gdrive',
              url: PAUSE_FOLDER_URL,
              filesDiscovered: 2,
              totalSize: 15,
              fileTypes: { '.pdf': 1, '.txt': 1 },
              pagesProcessed: 1,
              startTime: Date.now() - 1000,
              endTime: Date.now() - 10
            })
          });
          return;
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ found: false })
      });
    });

    // Mock analysis job start (supports normal + pause/resume URLs).
    await page.route('**/api/cloud-import/analyze**', async (route) => {
      const body = route.request().postDataJSON?.() || {};
      const url = body?.url;

      if (isPauseUrl(url)) {
        const pauseJob = analysisState.analysis_pause_1;
        if (pauseJob.status === 'paused') {
          pauseJob.status = 'analyzing';
          pauseJob.pollCount = 0;
          pauseJob.resumedOnce = true;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ jobId: 'analysis_pause_1', status: 'analyzing', resumed: true })
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobId: 'analysis_pause_1', status: 'analyzing' })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobId: 'analysis_test_1', status: 'analyzing' })
      });
    });

    // Mock pause endpoint.
    // Note: Axios interceptor adds `?collection=...` to all requests, so match query params too.
    await page.route('**/api/cloud-import/analysis-jobs/*/pause*', async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.includes('/analysis-jobs/analysis_pause_1/pause')) {
        analysisState.analysis_pause_1.status = 'paused';
        analysisState.analysis_pause_1.pausedOnce = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ jobId: 'analysis_pause_1', status: 'paused' })
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' })
      });
    });

    // Mock analysis job polling and status reads.
    // Important: do NOT match /pause or other sub-routes.
    await page.route('**/api/cloud-import/analysis-jobs/analysis_*', async (route) => {
      const requestUrl = new URL(route.request().url());

      const pathParts = requestUrl.pathname.split('/');
      const jobId = pathParts[pathParts.length - 1];
      const includeFiles = requestUrl.searchParams.get('includeFiles') === '1' || requestUrl.searchParams.get('includeFiles') === 'true';
      const state = analysisState[jobId];

      if (!state) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Analysis job not found' })
        });
        return;
      }

      state.pollCount += 1;

      if (jobId === 'analysis_test_1') {
        if (state.pollCount < 2) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId,
              status: 'analyzing',
              provider: state.provider,
              url: state.url,
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
            jobId,
            status: 'completed',
            provider: state.provider,
            url: state.url,
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
        return;
      }

      if (jobId === 'analysis_pause_1') {
        // Before pause, stay in analyzing.
        if (state.status === 'analyzing' && !state.pausedOnce) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId,
              status: 'analyzing',
              provider: state.provider,
              url: state.url,
              filesDiscovered: 2,
              totalSize: 15,
              fileTypes: { '.pdf': 1, '.txt': 1 },
              pagesProcessed: 1,
              error: null,
              startTime: Date.now(),
              endTime: null
            })
          });
          return;
        }

        // While paused: only include files if includeFiles=1
        if (state.status === 'paused') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId,
              status: 'paused',
              provider: state.provider,
              url: state.url,
              filesDiscovered: 2,
              totalSize: 15,
              fileTypes: { '.pdf': 1, '.txt': 1 },
              pagesProcessed: 1,
              files: includeFiles
                ? [
                    { id: 'g1', name: 'doc1.pdf', size: 10, mimeType: 'application/pdf', extension: '.pdf' },
                    { id: 'g2', name: 'doc2.txt', size: 5, mimeType: 'text/plain', extension: '.txt' }
                  ]
                : undefined,
              error: null,
              startTime: Date.now() - 500,
              endTime: Date.now() - 10
            })
          });
          return;
        }

        // After resume: analyzing once, then completed
        if (state.status === 'analyzing' && state.resumedOnce) {
          if (state.pollCount < 2) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jobId,
                status: 'analyzing',
                provider: state.provider,
                url: state.url,
                filesDiscovered: 3,
                totalSize: 25,
                fileTypes: { '.pdf': 2, '.txt': 1 },
                pagesProcessed: 2,
                error: null,
                startTime: Date.now() - 50,
                endTime: null
              })
            });
            return;
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId,
              status: 'completed',
              provider: state.provider,
              url: state.url,
              filesDiscovered: 3,
              totalSize: 25,
              fileTypes: { '.pdf': 2, '.txt': 1 },
              pagesProcessed: 3,
              files: [
                { id: 'g1', name: 'doc1.pdf', size: 10, mimeType: 'application/pdf', extension: '.pdf' },
                { id: 'g2', name: 'doc2.txt', size: 5, mimeType: 'text/plain', extension: '.txt' },
                { id: 'g3', name: 'doc3.pdf', size: 10, mimeType: 'application/pdf', extension: '.pdf' }
              ],
              error: null,
              startTime: Date.now() - 200,
              endTime: Date.now()
            })
          });
          return;
        }
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unhandled analysis job state' })
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

      // Make confirm/alert deterministic for E2E.
      // The UI uses confirm() for cancel/pause flows.
      // eslint-disable-next-line no-undef
      window.confirm = () => true;
      // eslint-disable-next-line no-undef
      window.alert = () => {};
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

  test('pause analysis, use partial results, then continue analysis (mocked)', async ({ page }) => {
    // Open upload modal
    await page.locator('button').filter({ hasText: 'Add Document' }).first().click();
    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 5000 });

    const uploadOverlay = page.locator('.upload-modal-overlay');

    // Switch to Cloud Import
    await page.locator('button').filter({ hasText: 'Cloud Import' }).click();
    await page.locator('button').filter({ hasText: 'Google Drive' }).click();

    const cloudSection = uploadOverlay.locator('.cloud-import-section');
    await cloudSection
      .getByPlaceholder('https://drive.google.com/drive/folders/FOLDER_ID')
      .fill('https://drive.google.com/drive/folders/FAKE_FOLDER_PAUSE');

    // Start analysis and pause it
    await page.locator('button').filter({ hasText: 'Analyze Folder' }).click();
    await expect(page.locator('.analysis-modal-overlay')).toBeVisible({ timeout: 5000 });

    const pauseResponse = page.waitForResponse((resp) => {
      const url = resp.url();
      return url.includes('/api/cloud-import/analysis-jobs/') && url.includes('/pause') && resp.status() === 200;
    });

    await page.locator('button').filter({ hasText: 'Pause & Use Current Results' }).click();
    await pauseResponse;

    // Modal should close after emitting partial results
    await expect(page.locator('.analysis-modal-overlay')).toBeHidden({ timeout: 10000 });

    // Folder analysis results should appear (from partial files)
    await expect(page.locator('.analysis-results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.analysis-results')).toContainText(/Total Files/i);
    await expect(page.locator('.analysis-results')).toContainText(/2/);

    // Close the upload modal to simulate leaving
    await page.locator('.upload-modal .close-btn').click();
    await expect(page.locator('.upload-modal-overlay')).toBeHidden({ timeout: 5000 });

    // Re-open upload modal and re-enter the same URL; by-url lookup should enable Continue
    await page.locator('button').filter({ hasText: 'Add Document' }).first().click();
    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 5000 });

    const uploadOverlay2 = page.locator('.upload-modal-overlay');
    const cloudSection2 = uploadOverlay2.locator('.cloud-import-section');
    await page.locator('button').filter({ hasText: 'Cloud Import' }).click();
    await page.locator('button').filter({ hasText: 'Google Drive' }).click();
    await cloudSection2
      .getByPlaceholder('https://drive.google.com/drive/folders/FOLDER_ID')
      .fill('https://drive.google.com/drive/folders/FAKE_FOLDER_PAUSE');

    await expect(page.locator('button').filter({ hasText: 'Continue Analysis' })).toBeVisible({ timeout: 5000 });

    // Continue analysis
    const resumeResponse = page.waitForResponse(async (resp) => {
      if (resp.status() !== 200) return false;
      const url = resp.url();
      if (!url.includes('/api/cloud-import/analyze')) return false;
      try {
        const json = await resp.json();
        return json?.jobId === 'analysis_pause_1';
      } catch {
        return false;
      }
    });
    await page.locator('button').filter({ hasText: 'Continue Analysis' }).click();
    await resumeResponse;

    // Wait for completion and updated file count
    await expect(page.locator('.analysis-results')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.analysis-results')).toContainText(/3/);
  });
});
