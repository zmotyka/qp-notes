import { test, expect } from '@playwright/test';
import { gotoApp, installMockEnvironment, ensureShellReady } from '../helpers/mock-auth';

test('search input shows syntax hint', async ({ page }) => {
  await installMockEnvironment(page);
  await gotoApp(page);
  await ensureShellReady(page);
  const input = page.locator('#searchInput');
  await expect(input).toHaveAttribute('placeholder', /tag:, date:/);
});
