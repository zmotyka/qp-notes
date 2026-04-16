import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady, ensureEditorReady } from '../helpers/mock-auth';

test.describe('note lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await installMockEnvironment(page);
    await gotoApp(page);
    await ensureShellReady(page);
  });

  test('creates and opens a new note in editor', async ({ page }) => {
    await page.locator('#btnNewNote').click();
    await ensureEditorReady(page);
    await expect(page.locator('#noteTitle')).toBeVisible();
    await expect(page.locator('#editorPane')).toBeVisible();
  });
});
