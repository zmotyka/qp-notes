import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('command palette opens via ctrl+k', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await page.keyboard.press('Control+K');
  await expect(page.locator('#commandPaletteOverlay')).toBeVisible();
});
