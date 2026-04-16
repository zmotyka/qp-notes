import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('ai panel controls render', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await page.locator('#btnAIFab').click();
  await expect(page.locator('#aiPanel')).toBeVisible();
});
