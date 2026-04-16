import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady, openAIFromCurrentViewport } from '../helpers/mock-auth';

test('ai panel controls render', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  await openAIFromCurrentViewport(page);
  await expect(page.locator('#aiPanel')).toBeVisible();
});
