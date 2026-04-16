import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('folder controls exist', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  const mobileExplorer = page.locator('#btnMobileExplorer');
  if (await mobileExplorer.isVisible().catch(() => false)) {
    await mobileExplorer.click();
  }
  await expect(page.locator('.explorer-tab[data-explorer-tab="folders"]')).toBeAttached();
  await expect(page.locator('#foldersList')).toBeAttached();
});
