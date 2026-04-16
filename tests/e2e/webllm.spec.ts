import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('webllm model catalog reachable', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await page.locator('#btnAIFab').click();
  await page.locator('#btnAIModels').click();
  await expect(page.locator('#modelCatalogOverlay')).toBeVisible();
});
