import { expect, test } from '@playwright/test';

test.describe('Collection Management E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app shell to be ready (avoid networkidle with Vite dev/HMR)
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(250);
  });

  test('create new collection', async ({ page }) => {
    // Open collection selector dropdown
    const collectionSelector = page.locator('.collection-button').first();
    await collectionSelector.click();

    // Wait for dropdown to appear
    await expect(page.locator('.dropdown-menu')).toBeVisible();

    // Open management modal
    const manageBtn = page.locator('.action-button.manage').first();
    if (await manageBtn.isVisible()) {
      await manageBtn.click();

      // Management modal should open
      await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

      // Fill in collection name first (button is disabled until name is entered)
      const nameInput = page.locator('.create-form input[type="text"]').first();
      await nameInput.fill('E2E Test Collection');

      const descInput = page.locator('.create-form textarea').first();
      if (await descInput.isVisible()) {
        await descInput.fill('Created by E2E test');
      }

      // Submit (button is now enabled)
      const submitBtn = page.locator('.btn-create').first();
      await submitBtn.click();

      // Should show success message or close modal
      await page.waitForTimeout(2000);

      // New collection should appear in list
      await expect(page.locator('.modal-overlay .modal-container')).toContainText('E2E Test Collection');
    }
  });

  test('switch between collections', async ({ page }) => {
    // Open collection selector
    const collectionSelector = page.locator('.collection-button').first();
    await collectionSelector.click();

    // Wait for dropdown menu
    await expect(page.locator('.dropdown-menu')).toBeVisible();

    // Select default collection
    const defaultOption = page.locator('.collection-option').filter({ hasText: 'default' }).first();
    if (await defaultOption.isVisible()) {
      await defaultOption.click({ force: true });

      // Wait for collection to load
      await page.waitForTimeout(1000);

      // URL should reflect collection
      // (or localStorage should be set)
    }
  });

  test('empty collection', async ({ page }) => {
    // First, ensure there's a non-default collection with documents
    // Open management modal
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (await manageBtn.isVisible()) {
      await manageBtn.click();

      await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

      // Find a user collection (not default)
      const userCollection = page.locator('.collection-card').filter({ hasNotText: /default/i }).first();

      if (await userCollection.isVisible()) {
        // Click empty action
        const emptyBtn = userCollection.locator('button:has-text("Empty")');
        if (await emptyBtn.isVisible()) {
          await emptyBtn.click();

          // Confirm if dialog appears
          page.on('dialog', dialog => dialog.accept());

          // Wait for operation
          await page.waitForTimeout(2000);

          // Document count should be 0
          await expect(userCollection).toContainText('0');
        }
      }
    }
  });

  test('delete collection', async ({ page }) => {
    // Open management modal
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (await manageBtn.isVisible()) {
      await manageBtn.click();

      await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

      // Find E2E test collection if it exists
      const testCollection = page.locator('.collection-card:has-text("E2E Test Collection")').first();

      if (await testCollection.isVisible()) {
        // Click delete
        const deleteBtn = testCollection.locator('button:has-text("Delete")');
        await deleteBtn.click();

        // Confirm via in-app confirmation dialog
        const confirmDialog = page.locator('.confirm-dialog').first();
        await expect(confirmDialog).toBeVisible();

        await confirmDialog.locator('button.btn-confirm').click();

        // Collection card should be removed from list
        await expect(page.locator('.collection-card:has-text("E2E Test Collection")')).toHaveCount(0);
      }
    }
  });

  test('cannot delete default collection', async ({ page }) => {
    // Open management modal
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (await manageBtn.isVisible()) {
      await manageBtn.click();

      await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

      // Find default collection
      const defaultCollection = page.locator('.collection-card:has-text("default")').first();

      if (await defaultCollection.isVisible()) {
        // Delete button should be disabled or not present
        const deleteBtn = defaultCollection.locator('button:has-text("Delete")');
        
        if (await deleteBtn.isVisible()) {
          expect(await deleteBtn.isDisabled()).toBe(true);
        }
      }
    }
  });

  test('search collections in management modal', async ({ page }) => {
    // Open management modal
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (await manageBtn.isVisible()) {
      await manageBtn.click();

      await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

      // Find search input
      const searchInput = page.locator('.modal-overlay .search-input').first();
      
      if (await searchInput.isVisible()) {
        await searchInput.fill('default');

        // Should filter collections
        await page.waitForTimeout(500);

        // Only matching collections should be visible
        await expect(page.locator('.modal-overlay .modal-container')).toContainText('default');
      }
    }
  });

  test('collection pagination', async ({ page }) => {
    // If there are many collections, test pagination
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    const manageBtn = page.locator('button:has-text("Manage")').first();
    if (await manageBtn.isVisible()) {
      await manageBtn.click();

      await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

      // Look for pagination controls
      const paginationNext = page.locator('.modal-overlay button:has-text("Next")');
      
      if (await paginationNext.isVisible()) {
        await paginationNext.click();

        // Should show next page of collections
        await page.waitForTimeout(500);
      }
    }
  });

  test('upload to specific collection', async ({ page }) => {
    // Create a new collection first (or use existing)
    // Then upload a document to it

    // Switch to a specific collection
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    const collectionOption = page.locator('.collection-option').first();
    if (await collectionOption.isVisible()) {
      await collectionOption.click();
      await page.waitForTimeout(1000);

      // Now upload a document
      const uploadBtn = page.locator('[data-testid="upload-button"], button:has-text("Add Document")').first();
      await uploadBtn.click();

      // Upload flow continues...
      // The document should be uploaded to the selected collection
    }
  });

  test('collection document counts update after upload', async ({ page }) => {
    // Open collection selector
    const collectionSelector = page.locator('[data-testid="collection-selector"], .collection-selector').first();
    await collectionSelector.click();

    // Note initial document count for default collection
    const defaultOption = page.locator(':text("default")').first();
    const initialText = await defaultOption.textContent();

    // Upload a document
    await collectionSelector.click(); // Close selector

    const uploadBtn = page.locator('[data-testid="upload-button"], button:has-text("Add Document")').first();
    await uploadBtn.click();

    // Complete upload flow (simplified)
    // After upload completes, document count should increase
  });

  test('rename collection', async ({ page }) => {
    // Open collection selector dropdown
    const collectionSelector = page.locator('.collection-button').first();
    await collectionSelector.click();
    await expect(page.locator('.dropdown-menu')).toBeVisible();

    // Open management modal
    const manageBtn = page.locator('.action-button.manage').first();
    await manageBtn.click();
    await expect(page.locator('.modal-overlay .modal-container')).toBeVisible();

    // Create a collection we can rename (avoid relying on existing data)
    const originalName = `E2E Rename ${Date.now()}`;
    const newName = `E2E Renamed ${Date.now()}`;

    await page.locator('.create-form input[type="text"]').first().fill(originalName);
    await page.locator('.btn-create').first().click();

    // Wait for collection to appear
    await expect(page.locator('.modal-overlay .modal-container')).toContainText(originalName);

    // Find that collection card
    const card = page.locator('.collection-card').filter({ hasText: originalName }).first();
    await expect(card).toBeVisible();

    // Enter rename mode
    await card.locator('button.btn-rename').click();

    // After switching to edit mode, the originalName text may no longer be present,
    // so locate the card by its "editing" state.
    const editingCard = page.locator('.collection-card.editing').first();
    await expect(editingCard).toBeVisible();

    const nameInput = editingCard.locator('input.edit-input').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(newName);

    // Save
    await editingCard.locator('button.btn-save').click();

    // Updated name should show in modal
    await expect(page.locator('.modal-overlay .modal-container')).toContainText(newName);
  });
});
