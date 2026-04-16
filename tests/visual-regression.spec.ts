import { test, expect, type Page } from '@playwright/test';
import { installMockEnvironment, gotoApp, ensureEditorReady, ensureShellReady, openAIFromCurrentViewport } from './helpers/mock-auth';

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
  { name: 'ai-panel', selector: '#aiPanel', prepare: async (page) => { await ensureShellReady(page); await openAIFromCurrentViewport(page); } },
  {
    name: 'model-catalog',
    selector: '#modelCatalogOverlay',
    prepare: async (page) => {
      await ensureShellReady(page);
      await openAIFromCurrentViewport(page);
      await page.evaluate(() => {
        const overlay = document.getElementById('modelCatalogOverlay') as HTMLElement | null;
        const gpu = document.getElementById('gpuInfo');
        const list = document.getElementById('modelCatalogList');
        if (overlay) overlay.style.display = 'flex';
        if (gpu) gpu.textContent = 'WebGPU: ✓ (Mock GPU)';
        if (list) {
          list.innerHTML = `
            <div class="model-card" style="border:1px solid var(--accent);border-radius:8px;padding:12px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <strong style="font-size:13px;">Mock Model</strong>
                  <span style="font-size:10px;color:var(--accent);margin-left:6px;">● LOADED</span>
                  <p style="font-size:11px;color:var(--text3);margin:2px 0 0;">Deterministic visual baseline entry.</p>
                  <span style="font-size:10px;color:var(--text3);">1.2 GB · Cached</span>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                  <button class="btn btn-ghost btn-sm">Unload</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red);">Delete</button>
                </div>
              </div>
            </div>
          `;
        }
      });
    },
  },
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
      await expect(page).toHaveScreenshot(`${testInfo.project.name}-${state.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.012,
      });
    });
  }
});
