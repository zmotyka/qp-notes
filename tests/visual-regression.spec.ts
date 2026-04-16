import { test, expect, type Page } from '@playwright/test';
import { installMockEnvironment, gotoApp, ensureEditorReady, ensureShellReady } from './helpers/mock-auth';

const states: Array<{ name: string; selector: string; prepare?: (page: Page) => Promise<void> }> = [
  {
    name: 'login-screen',
    selector: '.auth-screen',
    prepare: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem('e2e-disable-bypass', '1');
        localStorage.removeItem('e2e-bypass-auth');
      });
      await page.reload();
    },
  },
  { name: 'app-root', selector: '#app' },
  { name: 'shell-ready', selector: '.app-body', prepare: async (page) => { await ensureShellReady(page); } },
  { name: 'editor-ready', selector: '#editorContainer', prepare: async (page) => { await ensureEditorReady(page); } },
  { name: 'editor-split', selector: '#editorContainer', prepare: async (page) => { await ensureEditorReady(page); await page.locator('.editor-tab[data-view="split"]').click(); } },
  { name: 'editor-preview', selector: '#previewPane', prepare: async (page) => { await ensureEditorReady(page); await page.locator('.editor-tab[data-view="preview"]').click(); } },
  { name: 'settings-modal', selector: '#settingsOverlay', prepare: async (page) => { await ensureShellReady(page); await page.locator('#btnSettings').click(); } },
  { name: 'command-palette', selector: '#commandPaletteOverlay', prepare: async (page) => { await ensureShellReady(page); await page.keyboard.press('Control+K'); } },
  {
    name: 'templates-modal',
    selector: '#noteTemplatesOverlay',
    prepare: async (page) => {
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
    },
  },
  { name: 'history-modal', selector: '#historyOverlay', prepare: async (page) => { await ensureEditorReady(page); await page.locator('#btnHistory').click(); } },
  { name: 'ai-panel', selector: '#aiPanel', prepare: async (page) => { await ensureShellReady(page); await page.locator('#btnAIFab').click(); } },
  { name: 'model-catalog', selector: '#modelCatalogOverlay', prepare: async (page) => { await ensureShellReady(page); await page.locator('#btnAIFab').click(); await page.locator('#btnAIModels').click(); } },
  { name: 'notes-tree', selector: '#sidebarTree', prepare: async (page) => { await ensureShellReady(page); } },
  { name: 'status-bar', selector: '.statusbar', prepare: async (page) => { await ensureShellReady(page); } },
];

test.describe('visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await installMockEnvironment(page);
    await gotoApp(page);
  });

  for (const state of states) {
    test(`captures ${state.name}`, async ({ page }, testInfo) => {
      if (state.prepare) await state.prepare(page);
      const target = page.locator(state.selector).first();
      await expect(target).toBeVisible();
      await expect(page).toHaveScreenshot(`${testInfo.project.name}-${state.name}.png`, { fullPage: true });
    });
  }
});
