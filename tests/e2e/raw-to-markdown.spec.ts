import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureEditorReady } from '../helpers/mock-auth';

test('raw to markdown surface is available', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureEditorReady(page);
  await expect(page.locator('#rawEditorInput')).toBeVisible();
  await expect(page.locator('#btnRegenerateMarkdown')).toBeVisible();
});
