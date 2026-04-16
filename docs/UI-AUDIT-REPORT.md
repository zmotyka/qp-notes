# UI/UX Audit Report - Zed Note
**Generated:** 2026-04-16
**Viewports tested:** Laptop (1440x900), Tablet (768x1024), iPhone (390x844)

## Executive Summary
- Total issues tracked: 12
- Resolved: 10
- Open: 2 (performance-focused)
- Coverage expanded to authenticated shell, editor, split/preview, settings, command palette, templates, history, AI panel, model catalog, notes tree, and status bar visual states across all device profiles.

## Issues by Category

### High Priority
- [x] **HIGH-001**: Missing main landmark on auth screen
  - **Fix:** Added semantic `main` wrapper and supporting auth layout styles.

- [x] **HIGH-002**: No deterministic E2E authenticated path
  - **Fix:** Added guarded `e2e-bypass-auth` flow and deterministic shell/editor helpers.

- [ ] **HIGH-003**: Performance below production target
  - **Current:** Lighthouse main-state performance now `56/55/66` (laptop/tablet/iphone).
  - **Actions already taken:** reduced test-blocking boot friction, improved semantic structure, and moved audit workflow to stable CLI runner.
  - **Next fix track:** deeper runtime chunking + deferred heavy module initialization remains required.

- [x] **HIGH-004**: SEO score below target
  - **Fix:** Added metadata/OG/Twitter tags in `index.html` and improved landmark discoverability.
  - **Result:** SEO now `91` across all three viewports.

### Medium Priority
- [x] **MED-001**: CSS z-index layering risk
  - **Fix:** Introduced z-index token scale in `layout.css` and replaced hardcoded extreme values with tokens.

- [x] **MED-002**: Missing safe-area inset handling for iPhone notches
  - **Fix:** Added `env(safe-area-inset-*)` tokens and applied safe-area padding to topbar/status/drawer surfaces.

- [x] **MED-003**: Hard-coded light-theme fallbacks in layout rules
  - **Fix:** Replaced key hardcoded colors with theme token usage in updated layout paths.

- [x] **MED-004**: E2E specs partially gated by runtime state
  - **Fix:** Reworked specs around `ensureShellReady` / `ensureEditorReady`; removed soft-skip-driven core coverage.

- [x] **MED-005**: Lighthouse Playwright adapter portability issue
  - **Fix:** Standardized on `tests/lighthouse/run-lighthouse.mjs` CLI pipeline.

### Low Priority / Polish
- [x] **LOW-001**: Branding mismatch in UI copy
  - **Fix:** Standardized topbar/screen-reader copy to `Zed Note`.

- [x] **LOW-002**: Node color warnings in test output
  - **Fix:** Updated npm e2e scripts to clear `NO_COLOR` at invocation.

- [x] **LOW-003**: Placeholder-only smoke coverage in deep specs
  - **Fix:** Expanded specs to drive editor/authenticated shell interactions and expanded visual suite states.

## Lighthouse Scores Summary (Main App State)
| Metric | Laptop | Tablet | iPhone |
|--------|--------|--------|--------|
| Performance | 56 | 55 | 66 |
| Accessibility | 100 | 100 | 100 |
| Best Practices | 100 | 100 | 100 |
| SEO | 91 | 91 | 91 |
| PWA | Not included in current CLI category set |

## Lighthouse-Specific Issues
- [ ] **LH-001**: Main-thread startup/runtime cost still above performance target.
- [x] **LH-002**: SEO opportunities addressed (metadata/discoverability improved).

## Accessibility Issues
- [x] **A11Y-001**: Auth landmark issue fixed.
- [x] **A11Y-002**: Multi-state authenticated a11y audits expanded and re-run in updated suite.

## Visual Regression Notes
- Baselines now include all key screen families:
  - login, app-root, shell-ready
  - editor-ready, editor-split, editor-preview
  - settings, command palette, templates, history
  - AI panel, model catalog, notes tree, status bar
- Runs executed across laptop/tablet/iphone projects.

## CSS Architecture Recommendations
1. Continue reducing hardcoded color fallbacks in low-traffic style branches.
2. Add one follow-up performance pass focused on runtime import deferral and chunk boundaries.
3. Keep z-index token scale as the single source of layering truth.
