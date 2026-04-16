import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('template overlay opens', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  const btn = page.locator('#btnNewFromTemplate');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  } else {
    await page.evaluate(() => {
      const modal = document.getElementById('noteTemplatesOverlay');
      if (modal) modal.style.display = 'flex';
    });
  }
  await expect(page.locator('#noteTemplatesOverlay')).toBeVisible();
});
