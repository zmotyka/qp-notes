import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureEditorReady } from '../helpers/mock-auth';

test('preview pane renders in split workflow', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureEditorReady(page);
  await page.locator('.editor-tab[data-view="split"]').click();
  await expect(page.locator('#previewPane')).toBeVisible();
});
