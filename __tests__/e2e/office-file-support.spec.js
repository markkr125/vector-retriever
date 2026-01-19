import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import JSZip from 'jszip';
import os from 'os';
import path from 'path';
import XLSX from 'xlsx';

async function writeTempXlsx() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Age'],
    ['Alice', 30],
    ['Bob', 40]
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'People');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filePath = path.join(os.tmpdir(), `copilot-e2e-${Date.now()}-table.xlsx`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function writeTempPptxWithNotes() {
  const zip = new JSZip();

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Slide text</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`;

  const notesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:t>Note text</a:t>
</p:notes>`;

  zip.file('ppt/slides/slide1.xml', slideXml);
  zip.file('ppt/slides/_rels/slide1.xml.rels', relsXml);
  zip.file('ppt/notesSlides/notesSlide1.xml', notesXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const filePath = path.join(os.tmpdir(), `copilot-e2e-${Date.now()}-notes.pptx`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

test.describe('Office file support (E2E)', () => {
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
  });

  test('file inputs include csv/xlsx/pptx/rtf in accept lists', async ({ page }) => {
    // Upload modal accept list
    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();

    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 10000 });

    const uploadInput = page.locator('.upload-modal input[type="file"]').first();
    const accept = (await uploadInput.getAttribute('accept')) || '';

    expect(accept).toContain('.csv');
    expect(accept).toContain('.xlsx');
    expect(accept).toContain('.pptx');
    expect(accept).toContain('.rtf');

    // Close modal (avoid Escape flakiness)
    const closeBtn = page.locator('.upload-modal .close-btn').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(page.locator('.upload-modal-overlay')).toBeHidden({ timeout: 5000 });
    }

    // By-document accept list
    await page.locator('.nav-buttons button').filter({ hasText: /Search/ }).first().click().catch(() => {});
    await expect(page.locator('.search-form')).toBeVisible({ timeout: 5000 });

    await page.locator('.search-form select').first().selectOption('by-document');
    const byDocInput = page.locator('#search-file-input');
    await expect(byDocInput).toHaveCount(1, { timeout: 5000 });

    const byDocAccept = (await byDocInput.getAttribute('accept')) || '';
    expect(byDocAccept).toContain('.csv');
    expect(byDocAccept).toContain('.xlsx');
    expect(byDocAccept).toContain('.pptx');
    expect(byDocAccept).toContain('.rtf');
  });

  test('uploads csv/xlsx/pptx/rtf successfully via UI', async ({ page }) => {
    const xlsxPath = await writeTempXlsx();
    const pptxPath = await writeTempPptxWithNotes();

    const uploadBtn = page.locator('button').filter({ hasText: 'Add Document' }).first();
    await uploadBtn.click();
    await expect(page.locator('.upload-modal-overlay')).toBeVisible({ timeout: 10000 });

    const fileInput = page.locator('.upload-modal input[type="file"]').first();
    await fileInput.setInputFiles([
      path.join(__dirname, '../fixtures/documents/test_table.csv'),
      path.join(__dirname, '../fixtures/documents/test_notes.rtf'),
      xlsxPath,
      pptxPath
    ]);

    const submitBtn = page.locator('.upload-modal button[type="submit"]').first();
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    await submitBtn.click();

    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.modal-overlay')).toContainText(/success|completed/i, { timeout: 60000 });

    const closeBtn = page.locator('.modal-overlay button').filter({ hasText: 'Close' }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }

    // Verify files appear in browse (best-effort, browse is paginated)
    await page.locator('.nav-buttons button').filter({ hasText: /Browse/ }).first().click().catch(() => {});
    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });

    const bodyText = (await page.textContent('body')) || '';
    expect(bodyText).toContain('test_table.csv');
    expect(bodyText).toContain('test_notes.rtf');
  });

  test('by-document search works with a CSV file (non-image)', async ({ page }) => {
    await page.locator('.nav-buttons button').filter({ hasText: /Search/ }).first().click().catch(() => {});
    await expect(page.locator('.search-form')).toBeVisible({ timeout: 5000 });

    await page.locator('.search-form select').first().selectOption('by-document');

    const fileInput = page.locator('#search-file-input');
    await expect(fileInput).toHaveCount(1, { timeout: 5000 });
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/documents/test_table.csv'));

    const searchBtn = page.locator('.search-form button.btn.btn-primary').filter({ hasText: /Search/ }).first();
    await expect(searchBtn).toBeEnabled({ timeout: 5000 });
    await searchBtn.click();

    await expect(page.locator('.result-card').first()).toBeVisible({ timeout: 15000 });
  });
});
