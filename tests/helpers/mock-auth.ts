import type { Page } from '@playwright/test';

export async function installMockEnvironment(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-mode', 'true');
    if (localStorage.getItem('e2e-disable-bypass') !== '1') {
      localStorage.setItem('e2e-bypass-auth', '1');
    }
    localStorage.setItem('e2e-user-id', 'e2e-user');
    localStorage.setItem('high-contrast', 'false');
    localStorage.setItem('reduce-motion', 'true');
    localStorage.setItem('focus-ring-always', 'true');
  });
}

export async function gotoApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
}

export async function ensureAppLoaded(page: Page): Promise<void> {
  const loginVisible = await page.locator('.auth-screen').isVisible().catch(() => false);
  if (loginVisible) {
    await page.locator('.auth-screen').waitFor({ state: 'visible' });
    return;
  }
  await page.locator('#app').waitFor({ state: 'visible' });
}

export async function ensureShellReady(page: Page): Promise<void> {
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('#btnNewNote').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#searchInput').waitFor({ state: 'visible', timeout: 20000 });
}

export async function ensureEditorReady(page: Page): Promise<void> {
  await ensureShellReady(page);
  const title = page.locator('#noteTitle');
  if (await title.isVisible().catch(() => false)) return;

  const emptyNew = page.locator('#btnEmptyNew');
  if (await emptyNew.isVisible().catch(() => false)) {
    await emptyNew.click();
  } else {
    await page.locator('#btnNewNote').click();
  }

  await page.locator('#noteTitle').waitFor({ state: 'visible', timeout: 15000 });
}
