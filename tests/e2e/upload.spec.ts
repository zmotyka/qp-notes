import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureEditorReady, openFormattingToolbar } from '../helpers/mock-auth';

test('upload controls present', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureEditorReady(page);
  await openFormattingToolbar(page);
  await expect(page.locator('#btnUpload')).toBeVisible();
});
