import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('keyboard shortcuts overlay toggles', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await page.keyboard.press('Control+/');
  await expect(page.locator('#shortcutsOverlay')).toBeVisible();
});
