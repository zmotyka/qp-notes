import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady, openAIFromCurrentViewport } from '../helpers/mock-auth';

test('webllm model catalog reachable', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await openAIFromCurrentViewport(page);
  await page.evaluate(() => {
    document.getElementById('btnAIModels')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#modelCatalogOverlay')).toBeVisible();
});
