import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureEditorReady } from '../helpers/mock-auth';

test('formatting toolbar exists in editor', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureEditorReady(page);
  await expect(page.locator('#formattingBar')).toBeAttached();
});
