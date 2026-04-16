import type { Page } from '@playwright/test';

export async function installMockEnvironment(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('e2e-mode', 'true');
    if (localStorage.getItem('e2e-disable-bypass') !== '1') {
      localStorage.setItem('e2e-bypass-auth', '1');
    }
    localStorage.setItem('e2e-user-id', 'e2e-user');
    localStorage.setItem('e2e-mock-model-catalog', 'true');
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

async function closeTransientMenus(page: Page): Promise<void> {
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('body').click({ position: { x: 8, y: 8 } }).catch(() => {});
}

export async function openAIFromCurrentViewport(page: Page): Promise<void> {
  await closeTransientMenus(page);
  const topbarAI = page.locator('#btnAI');
  if (await topbarAI.isVisible().catch(() => false)) {
    await topbarAI.click({ force: true });
    return;
  }

  const mobileAI = page.locator('#btnAIMobileExpand');
  if (await mobileAI.isVisible().catch(() => false)) {
    await page.evaluate(() => {
      document.getElementById('btnAIMobileExpand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    return;
  }

  await page.evaluate(() => {
    document.getElementById('btnAI')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export async function openEditorProperties(page: Page): Promise<void> {
  await closeTransientMenus(page);
  const propertiesBtn = page.locator('#btnToggleProperties');
  if (await propertiesBtn.isVisible().catch(() => false)) {
    await propertiesBtn.click({ force: true });
  }
  const row = page.locator('#editorMetaRow');
  if (!(await row.isVisible().catch(() => false))) {
    await page.evaluate(() => {
      const rowEl = document.getElementById('editorMetaRow');
      const btnEl = document.getElementById('btnToggleProperties');
      rowEl?.removeAttribute('hidden');
      btnEl?.setAttribute('aria-expanded', 'true');
      if (btnEl) btnEl.textContent = 'Hide Properties';
    });
  }
}

export async function openFormattingToolbar(page: Page): Promise<void> {
  await closeTransientMenus(page);
  const formatBtn = page.locator('#btnToggleFormatBar');
  if (await formatBtn.isVisible().catch(() => false)) {
    const expanded = await formatBtn.getAttribute('aria-expanded');
    if (expanded !== 'true') await formatBtn.click({ force: true });
    return;
  }

  await page.evaluate(() => {
    document.getElementById('btnToggleFormatBar')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
