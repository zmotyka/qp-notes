import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('settings modal opens', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await page.locator('#btnSettings').click();
  await expect(page.locator('#settingsOverlay')).toBeVisible();
});
