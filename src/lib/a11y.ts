/* ═══════════════════════════════════════════════════════════
   Accessibility Utilities
   ARIA management · Focus trap · Reduced motion · Screen reader
   ═══════════════════════════════════════════════════════════ */

/* ─── Focus Trap for Modals ─── */

const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function trapFocus(container: HTMLElement): () => void {
  const elements = container.querySelectorAll<HTMLElement>(focusableSelector);
  if (elements.length === 0) return () => {};

  const first = elements[0];
  const last = elements[elements.length - 1];

  function handler(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener('keydown', handler);
  first.focus();
  return () => container.removeEventListener('keydown', handler);
}

/* ─── ARIA Live Region ─── */

let liveRegion: HTMLElement | null = null;

export function initLiveRegion(): void {
  if (liveRegion) return;
  liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  document.body.appendChild(liveRegion);
}

export function announce(message: string): void {
  if (!liveRegion) initLiveRegion();
  liveRegion!.textContent = '';
  // Force re-announcement
  requestAnimationFrame(() => {
    liveRegion!.textContent = message;
  });
}

/* ─── Reduced Motion ─── */

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ─── Skip to Content ─── */

export function addSkipLink(): void {
  const existing = document.getElementById('skip-to-content');
  if (existing) return;
  const skip = document.createElement('a');
  skip.id = 'skip-to-content';
  skip.href = '#editor-area';
  skip.className = 'skip-link';
  skip.textContent = 'Skip to content';
  document.body.prepend(skip);
}

/* ─── ARIA for modals ─── */

export function setModalOpen(overlay: HTMLElement): void {
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.removeAttribute('aria-hidden');
}

export function setModalClosed(overlay: HTMLElement): void {
  overlay.setAttribute('aria-hidden', 'true');
}

/* ─── Keyboard Shortcuts Definition ─── */

export interface ShortcutDef {
  key: string;
  mod: boolean; // Ctrl/Cmd
  shift?: boolean;
  alt?: boolean;
  label: string;
  description?: string;
  category: string;
}

export const KEYBOARD_SHORTCUTS: ShortcutDef[] = [
  // General
  { key: 's', mod: true, label: 'Save note', description: 'Persist current note to local storage', category: 'General' },
  { key: 'n', mod: true, label: 'New note', description: 'Create a blank note in the current folder', category: 'General' },
  { key: 'f', mod: true, label: 'Focus search', description: 'Jump to the notes search bar', category: 'General' },
  { key: '/', mod: true, label: 'Keyboard shortcuts', description: 'Open this shortcuts reference panel', category: 'General' },
  // Navigation
  { key: 'k', mod: true, label: 'Command palette', description: 'Open global search and command runner', category: 'Navigation' },
  { key: '\\', mod: true, label: 'Toggle sidebar', description: 'Show or hide the left navigation panel', category: 'Navigation' },
  { key: 'p', mod: true, shift: true, label: 'Toggle preview', description: 'Switch between edit and rendered preview', category: 'Navigation' },
  // Editor & Formatting
  { key: 'b', mod: true, label: 'Bold text', description: 'Toggle strong styling on selection', category: 'Editor & Formatting' },
  { key: 'i', mod: true, label: 'Italic text', description: 'Toggle emphasis styling on selection', category: 'Editor & Formatting' },
  { key: 'h', mod: true, shift: true, label: 'Heading', description: 'Insert or cycle through heading levels', category: 'Editor & Formatting' },
  { key: 'l', mod: true, shift: true, label: 'Insert link', description: 'Wrap selection in a Markdown link', category: 'Editor & Formatting' },
  { key: '`', mod: true, label: 'Inline code', description: 'Wrap selection in backtick code span', category: 'Editor & Formatting' },
  { key: 'c', mod: true, shift: true, label: 'Create checkbox', description: 'Insert a task list item at cursor', category: 'Editor & Formatting' },
  // Templates
  { key: 't', mod: true, shift: true, label: 'Insert template', description: 'Open the note templates picker', category: 'Templates' },
  { key: '.', mod: true, label: 'Quick snippet', description: 'Expand a saved snippet at cursor', category: 'Templates' },
  // AI
  { key: 'j', mod: true, label: 'Toggle AI panel', description: 'Show or hide the AI assistant panel', category: 'AI' },
  { key: 'Enter', mod: true, label: 'Send AI message', description: 'Submit the current AI prompt', category: 'AI' },
];

/* ─── High Contrast Detection ─── */

export function prefersHighContrast(): boolean {
  return window.matchMedia('(forced-colors: active)').matches;
}
