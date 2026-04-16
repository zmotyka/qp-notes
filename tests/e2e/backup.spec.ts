import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('backup controls present in settings', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await page.locator('#btnSettings').click();
  await page.locator('.settings-tab-btn[data-settings-tab-button="sync"]').click();
  await expect(page.locator('#btnExport')).toBeAttached();
  await expect(page.locator('#importFileInput')).toBeAttached();
});
