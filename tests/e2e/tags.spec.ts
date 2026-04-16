import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureEditorReady, openEditorProperties } from '../helpers/mock-auth';

test('tag editor control exists', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureEditorReady(page);
  await openEditorProperties(page);
  await expect(page.locator('#tagTextInput')).toBeVisible();
});
