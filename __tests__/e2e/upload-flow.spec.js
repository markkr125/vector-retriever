import { expect, test } from '@playwright/test';
import path from 'path';

test.describe('Upload Flow E2E', () => {
  test.beforeEach(async ({ page, request }) => {
    // Ensure prior runs don't leave the app in "Uploading..." state.
    try {
      const activeJob = await request.get('http://localhost:3001/api/upload-jobs/active');
      const job = await activeJob.json();
      if (job?.id) {
        await request.post(`http://localhost:3001/api/upload-jobs/${job.id}/stop`).catch(() => {});
      }
    } catch {
      // Ignore if server isn't ready yet; webServer should start it.
    }

    // Clear persisted client state before app code runs.
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
    await page.waitForTimeout(500);
  });

  test('upload text file and track progress', async ({ page }) => {
    // Wait for page to be ready
    await page.waitForTimeout(1000);
    
    // Click upload button
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    // Modal should open
    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 5000 });

    // Create test file
    const testFilePath = path.join(__dirname, '../fixtures/documents/test_hotel.txt');

    // Select file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Submit upload
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Progress modal should appear
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    // Wait for upload to complete (max 30 seconds)
    await expect(page.locator('.modal-overlay')).toContainText(/success|completed/i, {
      timeout: 30000
    });

    // Close progress modal
    const closeBtn = page.locator('.modal-overlay button').filter({ hasText: 'Close' });
    await closeBtn.click();

    // Verify document appears in browse view
    const browseBtn = page.locator('button').filter({ hasText: 'Browse' });
    if (await browseBtn.isVisible()) {
      await browseBtn.click();
      await page.waitForTimeout(2000);

      // Should see the uploaded file
      const text = await page.textContent('body');
      expect(text).toContain('test_hotel.txt');
    }
  });

  test('upload multiple files', async ({ page }) => {
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible();

    // Select multiple files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, '../fixtures/documents/test_hotel.txt'),
      path.join(__dirname, '../fixtures/documents/test_essay.txt')
    ]);

    // Submit
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Progress modal shows multiple files
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5000 });

    // Should show file count (2 files)
    await expect(page.locator('.modal-overlay')).toContainText(/2/);

    // Wait for completion
    await expect(page.locator('.modal-overlay')).toContainText(/success|completed/i, {
      timeout: 30000
    });
  });

  test('stop upload in progress', async ({ page }) => {
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible();

    // Upload multiple files to have time to stop
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, '../fixtures/documents/test_hotel.txt'),
      path.join(__dirname, '../fixtures/documents/test_essay.txt'),
      path.join(__dirname, '../fixtures/documents/test_pii_clean.txt')
    ]);

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Wait a moment then click stop
    await page.waitForTimeout(500);

    const stopBtn = page.locator('button.stop-btn').first();
    if (await stopBtn.isVisible()) {
      // Must accept the confirm() dialog BEFORE clicking.
      page.once('dialog', dialog => dialog.accept());
      await stopBtn.click();

      // Should show stopped status message (rendered by UploadProgressModal).
      await expect(page.locator('.status-message.stopped')).toContainText(/upload stopped/i, {
        timeout: 10000
      });
    }
  });

  test('upload with text input instead of file', async ({ page }) => {
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible();

    // Switch to text input tab
    const textInputTab = page.locator('button').filter({ hasText: 'Paste Text' });
    await textInputTab.click();

    // Filename is required in text mode
    const filename = page.locator('.upload-modal input[placeholder="my_document.txt"], .upload-modal input[placeholder*=".txt" i]').first();
    await expect(filename).toBeVisible({ timeout: 5000 });
    await filename.fill('text_upload_test.txt');

    // Enter text content
    const textarea = page.locator('.upload-modal textarea.textarea, .upload-modal textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('This is test content uploaded via text input.');

    // Submit
    const submitBtn = page.locator('.upload-modal button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    // Text mode uses the legacy /documents/add endpoint (no progress modal).
    await expect(page.locator('.upload-modal .success-message')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.upload-modal .success-message')).toContainText(/success|added/i);

    // Modal auto-closes shortly after success
    await expect(page.locator('.upload-modal-overlay')).toBeHidden({ timeout: 10000 });
  });

  test('upload with auto-categorization enabled', async ({ page }) => {
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible();

    // Enable auto-categorization checkbox if present
    const autoCategoryCheckbox = page.locator('input[type="checkbox"][name="autoCategorize"]');
    if (await autoCategoryCheckbox.isVisible()) {
      await autoCategoryCheckbox.check();
    }

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/documents/test_hotel.txt'));

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Wait for completion (may take longer with categorization)
    await expect(page.locator('.modal-overlay')).toContainText(/success|uploaded/i, {
      timeout: 45000
    });
  });

  test('displays file-by-file status during upload', async ({ page }) => {
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible();

    // Upload multiple files
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      path.join(__dirname, '../fixtures/documents/test_hotel.txt'),
      path.join(__dirname, '../fixtures/documents/test_essay.txt')
    ]);

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Should see individual file statuses with icons
    // Look for status icons: ⏱️ ⏳ ✅ ❌
    const modalContent = page.locator('.modal-overlay');
    
    // At least one of the status indicators should be visible
    await expect(modalContent).toContainText(/test_hotel\.txt|test_essay\.txt/);

    // Wait for completion
    await expect(modalContent).toContainText(/success|uploaded/i, { timeout: 30000 });
  });

  test('handles upload button state during active upload', async ({ page }) => {
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/documents/test_hotel.txt'));

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Progress modal visible
    await expect(page.locator('.modal-overlay')).toBeVisible();

    // Close the progress modal (upload continues in background)
    const closeBtn = page.locator('.modal-overlay button').filter({ hasText: 'Close' });
    await closeBtn.click();

    // Upload button in header should show "Uploading..."
    await expect(page.locator('button').filter({ hasText: 'Uploading' })).toBeVisible({ timeout: 2000 });
  });
});
