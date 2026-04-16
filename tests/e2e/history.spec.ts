import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureEditorReady } from '../helpers/mock-auth';

test('history overlay opens', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureEditorReady(page);
  await page.locator('#btnHistory').click();
  await expect(page.locator('#historyOverlay')).toBeVisible();
});
