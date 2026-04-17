/* ═══════════════════════════════════════════════════════════
   Zed Note — Main Application Entry Point
   ═══════════════════════════════════════════════════════════ */
import './styles/themes.css';
import './styles/layout.css';
import './styles/auth.css';

import { initFirebase } from './lib/firebase';
import {
  signInWithGoogle,
  signInWithAuthToken,
  signOut,
  onAuthStateChanged,
  handleRedirectResult,
  isOffline,
  type User,
} from './lib/auth';
import { initDb, getDb, db, getSetting, setSetting, type Note, type Folder } from './lib/db';
import { loadThemeFromSettings, saveTheme, saveAccent, getTheme, getAccent, THEMES, ACCENTS, type ThemeName, type AccentColor } from './lib/theme';
import { createEditor, wrapSelection, insertLinePrefix, insertAtCursor, replaceContent, getSelectedText, type EditorOptions } from './lib/editor';
import { initTips, TIPS, type Tip } from './lib/tips';
import { buildSearchIndex as rebuildSearchCoreIndex, indexNote, removeFromIndex, searchNotes } from './lib/search';
import { syncEngine, type SyncResult } from './lib/sync/sync-engine';
import {
  pushNote as pushFirestoreNote,
  deleteNote as deleteFirestoreNote,
  pullAllNotes as pullAllFirestoreNotes,
  subscribeToNotes,
  type FirestoreNote,
} from './lib/sync/firestore';
import { saveRevision, getRevisions, deleteHistory, diffTexts, renderDiffHTML, type Revision } from './lib/history';
import type { ExportOptions } from './lib/backup';
import type { LLMStatus } from './lib/llm/engine';
import type { ChatMessage } from './lib/llm/provider';
import { BUILTIN_PROMPTS, interpolate, getAllPrompts, savePrompt, deletePrompt, exportPrompts, importPrompts, type PromptContext } from './lib/prompts';
import { getAllNoteTemplates, saveNoteTemplate, deleteNoteTemplate, renderNoteTemplate } from './lib/note-templates';
import { initI18n, setLanguage, getCurrentLanguage, LANGUAGES } from './lib/i18n';
import { initLiveRegion, announce, addSkipLink, KEYBOARD_SHORTCUTS, trapFocus } from './lib/a11y';
import type { EditorView } from '@codemirror/view';

/* ─── State ─── */
let editor: EditorView | null = null;
let currentNote: Note | null = null;
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let statusResetTimer: ReturnType<typeof setTimeout> | null = null;
let viewMode: 'edit' | 'preview' | 'split' = 'split';
let currentFolderId: number | null = null;
let currentSort: 'modified' | 'created' | 'title' = 'modified';
let speechLang = 'en-US';
let uploadAbortController: AbortController | null = null;
let currentUserUid: string | null = null;
let firestoreUnsubscribe: (() => void) | null = null;
let applyingRemoteChange = false;
let noteTags: string[] = [];
let knownTags = new Map<string, number>();
let tagsSaveTimer: ReturnType<typeof setTimeout> | null = null;
let currentTagSuggestions: string[] = [];
let activeTagSuggestionIndex = -1;
let markdownAutoGenTimer: ReturnType<typeof setTimeout> | null = null;
let actionPillsTimer: ReturnType<typeof setTimeout> | null = null;
let markdownGenerationSeq = 0;
let applyingProgrammaticMarkdownUpdate = false;
let currentListFilter: string = 'recent';
let currentSearchQuery = '';
const collapsedExplorerSections = new Set<string>();
const collapsedNoteTreeFolders = new Set<string>();
const selectedNoteIds = new Set<number>();
let lastSelectedNoteId: number | null = null;
let aiMobileExpanded = false;
let aiVoiceOutputEnabled = true;
let aiVoiceInputListening = false;
let sidebarTreeCollapsed = false;
let sidebarFilelistCollapsed = false;
let workspacePanelHidden = false;
let noteDetailsPanelHidden = false;
let focusModeEnabled = false;
type AIPanelMode = 'assist' | 'transform';
type DeviceLayoutProfile = 'desktop' | 'tablet' | 'mobile';
type LayoutPrefs = {
  workspacePanelHidden: boolean;
  noteDetailsPanelHidden: boolean;
  focusModeEnabled: boolean;
  viewMode: 'edit' | 'preview' | 'split';
  aiMode: AIPanelMode;
};
let selectedSyncProviderType: 'gdrive' | 'onedrive' | 'dropbox' = 'gdrive';
type SettingsTabId = 'general' | 'sync' | 'ai' | 'security' | 'shortcuts' | 'accessibility';
let activeSettingsTab: SettingsTabId = 'general';

/** When false, passkey sign-in and Settings → Security are hidden (backend code kept for later). */
const PASSKEY_UI_ENABLED = false;
type ExplorerTabId = 'library' | 'folders' | 'tags';
let activeExplorerTab: ExplorerTabId = 'library';
type PendingAIAttachment = {
  filename: string;
  mimeType: string;
  extractedText: string;
  preview: string;
};
let pendingAIAttachment: PendingAIAttachment | null = null;
let aiConversationMode = false;
let aiIsGenerating = false;
let searchIndexReady = false;
let searchIndexBuildPromise: Promise<void> | null = null;
const AI_ATTACHMENT_TEXT_LIMIT = 8000;
const AI_ATTACHMENT_PREVIEW_LIMIT = 220;

type AISuggestedActionId = 'create-note' | 'summarize-note' | 'action-items' | 'link-notes';

const AI_SUGGESTED_ACTIONS: ReadonlyArray<{ id: AISuggestedActionId; label: string; title: string }> = [
  { id: 'create-note', label: 'Create note', title: 'Create a new note' },
  { id: 'summarize-note', label: 'Summarize note', title: 'Summarize the current note with AI' },
  { id: 'action-items', label: 'Action items', title: 'Extract action items from the current note' },
  { id: 'link-notes', label: 'Link notes', title: 'Create and link a new note' },
];

const RAW_MARKDOWN_DEBOUNCE_MS = 1200;
const ACTION_PILLS_DEBOUNCE_MS = 1000;
const DEFAULT_RAW_ACTIONS = ['Create task list', 'Generate mind map', 'Summarize draft'];
const DEFAULT_MARKDOWN_PROMPT_SYSTEM = 'Convert raw draft notes into clean markdown. Keep the content faithful, preserve important details, and add headings or lists only when they improve readability. Return markdown only with no commentary.';
const DEFAULT_MARKDOWN_PROMPT_TEMPLATE = 'Title: {{title}}\n\nCurrent markdown (may be empty):\n{{markdown}}\n\nRaw draft:\n{{raw}}';

type SyncProviderType = 'gdrive' | 'onedrive' | 'dropbox';
const NOTE_DRAG_MIME = 'application/x-zed-note-ids';
const EXPLORER_COLLAPSED_KEY = 'explorerCollapsedSections';
const COMMAND_PALETTE_RECENTS_KEY = 'commandPaletteRecents';

const SYNC_PROVIDER_SETUP: Record<SyncProviderType, {
  label: string;
  description: string;
}> = {
  gdrive: {
    label: 'Google Drive',
    description: 'Connect your Google account to sync notes in your Drive app folder.',
  },
  onedrive: {
    label: 'OneDrive',
    description: 'Connect your Microsoft account to sync notes in your OneDrive app folder.',
  },
  dropbox: {
    label: 'Dropbox',
    description: 'Connect your Dropbox account to sync notes in your app folder.',
  },
};

const MANAGED_SYNC_CLIENT_IDS: Record<SyncProviderType, string> = {
  gdrive: (import.meta.env.VITE_SYNC_GOOGLE_CLIENT_ID || '').trim(),
  onedrive: (import.meta.env.VITE_SYNC_ONEDRIVE_CLIENT_ID || '').trim(),
  dropbox: (import.meta.env.VITE_SYNC_DROPBOX_CLIENT_ID || '').trim(),
};

function getManagedSyncClientId(type: SyncProviderType): string {
  return MANAGED_SYNC_CLIENT_IDS[type] || '';
}

function getLayoutProfile(): DeviceLayoutProfile {
  const width = window.innerWidth;
  if (width <= 768) return 'mobile';
  if (width <= 1100) return 'tablet';
  return 'desktop';
}

function layoutPrefsStorageKey(): string {
  return `layoutPrefs:${getLayoutProfile()}`;
}

function persistLayoutPrefs(): void {
  const payload: LayoutPrefs = {
    workspacePanelHidden,
    noteDetailsPanelHidden,
    focusModeEnabled,
    viewMode,
    aiMode: (document.getElementById('aiPanel')?.getAttribute('data-ai-mode') as AIPanelMode | null) ?? 'assist',
  };
  localStorage.setItem(layoutPrefsStorageKey(), JSON.stringify(payload));
}

function loadLayoutPrefs(): LayoutPrefs | null {
  const raw = localStorage.getItem(layoutPrefsStorageKey());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LayoutPrefs>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      workspacePanelHidden: Boolean(parsed.workspacePanelHidden),
      noteDetailsPanelHidden: Boolean(parsed.noteDetailsPanelHidden),
      focusModeEnabled: Boolean(parsed.focusModeEnabled),
      viewMode: parsed.viewMode === 'edit' || parsed.viewMode === 'preview' ? parsed.viewMode : 'split',
      aiMode: parsed.aiMode === 'transform' ? 'transform' : 'assist',
    };
  } catch {
    return null;
  }
}

async function rebuildSearchIndex(): Promise<void> {
  searchIndexBuildPromise = (async () => {
    await rebuildSearchCoreIndex();
    searchIndexReady = true;
  })();
  await searchIndexBuildPromise;
}

async function ensureSearchIndexReady(): Promise<void> {
  if (searchIndexReady) return;
  if (!searchIndexBuildPromise) {
    searchIndexBuildPromise = (async () => {
      await rebuildSearchCoreIndex();
      searchIndexReady = true;
    })();
  }
  await searchIndexBuildPromise;
}

function scheduleSearchIndexBuild(): void {
  if (searchIndexReady || searchIndexBuildPromise) return;
  const run = () => { void ensureSearchIndexReady(); };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: IdleRequestCallback) => number }).requestIdleCallback(() => run());
  } else {
    globalThis.setTimeout(run, 500);
  }
}

const AI_PROVIDER_SETUP: Record<string, { docsUrl: string; steps: string[]; keyHint: string }> = {
  openai: {
    docsUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Create a key in OpenAI dashboard and paste it here.',
    steps: [
      'Open OpenAI dashboard and go to API Keys.',
      'Create a new secret key and copy it immediately.',
      'Paste it in Zed Note and click Save to validate.',
    ],
  },
  anthropic: {
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Use an Anthropic API key from your workspace settings.',
    steps: [
      'Open Anthropic Console and navigate to API Keys.',
      'Create a key with access to Claude models.',
      'Paste it in Zed Note and click Save to validate.',
    ],
  },
  gemini: {
    docsUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'Generate a Google AI Studio key for Gemini API access.',
    steps: [
      'Open Google AI Studio and create an API key.',
      'Ensure the Generative Language API is enabled on your Google project if needed.',
      'Paste it in Zed Note and click Save to validate.',
    ],
  },
};

type SyncVisualState = 'saving' | 'saved-local' | 'syncing' | 'synced' | 'offline' | 'failed' | 'conflict' | 'local';

const ICON_PIN_FILLED = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2 9.8 5.8l4 .6-2.9 2.8.7 4.1L8 11.3l-3.6 2 .7-4.1L2.2 6.4l4-.6L8 2.2z"/></svg>';
const ICON_PIN_OUTLINE = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.3 9.6 5.6l3.6.5-2.6 2.5.6 3.6L8 10.5l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L8 2.3z"/></svg>';

function closeIconSvg(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l8 8M12 4 4 12"/></svg>`;
}

function setPinButtonState(pinned: boolean): void {
  const pinBtn = document.getElementById('btnPin');
  if (!pinBtn) return;
  pinBtn.setAttribute('aria-pressed', String(pinned));
  pinBtn.classList.toggle('is-active', pinned);
  pinBtn.innerHTML = pinned ? ICON_PIN_FILLED : ICON_PIN_OUTLINE;
}

function getNoteMarkdownContent(note: Note): string {
  return note.markdownContent ?? note.content ?? '';
}

function getNoteRawContent(note: Note): string {
  const raw = note.rawContent;
  if (typeof raw === 'string') return raw;
  return getNoteMarkdownContent(note);
}

function getRawEditorInput(): HTMLTextAreaElement | null {
  return document.getElementById('rawEditorInput') as HTMLTextAreaElement | null;
}

function getRawEditorValue(): string {
  return getRawEditorInput()?.value ?? '';
}

function setRawEditorValue(value: string): void {
  const rawInput = getRawEditorInput();
  if (!rawInput) return;
  rawInput.value = value;
  updateRawGenerationAvailabilityUI();
}

function getGenerationPromptSystemInput(): HTMLTextAreaElement | null {
  return document.getElementById('generationPromptSystemInput') as HTMLTextAreaElement | null;
}

function getGenerationPromptTemplateInput(): HTMLTextAreaElement | null {
  return document.getElementById('generationPromptTemplateInput') as HTMLTextAreaElement | null;
}

function getResolvedGenerationPromptSystem(note: Note | null): string {
  if (!note) return DEFAULT_MARKDOWN_PROMPT_SYSTEM;
  return typeof note.markdownPromptSystem === 'string'
    ? note.markdownPromptSystem
    : DEFAULT_MARKDOWN_PROMPT_SYSTEM;
}

function getResolvedGenerationPromptTemplate(note: Note | null): string {
  if (!note) return DEFAULT_MARKDOWN_PROMPT_TEMPLATE;
  return typeof note.markdownPromptTemplate === 'string'
    ? note.markdownPromptTemplate
    : DEFAULT_MARKDOWN_PROMPT_TEMPLATE;
}

function setGenerationPromptEditorValues(note: Note | null): void {
  const systemInput = getGenerationPromptSystemInput();
  const templateInput = getGenerationPromptTemplateInput();
  if (!systemInput || !templateInput) return;
  systemInput.value = getResolvedGenerationPromptSystem(note);
  templateInput.value = getResolvedGenerationPromptTemplate(note);
  updateGenerationPromptSummary();
}

function syncGenerationPromptDraftFromInputs(): void {
  if (!currentNote) return;
  const systemInput = getGenerationPromptSystemInput();
  const templateInput = getGenerationPromptTemplateInput();
  currentNote.markdownPromptSystem = systemInput?.value ?? DEFAULT_MARKDOWN_PROMPT_SYSTEM;
  currentNote.markdownPromptTemplate = templateInput?.value ?? DEFAULT_MARKDOWN_PROMPT_TEMPLATE;
  updateGenerationPromptSummary();
}

function updateGenerationPromptSummary(): void {
  const summary = document.getElementById('generationPromptSummary');
  if (!summary) return;
  const systemValue = getGenerationPromptSystemInput()?.value ?? getResolvedGenerationPromptSystem(currentNote);
  const templateValue = getGenerationPromptTemplateInput()?.value ?? getResolvedGenerationPromptTemplate(currentNote);
  const isDefault = systemValue === DEFAULT_MARKDOWN_PROMPT_SYSTEM
    && templateValue === DEFAULT_MARKDOWN_PROMPT_TEMPLATE;
  const preview = templateValue.replace(/\s+/g, ' ').trim().slice(0, 68) || 'Prompt is empty';
  summary.textContent = isDefault ? 'Default prompt' : `Custom: ${preview}`;
}

function openGenerationPromptEditor(): void {
  const overlay = document.getElementById('generationPromptOverlay');
  if (!overlay) return;
  overlay.style.display = '';
}

function closeGenerationPromptEditor(): void {
  const overlay = document.getElementById('generationPromptOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
}

function setCompactMenuOpen(triggerId: string, panelId: string, open: boolean): void {
  const trigger = document.getElementById(triggerId) as HTMLButtonElement | null;
  const panel = document.getElementById(panelId);
  if (!trigger || !panel) return;
  trigger.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
}

function closeCompactMenus(): void {
  setCompactMenuOpen('btnTopbarMore', 'topbarMoreMenu', false);
  setCompactMenuOpen('btnEditorMore', 'editorMoreMenu', false);
  setCompactMenuOpen('btnToggleFormatMore', 'formatMorePanel', false);
  setCompactMenuOpen('btnMobileShellMenu', 'mobileShellMenu', false);
}

function toggleCompactMenu(triggerId: string, panelId: string): void {
  const trigger = document.getElementById(triggerId) as HTMLButtonElement | null;
  if (!trigger) return;
  const willOpen = trigger.getAttribute('aria-expanded') !== 'true';
  closeCompactMenus();
  setCompactMenuOpen(triggerId, panelId, willOpen);
}

function setNotePropertiesExpanded(expanded: boolean): void {
  notePropertiesExpanded = expanded;
  const row = document.getElementById('editorMetaRow');
  const btn = document.getElementById('btnToggleProperties') as HTMLButtonElement | null;
  if (row) {
    row.hidden = !expanded;
    if (expanded) {
      row.removeAttribute('hidden');
    } else {
      row.setAttribute('hidden', '');
    }
  }
  if (btn) {
    btn.setAttribute('aria-expanded', String(expanded));
    btn.textContent = expanded ? 'Hide Properties' : 'Properties';
  }
}

function setFormattingToolbarExpanded(expanded: boolean): void {
  const bar = document.getElementById('formattingBar');
  const btn = document.getElementById('btnToggleFormatBar') as HTMLButtonElement | null;
  if (!bar || !btn) return;
  bar.classList.toggle('compact-open', expanded);
  btn.setAttribute('aria-expanded', String(expanded));
  btn.textContent = expanded ? 'Hide Format' : 'Format';
}

function queueSilentNoteSave(delay = 900): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    void saveCurrentNote(true);
  }, delay);
}

type GenerationPromptLibraryEntry = {
  name: string;
  systemInstruction: string;
  userTemplate: string;
  source: 'builtin' | 'custom';
};

async function getGenerationPromptLibraryEntries(): Promise<GenerationPromptLibraryEntry[]> {
  const builtins: GenerationPromptLibraryEntry[] = BUILTIN_PROMPTS.map((prompt) => ({
    name: prompt.name,
    systemInstruction: prompt.systemInstruction,
    userTemplate: prompt.userTemplate,
    source: 'builtin',
  }));
  const customs = await getAllPrompts();
  const customEntries: GenerationPromptLibraryEntry[] = customs.map((prompt) => ({
    name: prompt.name,
    systemInstruction: prompt.systemInstruction,
    userTemplate: prompt.userTemplate,
    source: 'custom',
  }));
  return [...builtins, ...customEntries];
}

async function loadGenerationPromptFromLibrary(): Promise<void> {
  if (!currentNote) {
    setStatus('Open a note first to load a generation prompt');
    return;
  }
  const entries = await getGenerationPromptLibraryEntries();
  if (entries.length === 0) {
    setStatus('Prompt library is empty');
    return;
  }
  const lines = entries.map((entry, index) => `${index + 1}. ${entry.name} (${entry.source === 'builtin' ? 'Built-in' : 'Custom'})`).join('\n');
  const selection = window.prompt(`Choose a prompt number to load:\n\n${lines}`, '1');
  if (selection == null) return;

  const index = Number.parseInt(selection, 10) - 1;
  if (!Number.isFinite(index) || index < 0 || index >= entries.length) {
    setStatus('Invalid prompt selection');
    return;
  }

  const selected = entries[index];
  const systemInput = getGenerationPromptSystemInput();
  const templateInput = getGenerationPromptTemplateInput();
  if (systemInput) systemInput.value = selected.systemInstruction || '';
  if (templateInput) templateInput.value = selected.userTemplate || '';
  syncGenerationPromptDraftFromInputs();
  queueSilentNoteSave(0);
  setStatus(`Loaded prompt: ${selected.name}`);
}

async function saveGenerationPromptToLibraryFromNote(): Promise<void> {
  if (!currentNote) {
    setStatus('Open a note first to save a generation prompt');
    return;
  }
  const systemInstruction = (getGenerationPromptSystemInput()?.value ?? getResolvedGenerationPromptSystem(currentNote)).trim();
  const userTemplate = (getGenerationPromptTemplateInput()?.value ?? getResolvedGenerationPromptTemplate(currentNote)).trim();
  if (!userTemplate) {
    setStatus('User template cannot be empty');
    return;
  }

  const defaultName = `${(currentNote.title || 'Generation Prompt').trim() || 'Generation Prompt'} Prompt`;
  const nameInput = window.prompt('Name this prompt:', defaultName);
  if (nameInput == null) return;
  const name = nameInput.trim();
  if (!name) {
    setStatus('Prompt name is required');
    return;
  }

  await savePrompt({
    name,
    systemInstruction,
    userTemplate,
    defaultProvider: '',
  });
  await refreshPromptLibrary();
  setStatus(`Saved prompt to library: ${name}`);
}

function buildMarkdownGenerationMessages(note: Note, raw: string): ChatMessage[] {
  const markdown = editor?.state.doc.toString() ?? getNoteMarkdownContent(note);
  const systemPrompt = getResolvedGenerationPromptSystem(note);
  const userPrompt = getResolvedGenerationPromptTemplate(note)
    .replace(/\{\{raw\}\}/g, raw)
    .replace(/\{\{title\}\}/g, note.title)
    .replace(/\{\{markdown\}\}/g, markdown)
    .replace(/\{\{content\}\}/g, raw);

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt.slice(0, 14000) },
  ];
}

function isMobileViewport(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

function syncAppEditorNoteActiveClass(): void {
  document.getElementById('app')?.classList.toggle('editor-note-active', Boolean(currentNote));
}

function closeMobileDrawers(): void {
  document.getElementById('sidebarTree')?.classList.remove('open');
  document.getElementById('sidebarFilelist')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}

function closeMobileBottomDrawer(): void {
  const drawer = document.getElementById('mobileBottomDrawer');
  drawer?.classList.remove('open');
  drawer?.style.removeProperty('transform');
  document.getElementById('mobileBottomDrawerBackdrop')?.classList.remove('open');
  document.getElementById('app')?.classList.remove('mobile-bottom-drawer-open');
}

async function openMobileBottomDrawer(tab: 'toc' | 'pinned' = 'toc'): Promise<void> {
  // Close sidebars when opening bottom drawer
  document.getElementById('sidebarTree')?.classList.remove('open');
  document.getElementById('sidebarFilelist')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
  const drawer = document.getElementById('mobileBottomDrawer');
  const backdrop = document.getElementById('mobileBottomDrawerBackdrop');
  if (!drawer || !backdrop) return;
  drawer.style.removeProperty('transform');
  drawer.classList.add('open');
  backdrop.classList.add('open');
  document.getElementById('app')?.classList.add('mobile-bottom-drawer-open');
  await switchMobileDrawerTab(tab);
}

function wireMobileBottomDrawerGestures(): void {
  const drawer = document.getElementById('mobileBottomDrawer');
  const peek = document.getElementById('btnMobileTocPeek');
  if (!drawer || !peek) return;

  const handle = drawer.querySelector('.mobile-bottom-drawer-handle');
  const header = drawer.querySelector('.mobile-bottom-drawer-header');
  let dragStartY = 0;
  let draggingDrawer = false;

  const onDrawerDragStart = (clientY: number) => {
    if (!drawer.classList.contains('open')) return;
    draggingDrawer = true;
    dragStartY = clientY;
    drawer.style.transition = 'none';
  };
  const onDrawerDragMove = (clientY: number) => {
    if (!draggingDrawer) return;
    const dy = Math.max(0, clientY - dragStartY);
    drawer.style.transform = `translateY(${dy}px)`;
  };
  const onDrawerDragEnd = (clientY: number) => {
    if (!draggingDrawer) return;
    draggingDrawer = false;
    drawer.style.transition = '';
    const dy = clientY - dragStartY;
    drawer.style.removeProperty('transform');
    if (dy > 72) closeMobileBottomDrawer();
  };

  handle?.addEventListener('click', () => {
    if (!drawer.classList.contains('open')) void openMobileBottomDrawer('toc');
  });

  for (const el of [handle, header]) {
    if (!el) continue;
    el.addEventListener('touchstart', (ev: Event) => {
      const t = ev as TouchEvent;
      onDrawerDragStart(t.touches[0]?.clientY ?? 0);
    }, { passive: true });
    el.addEventListener('touchmove', (ev: Event) => {
      const t = ev as TouchEvent;
      onDrawerDragMove(t.touches[0]?.clientY ?? 0);
    }, { passive: true });
    el.addEventListener('touchend', (ev: Event) => {
      const t = ev as TouchEvent;
      const y = t.changedTouches[0]?.clientY ?? dragStartY;
      onDrawerDragEnd(y);
    }, { passive: true });
  }

  let peekStartY = 0;
  peek.addEventListener('touchstart', (ev: Event) => {
    const t = ev as TouchEvent;
    peekStartY = t.touches[0]?.clientY ?? 0;
  }, { passive: true });
  peek.addEventListener('touchend', (ev: Event) => {
    const t = ev as TouchEvent;
    const y = t.changedTouches[0]?.clientY ?? peekStartY;
    if (peekStartY - y > 36) void openMobileBottomDrawer('toc');
  }, { passive: true });
}

async function switchMobileDrawerTab(tab: 'toc' | 'pinned'): Promise<void> {
  // Update tab buttons and panels
  const tabs = document.querySelectorAll<HTMLElement>('[data-drawer-tab]');
  tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.drawerTab === tab));
  const panels = document.querySelectorAll<HTMLElement>('[data-drawer-panel]');
  panels.forEach(panel => panel.classList.toggle('active', panel.dataset.drawerPanel === tab));

  if (tab === 'toc') {
    const tocListEl = document.getElementById('mobileDrawerTocList');
    if (!tocListEl) return;
    if (!currentNote) {
      tocListEl.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:8px 0;">Open a note to see its table of contents.</p>';
      return;
    }
    const content = getNoteMarkdownContent(currentNote);
    const headings: { level: number; text: string; line: number }[] = [];
    content.split('\n').forEach((line, i) => {
      const match = line.match(/^(#{1,6})\s+(.+)/);
      if (match) headings.push({ level: match[1].length, text: match[2].replace(/[#*_`~]/g, '').trim(), line: i + 1 });
    });
    if (headings.length === 0) {
      tocListEl.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:8px 0;">No headings found in this note.</p>';
    } else {
      tocListEl.innerHTML = headings.map(h => `
        <div class="tree-item toc-item" data-toc-line="${h.line}" data-toc-level="${h.level}" style="--toc-indent:${8 + (h.level - 1) * 12}px;">
          <span class="tree-item-label">${escapeHtml(h.text)}</span>
        </div>
      `).join('');
      tocListEl.querySelectorAll<HTMLElement>('[data-toc-line]').forEach(el => {
        el.addEventListener('click', () => {
          if (!editor) return;
          const line = Number(el.dataset.tocLine);
          const lineInfo = editor.state.doc.line(Math.min(line, editor.state.doc.lines));
          editor.dispatch({ selection: { anchor: lineInfo.from }, scrollIntoView: true });
          editor.focus();
          closeMobileBottomDrawer();
        });
      });
    }
  } else {
    const pinnedListEl = document.getElementById('mobileDrawerPinnedList');
    if (!pinnedListEl) return;
    const pinned = await db.notes.filter(n => !!n.pinned).sortBy('modified');
    if (pinned.length === 0) {
      pinnedListEl.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:8px 0;">No favorite notes yet. Pin a note to see it here.</p>';
    } else {
      pinnedListEl.innerHTML = pinned.reverse().map(n => `
        <div class="tree-item" data-note-id="${n.id}" style="cursor:pointer;">
          <span class="tree-item-icon">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m8 2.3 1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.5l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L8 2.3z"/></svg>
          </span>
          <span class="tree-item-label" style="font-size:12px;">${escapeHtml(n.title || 'Untitled')}</span>
        </div>
      `).join('');
      pinnedListEl.querySelectorAll<HTMLElement>('[data-note-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id = Number(el.dataset.noteId);
          if (id) { void openNote(id); closeMobileBottomDrawer(); }
        });
      });
    }
  }
}

function toggleMobileDrawer(target: 'tree' | 'notes'): void {
  if (!isMobileViewport()) return;
  const tree = document.getElementById('sidebarTree');
  const notes = document.getElementById('sidebarFilelist');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!tree || !backdrop) return;

  // Folders and notes now live in one unified left panel.
  if (target === 'notes') target = 'tree';

  const treeOpen = tree.classList.contains('open');
  const notesOpen = notes?.classList.contains('open') ?? false;

  if (target === 'tree') {
    if (treeOpen) closeMobileDrawers();
    else {
      tree.classList.add('open');
      notes?.classList.remove('open');
      backdrop.classList.add('open');
    }
  } else if (notesOpen) {
    closeMobileDrawers();
  } else {
    notes?.classList.add('open');
    tree.classList.remove('open');
    backdrop.classList.add('open');
  }
}

function mergeWorkspacePanels(): void {
  const sidebarTree = document.getElementById('sidebarTree');
  const sidebarFilelist = document.getElementById('sidebarFilelist');
  if (!sidebarTree || !sidebarFilelist) return;
  if (sidebarTree.classList.contains('workspace-merged')) return;

  const filelistHeader = sidebarFilelist.querySelector('.filelist-header');
  const filelistItems = sidebarFilelist.querySelector('#filelistItems');
  if (!filelistHeader || !filelistItems) return;

  const notesSection = document.createElement('section');
  notesSection.id = 'workspaceNotesSection';
  notesSection.className = 'workspace-notes-section';
  notesSection.appendChild(filelistHeader);
  notesSection.appendChild(filelistItems);

  sidebarTree.appendChild(notesSection);
  sidebarTree.classList.add('workspace-merged');
  sidebarFilelist.remove();

  const explorerMobileBtn = document.getElementById('btnMobileExplorer');
  if (explorerMobileBtn) {
    explorerMobileBtn.textContent = 'Workspace';
    explorerMobileBtn.title = 'Open workspace';
    explorerMobileBtn.setAttribute('aria-label', 'Open workspace');
  }
}

function setWorkspacePanelHidden(hidden: boolean): void {
  workspacePanelHidden = hidden;
  const panel = document.getElementById('sidebarTree');
  const app = document.getElementById('app');
  const btn = document.getElementById('btnWorkspaceEdgeToggle');
  panel?.classList.toggle('workspace-hidden', hidden);
  app?.classList.toggle('workspace-panel-hidden', hidden);
  if (btn) {
    btn.title = hidden ? 'Show workspace panel' : 'Hide workspace panel';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = hidden
      ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m10 3-5 5 5 5"/></svg>`;
  }
  syncPanelToggleButtons();
  persistLayoutPrefs();
}

function setNoteDetailsPanelHidden(hidden: boolean): void {
  noteDetailsPanelHidden = hidden;
  const app = document.getElementById('app');
  app?.classList.toggle('note-details-hidden', hidden);
  syncPanelToggleButtons();
  persistLayoutPrefs();
}

function syncPanelToggleButtons(): void {
  const workspaceBtn = document.getElementById('btnTopbarWorkspace') as HTMLButtonElement | null;
  const detailsBtn = document.getElementById('btnTopbarDetails') as HTMLButtonElement | null;
  const aiBtn = document.getElementById('btnAI') as HTMLButtonElement | null;
  const detailsHeaderBtn = document.getElementById('btnToggleNoteDetailsPanel') as HTMLButtonElement | null;
  const aiOpen = document.getElementById('aiPanel')?.classList.contains('open') ?? false;

  if (workspaceBtn) {
    workspaceBtn.setAttribute('aria-pressed', String(!workspacePanelHidden));
    workspaceBtn.title = workspacePanelHidden ? 'Show workspace' : 'Hide workspace';
    workspaceBtn.textContent = workspacePanelHidden ? 'Show Workspace Panel' : 'Hide Workspace Panel';
  }
  if (detailsBtn) {
    detailsBtn.setAttribute('aria-pressed', String(!noteDetailsPanelHidden));
    detailsBtn.title = noteDetailsPanelHidden ? 'Show note details' : 'Hide note details';
    detailsBtn.textContent = noteDetailsPanelHidden ? 'Show Note Details' : 'Hide Note Details';
  }
  if (detailsHeaderBtn) {
    detailsHeaderBtn.setAttribute('aria-pressed', String(!noteDetailsPanelHidden));
    detailsHeaderBtn.title = noteDetailsPanelHidden ? 'Show note details' : 'Hide note details';
    detailsHeaderBtn.innerHTML = noteDetailsPanelHidden
      ? '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m10 3-5 5 5 5"/></svg>';
  }
  if (aiBtn) {
    aiBtn.setAttribute('aria-pressed', String(aiOpen));
    aiBtn.title = aiOpen ? 'Hide AI Assistant' : 'Show AI Assistant';
  }
  const focusBtn = document.getElementById('btnFocusMode') as HTMLButtonElement | null;
  if (focusBtn) {
    focusBtn.setAttribute('aria-pressed', String(focusModeEnabled));
    focusBtn.textContent = focusModeEnabled ? 'Exit Focus Mode' : 'Enter Focus Mode';
  }
}

function setFocusModeEnabled(enabled: boolean): void {
  focusModeEnabled = enabled;
  const app = document.getElementById('app');
  app?.classList.toggle('focus-mode', enabled);
  localStorage.setItem('focusModeEnabled', String(enabled));
  syncPanelToggleButtons();
  announce(enabled ? 'Focus mode enabled' : 'Focus mode disabled');
  persistLayoutPrefs();
}

function persistCollapsedExplorerSections(): void {
  localStorage.setItem(EXPLORER_COLLAPSED_KEY, JSON.stringify([...collapsedExplorerSections]));
}

function loadCollapsedExplorerSections(): void {
  const raw = localStorage.getItem(EXPLORER_COLLAPSED_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    collapsedExplorerSections.clear();
    parsed.forEach((id) => {
      if (typeof id === 'string' && id.trim()) collapsedExplorerSections.add(id);
    });
  } catch {
    // Ignore invalid persisted state.
  }
}

function setAIPanelMode(mode: AIPanelMode): void {
  const panel = document.getElementById('aiPanel');
  panel?.setAttribute('data-ai-mode', mode);
  const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
  const quickBar = document.getElementById('aiQuickBar');
  const composeFooter = document.getElementById('aiComposeFooter');
  document.querySelectorAll<HTMLButtonElement>('[data-ai-mode-btn]').forEach((btn) => {
    const active = btn.dataset.aiModeBtn === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  if (quickBar) quickBar.style.display = mode === 'transform' ? 'flex' : 'none';
  if (composeFooter) composeFooter.style.display = mode === 'assist' ? 'flex' : 'none';
  if (input) {
    input.placeholder = mode === 'assist'
      ? 'Ask about your note, attach context, or start conversation…'
      : 'Transform this note (summarize, rewrite, expand, grammar, explain)…';
  }
  announce(`AI mode switched to ${mode}`);
  persistLayoutPrefs();
}

function syncAIMobileModeUI(): void {
  const panel = document.getElementById('aiPanel');
  const toggleBtn = document.getElementById('btnAIMobileExpand');
  if (!panel || !toggleBtn) return;
  const mobile = isMobileViewport();
  panel.classList.toggle('mobile-fullscreen', mobile && aiMobileExpanded);
  toggleBtn.style.display = mobile ? '' : 'none';
  toggleBtn.setAttribute('aria-pressed', String(mobile && aiMobileExpanded));
  toggleBtn.title = mobile && aiMobileExpanded ? 'Collapse to compact panel' : 'Expand to full screen';
  toggleBtn.innerHTML = mobile && aiMobileExpanded
    ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.8 2.8h2.4v2.4M13.2 2.8l-3 3M5.2 13.2H2.8v-2.4M2.8 13.2l3-3"/></svg>'
    : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 2.8H2.8v2.4M2.8 2.8l3 3M10.8 13.2h2.4v-2.4M13.2 13.2l-3-3"/></svg>';
}

function toggleAIMobileExpanded(): void {
  if (!isMobileViewport()) return;
  aiMobileExpanded = !aiMobileExpanded;
  syncAIMobileModeUI();
}

function setSyncVisualState(state: SyncVisualState, detail?: string): void {
  const indicator = document.getElementById('saveIndicator');
  const label = document.getElementById('saveIndicatorLabel');
  const meta = document.getElementById('saveIndicatorMeta');
  const chip = document.getElementById('syncStateChip');
  const chipText = document.getElementById('syncStateChipText');
  const statusDetail = document.getElementById('syncStatus');

  const copy: Record<SyncVisualState, { label: string; meta: string }> = {
    saving: { label: 'Saving…', meta: detail || 'Writing changes locally' },
    'saved-local': { label: 'Saved locally', meta: detail || 'Waiting for background sync' },
    syncing: { label: 'Syncing…', meta: detail || 'Uploading latest changes' },
    synced: { label: 'Synced', meta: detail || 'All changes up to date' },
    offline: { label: 'Offline', meta: detail || 'Changes will sync when online' },
    failed: { label: 'Sync failed', meta: detail || 'Retrying in the background' },
    conflict: { label: 'Conflict', meta: detail || 'Choose which version to keep' },
    local: { label: 'Local note', meta: detail || 'Not yet synced to cloud' },
  };

  const stateCopy = copy[state];
  if (indicator) indicator.className = `save-indicator ${state}`;
  if (label) label.textContent = stateCopy.label;
  if (meta) meta.textContent = stateCopy.meta;
  if (chip) chip.className = `sync-state-chip ${state}`;
  if (chipText) chipText.textContent = stateCopy.label;
  if (statusDetail) statusDetail.textContent = stateCopy.meta;
}

function refreshSyncVisualState(): void {
  if (!currentNote) {
    setSyncVisualState(navigator.onLine ? 'synced' : 'offline', navigator.onLine ? 'Ready for your next note' : 'Offline mode active');
    return;
  }

  switch (currentNote.syncStatus) {
    case 'synced':
      setSyncVisualState('synced');
      break;
    case 'pending':
      setSyncVisualState(navigator.onLine ? 'saved-local' : 'offline');
      break;
    case 'conflict':
      setSyncVisualState('conflict');
      break;
    case 'local':
      setSyncVisualState('local');
      break;
    default:
      setSyncVisualState(navigator.onLine ? 'saved-local' : 'offline');
      break;
  }
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/,+$/g, '').replace(/\s+/g, ' ');
}

function hasTag(tag: string): boolean {
  return noteTags.some(existing => existing.toLowerCase() === tag.toLowerCase());
}

function scheduleTagSave(): void {
  if (tagsSaveTimer) clearTimeout(tagsSaveTimer);
  tagsSaveTimer = setTimeout(() => {
    saveCurrentNote(true);
  }, 1000);
}

function updateTagsHiddenField(): void {
  const hiddenInput = document.getElementById('tagsInput') as HTMLInputElement | null;
  if (!hiddenInput) return;
  hiddenInput.value = noteTags.join(', ');
}

function renderTagPills(): void {
  const pills = document.getElementById('tagPills');
  if (!pills) return;

  pills.innerHTML = noteTags.map(tag => `
    <span class="editor-tag-pill" data-tag="${escapeHtml(tag)}">
      <span class="editor-tag-pill-label">${escapeHtml(tag)}</span>
      <button type="button" class="editor-tag-pill-remove" data-remove-tag="${escapeHtml(tag)}" aria-label="Remove tag ${escapeHtml(tag)}">×</button>
    </span>
  `).join('');
}

function modernizeDialogCloseIcons(): void {
  document.querySelectorAll<HTMLElement>('.btn.btn-ghost.btn-icon.btn-sm').forEach(btn => {
    const raw = (btn.textContent || '').trim();
    if (raw === '×' || raw === '✕') {
      btn.innerHTML = closeIconSvg(12);
    }
  });
}

function hideTagSuggestions(): void {
  const suggestionBox = document.getElementById('tagSuggestions');
  if (!suggestionBox) return;
  suggestionBox.innerHTML = '';
  suggestionBox.style.display = 'none';
  currentTagSuggestions = [];
  activeTagSuggestionIndex = -1;
}

function setActiveTagSuggestion(index: number): void {
  const suggestionBox = document.getElementById('tagSuggestions');
  if (!suggestionBox || currentTagSuggestions.length === 0) {
    activeTagSuggestionIndex = -1;
    return;
  }

  const bounded = ((index % currentTagSuggestions.length) + currentTagSuggestions.length) % currentTagSuggestions.length;
  activeTagSuggestionIndex = bounded;

  const items = suggestionBox.querySelectorAll<HTMLElement>('.editor-tag-suggestion');
  items.forEach((item, idx) => {
    const selected = idx === bounded;
    item.classList.toggle('is-active', selected);
    item.setAttribute('aria-selected', String(selected));
  });

  const activeEl = items[bounded];
  activeEl?.scrollIntoView({ block: 'nearest' });
}

function acceptActiveTagSuggestion(): boolean {
  if (activeTagSuggestionIndex < 0 || activeTagSuggestionIndex >= currentTagSuggestions.length) return false;
  const selected = currentTagSuggestions[activeTagSuggestionIndex];
  if (!selected) return false;

  const input = document.getElementById('tagTextInput') as HTMLInputElement | null;
  addTag(selected);
  if (input) input.value = '';
  renderTagSuggestions('');
  return true;
}

function renderTagSuggestions(query = ''): void {
  const suggestionBox = document.getElementById('tagSuggestions');
  if (!suggestionBox) return;

  const q = query.trim().toLowerCase();
  const suggestions = [...knownTags.entries()]
    .filter(([tag]) => !hasTag(tag))
    .filter(([tag]) => !q || tag.toLowerCase().includes(q))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);

  if (suggestions.length === 0) {
    hideTagSuggestions();
    return;
  }

  currentTagSuggestions = suggestions.map(([tag]) => tag);

  suggestionBox.innerHTML = suggestions.map(([tag, count]) => `
    <button type="button" class="editor-tag-suggestion" data-suggested-tag="${escapeHtml(tag)}">
      <span>${escapeHtml(tag)}</span>
      <span class="editor-tag-suggestion-count">${count}</span>
    </button>
  `).join('');
  suggestionBox.style.display = 'block';
  setActiveTagSuggestion(0);
}

function addTag(tag: string): void {
  const normalized = normalizeTag(tag);
  if (!normalized || hasTag(normalized)) return;
  noteTags.push(normalized);
  renderTagPills();
  updateTagsHiddenField();
  updateNoteDetailsTagPreview();
  hideTagSuggestions();
  scheduleTagSave();
}

function removeTag(tag: string): void {
  const lowered = tag.toLowerCase();
  noteTags = noteTags.filter(existing => existing.toLowerCase() !== lowered);
  renderTagPills();
  updateTagsHiddenField();
  updateNoteDetailsTagPreview();
  scheduleTagSave();
}

function commitTagInputValue(): void {
  const input = document.getElementById('tagTextInput') as HTMLInputElement | null;
  if (!input) return;
  const value = normalizeTag(input.value);
  if (!value) {
    hideTagSuggestions();
    return;
  }
  addTag(value);
  input.value = '';
}

function setNoteTags(tags: string[]): void {
  const deduped: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;
    if (deduped.some(existing => existing.toLowerCase() === normalized.toLowerCase())) continue;
    deduped.push(normalized);
  }
  noteTags = deduped;
  renderTagPills();
  updateTagsHiddenField();
  updateNoteDetailsTagPreview();
  hideTagSuggestions();
}

function wireTagInput(): void {
  const tagField = document.getElementById('tagField');
  const tagInput = document.getElementById('tagTextInput') as HTMLInputElement | null;
  if (!tagField || !tagInput || tagField.dataset.wired === '1') return;

  tagField.dataset.wired = '1';

  tagField.addEventListener('click', () => {
    tagInput.focus();
    renderTagSuggestions(tagInput.value);
  });

  tagField.addEventListener('click', (e: Event) => {
    const removeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-tag]');
    if (!removeBtn) return;
    e.preventDefault();
    const tag = removeBtn.dataset.removeTag;
    if (tag) removeTag(tag);
    tagInput.focus();
  });

  tagInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && currentTagSuggestions.length > 0) {
      e.preventDefault();
      setActiveTagSuggestion(activeTagSuggestionIndex + 1);
      return;
    }

    if (e.key === 'ArrowUp' && currentTagSuggestions.length > 0) {
      e.preventDefault();
      setActiveTagSuggestion(activeTagSuggestionIndex - 1);
      return;
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (acceptActiveTagSuggestion()) return;
      commitTagInputValue();
      return;
    }

    if (e.key === 'Tab' && tagInput.value.trim()) {
      e.preventDefault();
      if (acceptActiveTagSuggestion()) return;
      commitTagInputValue();
      return;
    }

    if (e.key === 'Escape') {
      hideTagSuggestions();
      return;
    }

    if (e.key === 'Backspace' && !tagInput.value.trim() && noteTags.length > 0) {
      e.preventDefault();
      const last = noteTags[noteTags.length - 1];
      if (last) removeTag(last);
    }
  });

  tagInput.addEventListener('input', () => {
    const cleaned = tagInput.value.replace(/,/g, '');
    if (cleaned !== tagInput.value) tagInput.value = cleaned;
    renderTagSuggestions(tagInput.value);
  });

  tagInput.addEventListener('focus', () => {
    renderTagSuggestions(tagInput.value);
  });

  tagInput.addEventListener('blur', () => {
    setTimeout(() => {
      commitTagInputValue();
      hideTagSuggestions();
    }, 120);
  });

  const suggestionBox = document.getElementById('tagSuggestions');
  suggestionBox?.addEventListener('mousedown', (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-suggested-tag]');
    if (!btn) return;
    e.preventDefault();
    const suggestedTag = btn.dataset.suggestedTag;
    if (!suggestedTag) return;
    addTag(suggestedTag);
    tagInput.value = '';
    tagInput.focus();
    renderTagSuggestions('');
  });

  suggestionBox?.addEventListener('mousemove', (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.editor-tag-suggestion');
    if (!btn) return;
    const all = [...suggestionBox.querySelectorAll<HTMLElement>('.editor-tag-suggestion')];
    const idx = all.indexOf(btn);
    if (idx >= 0 && idx !== activeTagSuggestionIndex) {
      setActiveTagSuggestion(idx);
    }
  });
}

type LLMEngineModule = typeof import('./lib/llm/engine');
type LLMDispatchModule = typeof import('./lib/llm/dispatch');

let llmModulesPromise: Promise<{
  engineModule: LLMEngineModule;
  dispatchModule: LLMDispatchModule;
}> | null = null;
let llmStatusListenerAttached = false;
let localModelAutoloadPromise: Promise<void> | null = null;
let currentLLMStatus: LLMStatus = 'idle';
let currentLLMDetail: string | undefined;

const LOCAL_MODEL_SETTING_KEY = 'llm-local-model-id';

type UploadModule = typeof import('./lib/upload');
type SpeechModule = typeof import('./lib/speech');
type BackupModule = typeof import('./lib/backup');
type PreviewModule = typeof import('./lib/preview');
type GoogleDriveProviderModule = typeof import('./lib/sync/google-drive');
type OneDriveProviderModule = typeof import('./lib/sync/onedrive');
type DropboxProviderModule = typeof import('./lib/sync/dropbox');
type AuthPasskeyModule = typeof import('./lib/auth-passkey');

let uploadModulePromise: Promise<UploadModule> | null = null;
let speechModulePromise: Promise<SpeechModule> | null = null;
let backupModulePromise: Promise<BackupModule> | null = null;
let previewModulePromise: Promise<PreviewModule> | null = null;
let googleDriveProviderModulePromise: Promise<GoogleDriveProviderModule> | null = null;
let oneDriveProviderModulePromise: Promise<OneDriveProviderModule> | null = null;
let dropboxProviderModulePromise: Promise<DropboxProviderModule> | null = null;
let authPasskeyModulePromise: Promise<AuthPasskeyModule> | null = null;
let notePropertiesExpanded = false;

function getUploadModule(): Promise<UploadModule> {
  if (!uploadModulePromise) uploadModulePromise = import('./lib/upload');
  return uploadModulePromise;
}

function getSpeechModule(): Promise<SpeechModule> {
  if (!speechModulePromise) speechModulePromise = import('./lib/speech');
  return speechModulePromise;
}

function getBackupModule(): Promise<BackupModule> {
  if (!backupModulePromise) backupModulePromise = import('./lib/backup');
  return backupModulePromise;
}

function getPreviewModule(): Promise<PreviewModule> {
  if (!previewModulePromise) previewModulePromise = import('./lib/preview');
  return previewModulePromise;
}

async function renderMarkdownContent(content: string, container: HTMLElement): Promise<void> {
  const previewModule = await getPreviewModule();
  await previewModule.renderMarkdown(content, container);
}

function getGoogleDriveProviderModule(): Promise<GoogleDriveProviderModule> {
  if (!googleDriveProviderModulePromise) googleDriveProviderModulePromise = import('./lib/sync/google-drive');
  return googleDriveProviderModulePromise;
}

function getOneDriveProviderModule(): Promise<OneDriveProviderModule> {
  if (!oneDriveProviderModulePromise) oneDriveProviderModulePromise = import('./lib/sync/onedrive');
  return oneDriveProviderModulePromise;
}

function getDropboxProviderModule(): Promise<DropboxProviderModule> {
  if (!dropboxProviderModulePromise) dropboxProviderModulePromise = import('./lib/sync/dropbox');
  return dropboxProviderModulePromise;
}

function getAuthPasskeyModule(): Promise<AuthPasskeyModule> {
  if (!authPasskeyModulePromise) authPasskeyModulePromise = import('./lib/auth-passkey');
  return authPasskeyModulePromise;
}

function updateRawGenerationAvailabilityUI(): void {
  const hint = document.getElementById('rawGenerationHint');
  const hintText = document.getElementById('rawGenerationHintText');
  const regenerateBtn = document.getElementById('btnRegenerateMarkdown') as HTMLButtonElement | null;
  if (!hint || !hintText) {
    syncRawModelStatusBadge();
    return;
  }

  const hasRawInput = getRawEditorValue().trim().length > 0;
  const isReady = currentLLMStatus === 'ready' || currentLLMStatus === 'generating';
  const isLoading = currentLLMStatus === 'loading';
  const isError = currentLLMStatus === 'error';

  if (!hasRawInput) {
    hint.style.display = 'none';
  } else if (isReady) {
    hint.style.display = 'none';
  } else {
    hint.style.display = 'flex';
    if (isLoading) {
      hintText.textContent = `Loading AI model${currentLLMDetail ? ` (${currentLLMDetail})` : ''}. Markdown generation will start when ready.`;
    } else if (isError) {
      hintText.textContent = `AI model error${currentLLMDetail ? `: ${currentLLMDetail}` : ''}. Load a model to generate markdown from raw notes.`;
    } else {
      hintText.textContent = 'AI model is not loaded. Load a model to generate markdown from raw notes.';
    }
  }

  if (regenerateBtn) {
    const canRegenerate = hasRawInput && isReady;
    regenerateBtn.disabled = !canRegenerate;
    regenerateBtn.title = canRegenerate
      ? 'Regenerate Markdown from Raw Draft'
      : 'Load an AI model to enable markdown generation';
  }

  syncRawModelStatusBadge();
}

function syncRawModelStatusBadge(): void {
  const el = document.getElementById('rawModelStatusBadge');
  if (!el) return;
  const status = currentLLMStatus;
  el.dataset.llmStatus = status;
  el.classList.remove('idle', 'loading', 'ready', 'generating', 'error');
  el.classList.add(status);
  const detail = currentLLMDetail;
  if (status === 'ready') {
    el.textContent = detail ? `Loaded: ${detail}` : 'Model loaded';
  } else if (status === 'loading') {
    el.textContent = detail ? `Loading ${detail}` : 'Loading model…';
  } else if (status === 'generating') {
    el.textContent = 'Model busy';
  } else if (status === 'error') {
    el.textContent = detail ? `Error: ${detail}` : 'Model error';
  } else {
    el.textContent = 'No model loaded';
  }
}

function setAIProgressState(text?: string, progress?: number): void {
  const nameEl = document.getElementById('aiModelName');
  const bar = document.getElementById('aiProgressBar');
  const fill = document.getElementById('aiProgressFill');
  const progressText = document.getElementById('aiProgressText');

  if (nameEl && text) nameEl.textContent = text;
  if (!bar || !fill || !progressText) return;

  if (typeof progress === 'number') {
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
    bar.style.display = 'block';
    progressText.style.display = 'block';
    fill.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
    return;
  }

  bar.style.display = 'none';
  progressText.style.display = 'none';
  fill.style.width = '0%';
  progressText.textContent = '';
}

function renderSurfaceState(target: HTMLElement, kind: 'loading' | 'empty' | 'error' | 'info', message: string): void {
  target.innerHTML = `<p class="ui-surface-state ui-surface-state-${kind}">${escapeHtml(message)}</p>`;
}

async function getLLMModules(): Promise<{
  engineModule: LLMEngineModule;
  dispatchModule: LLMDispatchModule;
}> {
  if (!llmModulesPromise) {
    llmModulesPromise = Promise.all([
      import('./lib/llm/engine'),
      import('./lib/llm/dispatch'),
    ]).then(([engineModule, dispatchModule]) => ({ engineModule, dispatchModule }));
  }
  return llmModulesPromise;
}

async function ensureLLMRuntime(): Promise<{
  engineModule: LLMEngineModule;
  dispatchModule: LLMDispatchModule;
}> {
  const modules = await getLLMModules();

  if (!llmStatusListenerAttached) {
    modules.engineModule.llmEngine.onStatusChange(updateAIStatus);
    llmStatusListenerAttached = true;

    const status = modules.engineModule.llmEngine.getStatus();
    const detail = status === 'ready'
      ? modules.engineModule.llmEngine.getLoadedModelId() ?? undefined
      : undefined;
    updateAIStatus(status, detail);
  }

  return modules;
}

async function loadLocalModel(modelId: string, options?: { persist?: boolean; setActive?: boolean }): Promise<void> {
  const persist = options?.persist !== false;
  const setActive = options?.setActive !== false;
  const { engineModule, dispatchModule } = await ensureLLMRuntime();

  try {
    await engineModule.llmEngine.loadModel(modelId, (progress) => {
      setAIProgressState(progress.text, progress.progress);
    });

    if (persist) await setSetting(LOCAL_MODEL_SETTING_KEY, modelId);
    if (setActive) await dispatchModule.setActiveProvider('local');
  } finally {
    setAIProgressState();
  }
}

async function ensureAutoLoadedLocalModel(): Promise<void> {
  if (localModelAutoloadPromise) return localModelAutoloadPromise;

  localModelAutoloadPromise = (async () => {
    try {
      const { engineModule, dispatchModule } = await ensureLLMRuntime();
      const { llmEngine } = engineModule;

      if (llmEngine.getStatus() === 'ready' || llmEngine.getStatus() === 'loading' || llmEngine.getStatus() === 'generating') {
        return;
      }

      const activeProvider = await dispatchModule.getActiveProvider();
      if (activeProvider !== 'local') return;

      const savedModelId = await getSetting(LOCAL_MODEL_SETTING_KEY);
      const cachedModels = (await llmEngine.getModelCatalog())
        .filter((model) => model.cached)
        .sort((left, right) => Number(left.lowResource) - Number(right.lowResource) || left.sizeMB - right.sizeMB);

      const candidates = [
        ...(savedModelId ? cachedModels.filter((model) => model.id === savedModelId) : []),
        ...cachedModels.filter((model) => model.id !== savedModelId),
      ];

      for (const candidate of candidates) {
        try {
          await loadLocalModel(candidate.id, { persist: true, setActive: false });
          return;
        } catch {
          if (candidate.id === savedModelId) {
            await setSetting(LOCAL_MODEL_SETTING_KEY, '');
          }
        }
      }
    } catch (error) {
      console.warn('Local model autoload skipped:', error);
    }
  })().finally(() => {
    localModelAutoloadPromise = null;
  });

  return localModelAutoloadPromise;
}

async function abortAIGeneration(): Promise<void> {
  const { dispatchModule } = await ensureLLMRuntime();
  dispatchModule.abortGeneration();
  const speechModule = await getSpeechModule();
  speechModule.stopTts();
  aiIsGenerating = false;
  updateAIComposerUI();
}

/* ─── Firestore Sync Helpers ─── */

function mapRemoteToLocalNote(remote: FirestoreNote): Note {
  return {
    id: remote.id,
    title: remote.title,
    content: remote.content,
    markdownContent: remote.content,
    rawContent: remote.rawContent ?? remote.content,
    markdownPromptSystem: remote.markdownPromptSystem,
    markdownPromptTemplate: remote.markdownPromptTemplate,
    markdownDirty: false,
    suggestedActions: [],
    lastRawSuggestionHash: null,
    tags: remote.tags,
    folderId: remote.folderId,
    created: remote.created,
    modified: remote.modified,
    syncStatus: 'synced',
    revision: remote.revision,
    providerFileId: remote.providerFileId,
    pinned: remote.pinned,
  };
}

async function mergeRemoteNote(remote: FirestoreNote): Promise<void> {
  const local = await db.notes.get(remote.id);

  // Keep local pending edits if they are newer than remote snapshot.
  if (local && local.syncStatus === 'pending' && local.modified > remote.modified) {
    return;
  }

  if (!local) {
    await db.notes.add(mapRemoteToLocalNote(remote));
  } else {
    await db.notes.update(remote.id, {
      title: remote.title,
      content: remote.content,
      markdownContent: remote.content,
      rawContent: remote.rawContent ?? local?.rawContent ?? remote.content,
      markdownPromptSystem: typeof remote.markdownPromptSystem === 'string'
        ? remote.markdownPromptSystem
        : (local?.markdownPromptSystem ?? DEFAULT_MARKDOWN_PROMPT_SYSTEM),
      markdownPromptTemplate: typeof remote.markdownPromptTemplate === 'string'
        ? remote.markdownPromptTemplate
        : (local?.markdownPromptTemplate ?? DEFAULT_MARKDOWN_PROMPT_TEMPLATE),
      markdownDirty: local?.markdownDirty ?? false,
      tags: remote.tags,
      folderId: remote.folderId,
      created: remote.created,
      modified: remote.modified,
      pinned: remote.pinned,
      syncStatus: 'synced',
      revision: remote.revision,
      providerFileId: remote.providerFileId,
    });
  }
}

async function pushLocalNoteToFirestore(noteId: number): Promise<void> {
  if (!currentUserUid || applyingRemoteChange) return;
  const note = await db.notes.get(noteId);
  if (!note || note.id == null) return;
  const keepPendingForCloudSync = !!syncEngine.getProvider()?.isAuthenticated();

  try {
    if (currentNote?.id === note.id) setSyncVisualState('syncing');
    await pushFirestoreNote(currentUserUid, note);
    await db.notes.update(note.id, { syncStatus: keepPendingForCloudSync ? 'pending' : 'synced' });
    if (currentNote?.id === note.id) {
      currentNote.syncStatus = keepPendingForCloudSync ? 'pending' : 'synced';
      updateSyncBadge(currentNote.syncStatus);
    }
  } catch (err) {
    if (currentNote?.id === note.id) {
      setSyncVisualState(navigator.onLine ? 'failed' : 'offline');
    }
    console.warn('Firestore push failed, keeping note pending:', err);
  }
}

function scheduleAutoSync(delay = 1500): void {
  const provider = syncEngine.getProvider();
  if (!provider?.isAuthenticated()) return;
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    void doSync(true);
  }, delay);
}

async function deleteRemoteNoteFromFirestore(noteId: number): Promise<void> {
  if (!currentUserUid) return;
  try {
    await deleteFirestoreNote(currentUserUid, noteId);
  } catch (err) {
    console.warn('Firestore delete failed:', err);
  }
}

async function initFirestoreRealtimeSync(uid: string): Promise<void> {
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }

  currentUserUid = uid;

  // Initial remote pull to hydrate local DB for this UID.
  try {
    const remoteNotes = await pullAllFirestoreNotes(uid);
    applyingRemoteChange = true;
    for (const remote of remoteNotes) {
      await mergeRemoteNote(remote);
    }
  } finally {
    applyingRemoteChange = false;
  }

  // Realtime subscription for cross-device updates.
  firestoreUnsubscribe = subscribeToNotes(uid, async (type, remote) => {
    if (applyingRemoteChange) return;

    if (type === 'removed') {
      await db.notes.delete(remote.id);
      if (currentNote?.id === remote.id) {
        currentNote = null;
        editor = null;
        document.getElementById('editorContainer')!.style.display = 'none';
        document.getElementById('emptyState')!.style.display = '';
        document.getElementById('editorPane')!.innerHTML = '';
        syncAppEditorNoteActiveClass();
      }
    } else {
      applyingRemoteChange = true;
      try {
        await mergeRemoteNote(remote);
      } finally {
        applyingRemoteChange = false;
      }

      if (currentNote?.id === remote.id) {
        currentNote = await db.notes.get(remote.id) || null;
        if (currentNote && editor) {
          const localContent = editor.state.doc.toString();
          const remoteMarkdown = getNoteMarkdownContent(currentNote);
          setRawEditorValue(getNoteRawContent(currentNote));
          setGenerationPromptEditorValues(currentNote);
          if (localContent !== remoteMarkdown) {
            applyingProgrammaticMarkdownUpdate = true;
            replaceContent(editor, remoteMarkdown);
            applyingProgrammaticMarkdownUpdate = false;
            const previewPane = document.getElementById('previewPane');
            if (previewPane) await renderMarkdownContent(remoteMarkdown, previewPane);
          }
          updateSyncBadge(currentNote.syncStatus);
        }
      }
    }

    await rebuildSearchIndex();
    await refreshFileList();
    await refreshFolders();
  });
}

/* ─── App Shell HTML ─── */
function renderApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <!-- Topbar -->
    <header class="topbar shell-chrome">
      <h1 class="sr-only">Zed Note</h1>
      <div class="topbar-mobile-controls ui-compact-menu topbar-mobile-shell">
        <button class="btn btn-ghost btn-icon btn-sm mobile-only" type="button" id="btnMobileShellMenu" title="Navigation" aria-label="Open navigation menu" aria-expanded="false" aria-haspopup="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>
        </button>
        <div class="ui-compact-menu-panel mobile-shell-menu-panel" id="mobileShellMenu" hidden>
          <button type="button" class="ui-compact-menu-item" id="btnMobileExplorer">Workspace</button>
          <button type="button" class="ui-compact-menu-item" id="btnMobileToc">Contents &amp; favorites</button>
        </div>
      </div>
      <div class="topbar-logo">
        <div class="topbar-logo-mark">Z</div>
        <span class="topbar-logo-text">Zed Note</span>
      </div>
      <div class="divider-v"></div>
      <div class="search-wrap">
        <button type="button" class="btn btn-ghost btn-icon btn-sm mobile-only mobile-search-back" id="btnMobileSearchBack" aria-label="Close search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>
        </button>
        <span class="search-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
        </span>
        <input type="text" id="searchInput" placeholder="Search notes... (tag:, date:)" autocomplete="off" />
      </div>
        <input type="text" id="quickCaptureInput" class="quick-capture-input" placeholder="Quick capture... (Enter to save)" autocomplete="off" />
      <div class="topbar-actions">
        <button class="btn btn-primary btn-sm" id="btnNewNote">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          New Note
        </button>
        <button class="btn btn-ghost btn-sm desktop-panel-toggle" id="btnAI" title="AI Assistant" aria-pressed="false">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.9 9.3 5l3.2 1.2-3.2 1.2L8 10.5 6.7 7.4 3.5 6.2 6.7 5 8 1.9z"/><path d="M12.2 9.6 13 11.4l1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8.8-1.8z"/></svg>
          AI
        </button>
        <div class="ui-compact-menu">
          <button class="btn btn-ghost btn-icon btn-sm" id="btnTopbarMore" title="More actions" aria-label="More actions" aria-expanded="false">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="13" cy="8" r="1.3"/></svg>
          </button>
          <div class="ui-compact-menu-panel" id="topbarMoreMenu" hidden>
            <button class="ui-compact-menu-item" id="btnNewFromTemplate" type="button">New from Template</button>
            <button class="ui-compact-menu-item" id="btnFocusMode" type="button" aria-pressed="false">Enter Focus Mode</button>
            <button class="ui-compact-menu-item" id="btnTopbarWorkspace" type="button" aria-pressed="true">Toggle Workspace Panel</button>
            <button class="ui-compact-menu-item" id="btnTopbarDetails" type="button" aria-pressed="true">Toggle Note Details</button>
            <button class="ui-compact-menu-item" id="btnOpenTips" type="button">Help & Tips</button>
            <button class="ui-compact-menu-item" id="btnSettings" type="button">Settings</button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Body -->
    <main class="app-body" id="appMain" role="main">
      <!-- Sidebar: Tree -->
      <aside class="sidebar-tree shell-panel" id="sidebarTree" aria-label="Workspace navigation">
        <div class="sidebar-header">
          <span class="sidebar-header-label">Explorer</span>
          <button class="btn btn-ghost btn-icon btn-sm btn-icon-compact" id="btnToggleSidebarTree" title="Collapse sidebar"></button>
          <button class="btn btn-ghost btn-sm btn-compact" id="btnCollapseExplorerSections">Collapse all</button>
        </div>
        <div class="explorer-tabs" role="tablist" aria-label="Explorer tabs">
          <button class="explorer-tab active" type="button" role="tab" aria-selected="true" data-explorer-tab="library">Library</button>
          <button class="explorer-tab" type="button" role="tab" aria-selected="false" data-explorer-tab="folders">Folders</button>
          <button class="explorer-tab" type="button" role="tab" aria-selected="false" data-explorer-tab="tags">Tags</button>
        </div>
        <div class="tree-list" id="treeList">
          <div class="tree-section" data-section-id="library">
            <div class="tree-section-title" data-section-toggle="library">
              <span>Library</span>
              <span class="tree-section-caret">▾</span>
            </div>
            <div class="tree-item active" data-tree="all">
              <span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 4.5h4l1.2 1.5H14v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7z"/></svg></span>
              <span class="tree-item-label">All Notes</span>
              <span class="tree-item-count" id="allNotesCount">0</span>
            </div>
            <div class="tree-item" data-tree="pinned">
              <span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m8 2.3 1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.5l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5L8 2.3z"/></svg></span>
              <span class="tree-item-label">Favorites</span>
              <span class="tree-item-count" id="pinnedCount">0</span>
            </div>
            <div class="tree-item" data-tree="recent">
              <span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.2"/><path d="M8 5.2v3.1l2 1.4"/></svg></span>
              <span class="tree-item-label">Recent</span>
            </div>
          </div>
          <div class="tree-section" data-section-id="folders">
            <div class="tree-section-title" data-section-toggle="folders">
              <span>Folders</span>
              <span style="display:flex;align-items:center;gap:6px;">
                <button class="btn btn-ghost btn-icon btn-sm btn-icon-compact" id="btnNewFolder" title="New folder">+</button>
                <span class="tree-section-caret">▾</span>
              </span>
            </div>
            <div id="foldersList"></div>
          </div>
          <div class="tree-section" id="tocSection" data-section-id="toc" style="display:none;">
            <div class="tree-section-title" data-section-toggle="toc">
              <span>Table of Contents</span>
              <span class="tree-section-caret">▾</span>
            </div>
            <div id="tocList"></div>
          </div>
          <div class="tree-section" id="backlinksSection" data-section-id="backlinks" style="display:none;">
            <div class="tree-section-title" data-section-toggle="backlinks">
              <span>Backlinks</span>
              <span class="tree-section-caret">▾</span>
            </div>
            <div id="backlinksList"></div>
          </div>
          <div class="tree-section tree-section-tags" data-section-id="tags">
            <div class="tree-section-title" data-section-toggle="tags">
              <span>Tags</span>
              <span class="tree-section-caret">▾</span>
            </div>
            <div id="tagsList" class="tags-cloud"></div>
          </div>
        </div>
      </aside>

      <button class="workspace-edge-toggle" id="btnWorkspaceEdgeToggle" title="Hide workspace panel" aria-label="Hide workspace panel">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m10 3-5 5 5 5"/></svg>
      </button>
      <!-- Sidebar: File List -->
      <aside class="sidebar-filelist shell-panel" id="sidebarFilelist" aria-label="Notes list">
        <div class="filelist-header">
          <span class="filelist-header-title" id="filelistHeaderTitle">Notes Tree</span>
          <button class="btn btn-ghost btn-icon btn-sm btn-icon-compact" id="btnToggleSidebarFilelist" title="Collapse sidebar"></button>
          <div class="filelist-header-controls">
            <button class="btn btn-ghost btn-sm btn-compact" id="btnCollapseNoteTree">Collapse all</button>
            <span class="filelist-bulk-count" id="bulkSelectionCount" style="display:none;">0 selected</span>
            <button class="btn btn-ghost btn-sm btn-compact" id="btnBulkMove" style="display:none;">Move</button>
            <button class="btn btn-ghost btn-sm btn-compact" id="btnBulkDelete" style="display:none;color:var(--red);">Delete</button>
            <select id="sortSelect" class="shell-select shell-select-sm" aria-label="Sort notes">
              <option value="modified">Modified</option>
              <option value="created">Created</option>
              <option value="title">Title</option>
            </select>
            <span class="filelist-header-count" id="filelistCount">0 notes</span>
          </div>
        </div>
        <div class="filelist-items" id="filelistItems"></div>
      </aside>

      <!-- Editor Panel -->
      <section class="editor-panel shell-stage" id="editorPanel" role="region" aria-label="Editor panel">
        <span id="editor-area" tabindex="-1" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;"></span>
        <div class="empty-state" id="emptyState">
          <div class="empty-state-icon"><svg width="30" height="30" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h5l3 3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M9 2.5V6h3"/><path d="M5.4 9.2h5.2M5.4 11.2h3.6"/></svg></div>
          <h2>Welcome to Zed Note</h2>
          <p>Create a new note or select one from the sidebar to get started.</p>
          <div class="empty-state-actions">
            <button class="btn btn-primary" id="btnEmptyNew"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2.5v11M2.5 8h11"/></svg>Capture Draft</button>
            <button class="btn btn-ghost" id="btnEmptyTemplate">Use Template</button>
            <button class="btn btn-ghost" id="btnEmptyImport">Import</button>
            <button class="btn btn-ghost" id="btnEmptyMore" aria-expanded="false">More</button>
          </div>
          <div class="empty-state-more" id="emptyStateMore" hidden>
            <button class="btn btn-ghost btn-sm" id="btnEmptyOpenAI">Open AI Assistant</button>
            <button class="btn btn-ghost btn-sm" id="btnEmptyOpenSettings">Open Settings</button>
          </div>
        </div>

        <div id="editorContainer" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
          <!-- Editor Toolbar -->
          <div class="editor-toolbar">
            <input type="text" class="editor-title-input" id="noteTitle" placeholder="Note title..." />
            <div class="editor-toolbar-actions">
              <div class="save-indicator synced" id="saveIndicator" aria-live="polite">
                <span class="save-indicator-dot"></span>
                <div class="save-indicator-copy">
                  <span class="save-indicator-label" id="saveIndicatorLabel">Synced</span>
                  <span class="save-indicator-meta" id="saveIndicatorMeta">All changes up to date</span>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" id="btnToggleProperties" type="button" aria-expanded="false">Properties</button>
              <button class="btn btn-ghost btn-sm" id="btnSave" title="Save (Ctrl+S)"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 2.5h8l2 2V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M5 2.5v4h5v-4M5.2 11h5.6"/></svg> Save</button>
              <div class="ui-compact-menu">
                <button class="btn btn-ghost btn-icon btn-sm" id="btnEditorMore" title="Note actions" aria-label="Note actions" aria-expanded="false">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="13" cy="8" r="1.3"/></svg>
                </button>
                <div class="ui-compact-menu-panel" id="editorMoreMenu" hidden>
                  <button class="ui-compact-menu-item" id="btnHistory" type="button">Version History</button>
                  <button class="ui-compact-menu-item" id="btnPin" type="button">Pin / Unpin</button>
                  <button class="ui-compact-menu-item danger" id="btnDelete" type="button">Delete Note</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="editor-meta-row" id="editorMetaRow" hidden>
            <span class="editor-meta-label">Tags</span>
            <div id="tagField" class="editor-tag-field" role="group" aria-label="Note tags">
              <div id="tagPills" class="editor-tag-pills"></div>
              <input type="text" id="tagTextInput" class="editor-tag-text" placeholder="Add a tag..." autocomplete="off" />
              <div id="tagSuggestions" class="editor-tag-suggestions" style="display:none;"></div>
            </div>
            <input type="hidden" id="tagsInput" />
            <span class="editor-meta-label editor-meta-label-spaced">Folder</span>
            <select id="folderSelect" class="shell-select shell-select-sm" aria-label="Note folder">
              <option value="">None</option>
            </select>
          </div>

          <!-- View Mode Tabs -->
          <div class="editor-tabs">
            <div class="editor-tab active" data-view="edit" style="display:flex;align-items:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 11.8 11.8 3l1.2 1.2L4.2 13H3z"/><path d="M10.6 4.2 11.8 3l1.2 1.2-1.2 1.2"/></svg>Edit</div>
            <div class="editor-tab" data-view="preview" style="display:flex;align-items:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.8 8s2.2-3.5 6.2-3.5S14.2 8 14.2 8s-2.2 3.5-6.2 3.5S1.8 8 1.8 8Z"/><circle cx="8" cy="8" r="1.8"/></svg>Preview</div>
            <div class="editor-tab" data-view="split" style="display:flex;align-items:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/></svg>Split</div>
          </div>

          <!-- Formatting Toolbar -->
          <div class="editor-formatting" id="formattingBar">
            <button class="btn btn-ghost btn-sm formatting-collapse-toggle" id="btnToggleFormatBar" type="button" aria-expanded="false">Format</button>
            <div class="editor-formatting-content" id="formattingBarContent">
              <button class="fmt-btn" data-fmt="bold" title="Bold (Ctrl+B)"><strong>B</strong></button>
              <button class="fmt-btn" data-fmt="italic" title="Italic (Ctrl+I)"><em>I</em></button>
              <button class="fmt-btn" data-fmt="h1" title="Heading 1">H1</button>
              <span class="fmt-separator"></span>
              <button class="fmt-btn" data-fmt="ul" title="Bullet List">•</button>
              <button class="fmt-btn" data-fmt="code" title="Inline Code">&lt;/&gt;</button>
              <span class="fmt-separator"></span>
              <button class="fmt-btn" data-fmt="link" title="Insert Link (Ctrl+Shift+K)"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.2 9.8 9.8 6.2"/><path d="M5.1 11a2.4 2.4 0 0 1 0-3.4l2.5-2.5a2.4 2.4 0 1 1 3.4 3.4l-.9.9"/><path d="M10.9 5A2.4 2.4 0 0 1 14.3 8.4l-2.5 2.5a2.4 2.4 0 1 1-3.4-3.4l.9-.9"/></svg></button>
              <button class="fmt-btn" id="btnUpload" title="Upload Document (PDF, DOCX, Image)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2.5v7.2M5.5 5l2.5-2.5L10.5 5"/><rect x="3" y="10" width="10" height="3.5" rx="1"/></svg></button>
              <div class="ui-compact-menu format-more-menu">
                <button class="fmt-btn" id="btnToggleFormatMore" title="More formatting actions" aria-label="More formatting actions" aria-expanded="false">⋯</button>
                <div class="ui-compact-menu-panel format-more-panel" id="formatMorePanel" hidden>
                  <button class="fmt-btn" data-fmt="strikethrough" title="Strikethrough"><s>S</s></button>
                  <button class="fmt-btn" data-fmt="h2" title="Heading 2">H2</button>
                  <button class="fmt-btn" data-fmt="h3" title="Heading 3">H3</button>
                  <button class="fmt-btn" data-fmt="ol" title="Numbered List">1.</button>
                  <button class="fmt-btn" data-fmt="task" title="Task List">✓</button>
                  <button class="fmt-btn" data-fmt="codeblock" title="Code Block">[]</button>
                  <button class="fmt-btn" data-fmt="quote" title="Blockquote">"</button>
                  <button class="fmt-btn" data-fmt="image" title="Insert Image"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.4"/><circle cx="6" cy="6.2" r="1.1"/><path d="m3.8 11 2.8-2.4 2.1 1.7 2.2-2.2 1.3 2.9"/></svg></button>
                  <button class="fmt-btn" data-fmt="table" title="Insert Table">▦</button>
                  <button class="fmt-btn" data-fmt="mermaid" title="Insert Mermaid Diagram">◈</button>
                  <button class="fmt-btn" data-fmt="math" title="Insert Math (LaTeX)">∑</button>
                  <button class="fmt-btn" data-fmt="hr" title="Horizontal Rule">—</button>
                  <button class="fmt-btn" id="btnMic" title="Dictation (Speech-to-Text)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6" y="2.2" width="4" height="7.1" rx="2"/><path d="M4 7.9a4 4 0 0 0 8 0M8 11.9V14M6.4 14h3.2"/></svg></button>
                </div>
              </div>
            </div>
            <input type="file" id="uploadFileInput" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.txt,.md,.csv,.html" style="display:none;" />
          </div>

          <!-- Editor Content -->
          <div class="editor-content split" id="editorContent">
            <section class="editor-section" data-section="raw">
              <div class="editor-section-header">
                <div class="editor-section-header-primary">
                  <span class="editor-section-title">Raw Draft</span>
                  <span class="raw-model-status-badge idle" id="rawModelStatusBadge" title="Local LLM status for raw→markdown">No model loaded</span>
                </div>
                <div class="editor-section-actions">
                  <button class="btn btn-ghost btn-sm" id="btnOpenGenerationPrompt" title="Open generation prompt settings">Generation Prompt</button>
                  <span class="generation-prompt-summary" id="generationPromptSummary">Default prompt</span>
                  <button class="btn btn-ghost btn-sm" id="btnRegenerateMarkdown" title="Regenerate Markdown from Raw Draft">Regenerate</button>
                </div>
              </div>
              <div class="editor-section-body">
                <textarea id="rawEditorInput" class="raw-editor-input" placeholder="Capture rough ideas, meeting notes, thoughts, and voice transcriptions..."></textarea>
                <div class="raw-generation-hint" id="rawGenerationHint" style="display:none;">
                  <span id="rawGenerationHintText">AI model is not loaded. Load a model to generate markdown from raw notes.</span>
                  <div class="raw-generation-hint-actions">
                    <button class="btn btn-ghost btn-sm" id="btnRawLoadModel" type="button">Load Cached Model</button>
                    <button class="btn btn-ghost btn-sm" id="btnRawOpenModelCatalog" type="button">Model Catalog</button>
                  </div>
                </div>
                <div class="raw-action-pills" id="rawActionPills" style="display:none;"></div>
              </div>
            </section>

            <div class="split-divider"></div>

            <section class="editor-section" data-section="markdown">
              <div class="editor-section-header">
                <span class="editor-section-title">Markdown</span>
              </div>
              <div class="editor-section-body">
                <div class="editor-pane" id="editorPane"></div>
              </div>
            </section>

            <div class="split-divider"></div>

            <section class="editor-section" data-section="preview">
              <div class="editor-section-header">
                <span class="editor-section-title">Preview</span>
              </div>
              <div class="editor-section-body">
                <div class="preview-pane" id="previewPane"></div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <!-- Right Details Panel -->
      <aside class="note-details-panel shell-panel" id="noteDetailsPanel" aria-label="Note details">
        <div class="note-details-header">
          <span>Details</span>
          <button class="btn btn-ghost btn-icon btn-sm btn-icon-compact" id="btnToggleNoteDetailsPanel" title="Hide note details" aria-label="Hide note details" aria-pressed="true">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m10 3-5 5 5 5"/></svg>
          </button>
        </div>
        <div class="note-details-body">
          <section class="note-details-section" id="noteDetailsTocSection">
            <div class="note-details-section-title">Table of Contents</div>
            <div class="note-details-list" id="noteDetailsTocList">
              <p class="note-details-empty">Open a note to see its table of contents.</p>
            </div>
          </section>

          <section class="note-details-section" id="noteDetailsBacklinksSection" style="display:none;">
            <div class="note-details-section-title">Linked Mentions</div>
            <div class="note-details-list" id="noteDetailsBacklinksList"></div>
          </section>

          <section class="note-details-section">
            <div class="note-details-section-title">Properties</div>
            <div class="note-details-props">
              <div class="note-prop-row">
                <span class="note-prop-label">Status</span>
                <span class="note-prop-value"><span class="note-prop-badge" id="noteDetailsStatus">Idle</span></span>
              </div>
              <div class="note-prop-row">
                <span class="note-prop-label">Updated</span>
                <span class="note-prop-value" id="noteDetailsUpdated">-</span>
              </div>
              <div class="note-prop-row">
                <span class="note-prop-label">Folder</span>
                <span class="note-prop-value" id="noteDetailsFolder">-</span>
              </div>
              <div class="note-prop-row">
                <span class="note-prop-label">Tags</span>
                <span class="note-prop-value" id="noteDetailsTags">-</span>
              </div>
            </div>
          </section>
        </div>
      </aside>

      <!-- AI Panel (slide-out) -->
      <div class="ai-panel-backdrop" id="aiPanelBackdrop"></div>
      <aside class="ai-panel" id="aiPanel" aria-label="AI assistant">
        <div class="ai-panel-header">
          <span style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="10" height="8" rx="2"/><path d="M8 2.5v2"/><circle cx="6" cy="8" r=".7" fill="currentColor"/><circle cx="10" cy="8" r=".7" fill="currentColor"/><path d="M6 10.3h4"/></svg>AI Assistant</span>
          <div style="display:flex;gap:4px;align-items:center;">
            <button class="btn btn-ghost btn-icon btn-sm" id="btnAIMobileExpand" title="Expand to full screen" style="font-size:11px;display:none;"></button>
            <button class="btn btn-ghost btn-icon btn-sm" id="btnAIModels" title="Models" style="font-size:11px;"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v2.1M8 12.1v2.1M14.2 8h-2.1M3.9 8H1.8M12.4 3.6 11 5M5 11l-1.4 1.4M12.4 12.4 11 11M5 5 3.6 3.6"/></svg></button>
            <button class="btn btn-ghost btn-icon btn-sm" id="btnAIPanelClose" title="Close" style="font-size:14px;">${closeIconSvg(12)}</button>
          </div>
        </div>
        <div class="ai-mode-tabs" role="tablist" aria-label="AI mode">
          <button class="btn btn-ghost btn-sm active" role="tab" aria-selected="true" data-ai-mode-btn="assist" type="button">Assist</button>
          <button class="btn btn-ghost btn-sm" role="tab" aria-selected="false" data-ai-mode-btn="transform" type="button">Transform</button>
        </div>

        <!-- Model Status -->
        <div class="ai-model-status" id="aiModelStatus">
          <span id="aiModelName" style="font-size:11px;color:var(--text3);">No model loaded</span>
          <div id="aiProgressBar" style="display:none;height:4px;background:var(--bg2);border-radius:2px;overflow:hidden;margin-top:4px;">
            <div id="aiProgressFill" style="height:100%;background:var(--accent);width:0%;transition:width 0.3s;"></div>
          </div>
          <span id="aiProgressText" style="display:none;font-size:10px;color:var(--text3);margin-top:2px;"></span>
        </div>

        <!-- Chat Messages -->
        <div class="ai-messages" id="aiMessages"></div>

        <!-- Input Area -->
        <div class="ai-input-area">
          <div id="aiQuickBar" style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-ghost btn-sm ai-quick" data-prompt="Summarize" title="Summarize">Summary</button>
            <button class="btn btn-ghost btn-sm ai-quick" data-prompt="Expand" title="Expand">Expand</button>
            <button class="btn btn-ghost btn-sm ai-quick" data-prompt="Fix Grammar" title="Fix Grammar">Grammar</button>
            <button class="btn btn-ghost btn-sm ai-quick" data-prompt="Simplify" title="Simplify">Simplify</button>
            <button class="btn btn-ghost btn-sm ai-quick" data-prompt="Explain" title="Explain">Explain</button>
            <span style="flex:1;"></span>
            <button class="btn btn-ghost btn-sm" id="btnPromptLibrary" title="Prompt Library" style="font-size:11px;">Prompt Library</button>
          </div>
          <div class="ai-compose-wrapper">
            <textarea id="aiInput" class="ai-textarea" placeholder="Ask about your note or type a prompt…" rows="2"></textarea>
            <div class="ai-inline-actions">
              <button class="btn btn-ghost btn-sm ai-voice-btn ai-voice-active" id="btnAIVoiceOutput" title="Voice output on" aria-label="Toggle AI voice output" aria-pressed="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6h2l3-3v10l-3-3H3z"/><path d="M10 5.5a3.5 3.5 0 0 1 0 5"/></svg></button>
              <button class="btn btn-primary btn-sm ai-converse-btn" id="btnAIConverse" title="Converse" aria-label="Converse with AI"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.2" width="4" height="7.1" rx="2"/><path d="M4 7.9a4 4 0 0 0 8 0M8 11.9V14M6.4 14h3.2"/></svg></button>
            </div>
          </div>
          <div class="ai-compose-footer" id="aiComposeFooter">
            <button class="btn btn-ghost btn-sm ai-attach-btn" id="btnAIAttach" title="Attach file for analysis" aria-label="Attach file for analysis"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5.4 8.6 3.8-3.8a2.2 2.2 0 1 1 3.1 3.1L7.8 12.5a3.1 3.1 0 0 1-4.4-4.4l5-5"/></svg></button>
            <div id="aiAttachmentTray" class="ai-attachment-tray" style="display:none;"></div>
          </div>
          <input id="aiAttachInput" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff" style="display:none;" />
        </div>
      </aside>
    </main>

    <div class="sidebar-backdrop" id="sidebarBackdrop"></div>

    <!-- Statusbar -->
    <footer class="statusbar shell-chrome shell-chrome-footer">
      <div class="statusbar-left">
        <span class="status-dot" id="statusDot"></span>
        <span id="statusText">Ready</span>
      </div>
      <div class="statusbar-right">
        <button class="btn btn-ghost btn-icon btn-sm statusbar-details-toggle" id="btnStatusbarDetails" title="Toggle status details" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 5.4 8 10.2l4.8-4.8"/></svg>
        </button>
        <select id="syncProviderQuickSelect" class="shell-select shell-select-sm statusbar-provider-select" title="Sync provider" aria-label="Sync provider">
          <option value="gdrive">Google Drive</option>
          <option value="onedrive">OneDrive</option>
          <option value="dropbox">Dropbox</option>
        </select>
        <button class="btn btn-ghost btn-sm statusbar-sync-btn" id="btnSync" title="Sync now"><svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.1"/><path d="M13.5 3.4v2.8h-2.8"/></svg>Sync</button>
        <span class="sync-state-chip synced" id="syncStateChip"><span class="sync-state-chip-dot"></span><span id="syncStateChipText">Synced</span></span>
        <div class="statusbar-secondary" id="statusbarSecondary">
          <span id="syncStatus" class="sync-status-detail">All changes up to date</span>
          <button class="btn btn-ghost btn-sm status-pill-btn" id="btnWordCountDetails" title="Open writing details"><span id="wordCount"></span></button>
          <button class="btn btn-ghost btn-sm status-pill-btn perf-indicator" id="btnPerfDetails" title="Open performance details"><span class="perf-dot" id="perfDot"></span><span id="perfLabel">OK</span></button>
          <span id="cursorPos">Ln 1, Col 1</span>
          <span>Zed Note v1.0.0</span>
        </div>
      </div>
    </footer>

    <div class="modal-overlay" id="commandPaletteOverlay" style="display:none;">
      <div class="modal-dialog command-palette-dialog" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="command-palette-head">
          <span>Quick Actions</span>
          <span class="command-palette-kbd">Ctrl+K</span>
        </div>
        <input type="text" id="commandPaletteInput" class="command-palette-input" placeholder="Type a command..." autocomplete="off" />
        <div class="command-palette-list" id="commandPaletteList"></div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div class="modal-overlay" id="settingsOverlay" style="display:none;">
      <div class="modal-dialog settings-modal-shell" style="width:640px;max-height:84vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;font-size:15px;font-weight:600;">Settings</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseSettings" style="font-size:14px;">×</button>
        </div>
        <div class="settings-tabs" style="padding:10px 16px 0;border-bottom:1px solid var(--border);display:flex;gap:6px;overflow-x:auto;">
          <button class="btn btn-sm settings-tab-btn" type="button" data-settings-tab-button="general">General</button>
          <button class="btn btn-sm settings-tab-btn" type="button" data-settings-tab-button="sync">Sync & Backup</button>
          <button class="btn btn-sm settings-tab-btn" type="button" data-settings-tab-button="ai">AI</button>
          ${PASSKEY_UI_ENABLED ? '<button class="btn btn-sm settings-tab-btn" type="button" data-settings-tab-button="security">Security</button>' : ''}
          <button class="btn btn-sm settings-tab-btn" type="button" data-settings-tab-button="shortcuts">Shortcuts</button>
          <button class="btn btn-sm settings-tab-btn" type="button" data-settings-tab-button="accessibility">Accessibility</button>
        </div>
        <div class="settings-panels" style="padding:16px;display:flex;flex-direction:column;gap:16px;overflow-y:auto;">
          <section class="settings-tab-panel" data-settings-tab="sync" style="display:none;">
            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Cloud Sync</legend>
              <p style="font-size:11px;color:var(--text3);margin:0 0 10px;">Connect a cloud provider to sync your notes across devices.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm" id="btnConnectGdrive">Google Drive</button>
                <button class="btn btn-ghost btn-sm" id="btnConnectOnedrive">OneDrive</button>
                <button class="btn btn-ghost btn-sm" id="btnConnectDropbox">Dropbox</button>
              </div>
              <div id="syncProviderGuide" style="margin-top:10px;border:1px solid var(--border);border-radius:8px;padding:10px;background:var(--bg3);"></div>
              <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
                <button class="btn btn-primary btn-sm" id="btnConnectSelectedProvider">Connect</button>
              </div>
              <div id="syncProviderStatus" style="margin-top:8px;font-size:11px;color:var(--text3);"></div>
              <div style="margin-top:8px;display:flex;gap:8px;">
                <button class="btn btn-ghost btn-sm" id="btnDisconnectSync" style="display:none;color:var(--red);">Disconnect</button>
                <button class="btn btn-ghost btn-sm" id="btnForceSyncSettings">Force Sync</button>
              </div>
            </fieldset>

            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:16px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Backup</legend>

              <!-- Stat pills -->
              <div class="backup-stat-row">
                <span class="backup-stat-pill" id="backupStatDate">Last export: —</span>
                <span class="backup-stat-pill" id="backupStatCount">— notes</span>
              </div>

              <!-- Scope selector -->
              <p style="font-size:11px;font-weight:600;margin:12px 0 6px;">Export scope</p>
              <div class="backup-scope-row">
                <label class="backup-scope-card active" id="backupScopeAllCard">
                  <input type="radio" name="backupScope" value="all" checked style="display:none;" />
                  <span class="backup-scope-check">✓</span>
                  <span class="backup-scope-label">All Notes</span>
                </label>
                <label class="backup-scope-card" id="backupScopePinnedCard">
                  <input type="radio" name="backupScope" value="pinned" style="display:none;" />
                  <span class="backup-scope-check">✓</span>
                  <span class="backup-scope-label">Pinned Only</span>
                </label>
              </div>

              <!-- Export button -->
              <div style="display:flex;align-items:center;gap:8px;margin-top:12px;">
                <button class="btn btn-primary btn-sm" id="btnExport">
                  Generate ZIP <span id="exportSpinner" style="display:none;">…</span>
                </button>
              </div>

              <!-- Backup activity log -->
              <p style="font-size:11px;font-weight:600;margin:16px 0 6px;">Activity log</p>
              <table class="backup-log-table">
                <thead>
                  <tr><th>Type</th><th>Date</th><th>Details</th><th>Status</th></tr>
                </thead>
                <tbody id="backupLogTbody"></tbody>
              </table>
              <p id="backupLogEmpty" style="font-size:11px;color:var(--text3);margin:6px 0 0;">No activity yet.</p>

              <!-- Restore section -->
              <p style="font-size:11px;font-weight:600;margin:16px 0 6px;">Restore from backup</p>
              <div id="backupDropzone" class="backup-dropzone" role="button" tabindex="0" aria-label="Click or drag a ZIP to restore">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.5;margin-bottom:6px;"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Click or drag a <code>.zip</code> to restore</span>
              </div>
              <input type="file" id="importFileInput" accept=".zip" style="display:none;" />
              <div id="restoreStatus" style="margin-top:6px;font-size:11px;color:var(--text3);"></div>
            </fieldset>
          </section>

          <section class="settings-tab-panel" data-settings-tab="ai" style="display:none;">
            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">AI Providers</legend>
              <p style="font-size:11px;color:var(--text3);margin:0 0 10px;">Configure external LLM API keys. Keys are encrypted with AES-256-GCM.</p>
              <div style="margin-bottom:10px;">
                <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px;">Active Provider</label>
                <select id="selActiveProvider" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;">
                  <option value="local">Local (WebLLM)</option>
                </select>
              </div>
              <div id="aiProviderCards" style="display:flex;flex-direction:column;gap:10px;"></div>
              <div id="aiProviderStatus" style="margin-top:8px;font-size:11px;color:var(--text3);"></div>
            </fieldset>
          </section>

          <section class="settings-tab-panel" data-settings-tab="general" style="display:none;">
            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Appearance</legend>
              <div style="margin-bottom:10px;">
                <label style="font-size:11px;font-weight:600;display:block;margin-bottom:4px;">Theme</label>
                <select id="selTheme" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;"></select>
              </div>
              <div>
                <label style="font-size:11px;font-weight:600;display:block;margin-bottom:6px;">Accent Color</label>
                <div id="accentPicker" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
              </div>
            </fieldset>

            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:16px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Language</legend>
              <select id="selLanguage" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;"></select>
            </fieldset>

            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:16px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Speech Recognition</legend>
              <div style="display:flex;gap:8px;align-items:center;">
                <label style="font-size:11px;font-weight:500;">Language:</label>
                <select id="selSpeechLang" style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;"></select>
              </div>
            </fieldset>

            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:16px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">About</legend>
              <p style="font-size:11px;color:var(--text3);margin:0;">Zed Note v1.0.0</p>
              <p style="font-size:10px;color:var(--text3);margin:4px 0 0;">AI-assisted note-taking PWA with offline-first architecture.</p>
              <button class="btn btn-ghost btn-sm" id="btnKeyboardShortcuts" style="margin-top:8px;font-size:11px;">Keyboard Shortcuts ↗</button>
            </fieldset>
          </section>

          ${PASSKEY_UI_ENABLED ? `
          <section class="settings-tab-panel" data-settings-tab="security" style="display:none;">
            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Security</legend>
              <p style="font-size:11px;color:var(--text3);margin:0 0 10px;">Add a passkey so you can sign in with biometrics or your device lock screen.</p>
              <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn btn-primary btn-sm" id="btnEnrollPasskey">Add Passkey</button>
                <span id="passkeyEnrollmentStatus" style="font-size:11px;color:var(--text3);">Checking availability...</span>
              </div>
            </fieldset>
          </section>
          ` : ''}

          <!-- ── Shortcuts Tab ──────────────────────────────────── -->
          <section class="settings-tab-panel" data-settings-tab="shortcuts" style="display:none;">
            <div style="margin-bottom:12px;">
              <p style="font-size:11px;color:var(--text3);margin:0 0 10px;">Master the editor with these key bindings. Press any key combo in the app to trigger it.</p>
              <!-- Search -->
              <div class="shortcut-search-wrap">
                <svg class="shortcut-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" stroke-width="1.5"/><path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                <input type="text" id="shortcutSearchInput" class="shortcut-search-input" placeholder="Search commands or shortcuts…" autocomplete="off" />
              </div>
              <!-- Category filters -->
              <div class="shortcut-filter-bar" id="shortcutFilterBar">
                <button class="shortcut-filter-btn active" data-shortcut-category="all">All</button>
                <button class="shortcut-filter-btn" data-shortcut-category="General">General</button>
                <button class="shortcut-filter-btn" data-shortcut-category="Navigation">Navigation</button>
                <button class="shortcut-filter-btn" data-shortcut-category="Editor &amp; Formatting">Editor &amp; Formatting</button>
                <button class="shortcut-filter-btn" data-shortcut-category="Templates">Templates</button>
                <button class="shortcut-filter-btn" data-shortcut-category="AI">AI</button>
              </div>
            </div>
            <!-- Shortcut rows – rendered by JS into this container -->
            <div class="shortcut-list" id="shortcutList"></div>
          </section>

          <!-- ── Accessibility Tab ──────────────────────────────── -->
          <section class="settings-tab-panel" data-settings-tab="accessibility" style="display:none;">
            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Font Scale</legend>
              <p style="font-size:11px;color:var(--text3);margin:0 0 10px;">Adjust the editor and UI text size.</p>
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:11px;color:var(--text2);">A</span>
                <input type="range" id="fontScaleRange" min="80" max="130" step="5" value="100"
                       style="flex:1;accent-color:var(--accent);" aria-label="Font scale percentage" />
                <span style="font-size:15px;color:var(--text2);">A</span>
                <span id="fontScaleLabel" style="font-size:11px;color:var(--text3);min-width:36px;text-align:right;">100%</span>
              </div>
            </fieldset>

            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Display</legend>
              <label class="a11y-toggle-row">
                <span class="a11y-toggle-label">
                  <span style="font-size:12px;font-weight:500;">High Contrast</span>
                  <span style="font-size:11px;color:var(--text3);display:block;margin-top:2px;">Increases contrast ratios for text and borders</span>
                </span>
                <input type="checkbox" id="highContrastToggle" class="a11y-toggle" role="switch" />
              </label>
              <label class="a11y-toggle-row" style="margin-top:10px;">
                <span class="a11y-toggle-label">
                  <span style="font-size:12px;font-weight:500;">Reduce Motion</span>
                  <span style="font-size:11px;color:var(--text3);display:block;margin-top:2px;">Minimises animation and transition effects</span>
                </span>
                <input type="checkbox" id="reduceMotionToggle" class="a11y-toggle" role="switch" />
              </label>
              <label class="a11y-toggle-row" style="margin-top:10px;">
                <span class="a11y-toggle-label">
                  <span style="font-size:12px;font-weight:500;">Focus Ring Always Visible</span>
                  <span style="font-size:11px;color:var(--text3);display:block;margin-top:2px;">Show keyboard focus outlines even when using a mouse</span>
                </span>
                <input type="checkbox" id="focusRingToggle" class="a11y-toggle" role="switch" />
              </label>
            </fieldset>

            <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:12px;">
              <legend style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Screen Reader</legend>
              <p style="font-size:11px;color:var(--text3);margin:0 0 8px;">Live region announcements are active when using a screen reader.</p>
              <div style="display:flex;gap:8px;align-items:center;">
                <button class="btn btn-ghost btn-sm" id="btnA11yAnnounceTest" style="font-size:11px;">Test announcement</button>
                <span id="a11yTestStatus" style="font-size:11px;color:var(--text3);"></span>
              </div>
            </fieldset>
          </section>
        </div>
      </div>
    </div>

    <!-- History Modal -->
    <div class="modal-overlay" id="historyOverlay" style="display:none;">
      <div class="modal-dialog modal-dialog-lg modal-dialog-scroll">
        <div class="modal-header">
          <h3 class="modal-title">Version History</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseHistory" style="font-size:14px;">×</button>
        </div>
        <div class="modal-body">
          <div id="historyList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;max-height:150px;overflow-y:auto;"></div>
          <div id="historyDiff" style="font-family:monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;max-height:350px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>

    <!-- Conflict Modal -->
    <div class="modal-overlay" id="conflictOverlay" style="display:none;">
      <div class="modal-dialog modal-dialog-lg modal-dialog-scroll">
        <div class="modal-header">
          <h3 class="modal-title">Sync Conflict</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseConflict" style="font-size:14px;">×</button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px;color:var(--text3);margin:0 0 12px;">This note was changed both locally and remotely. Choose which version to keep:</p>
          <div id="conflictDiff" style="font-family:monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;max-height:300px;overflow-y:auto;margin-bottom:12px;"></div>
          <div class="modal-actions">
            <button class="btn btn-ghost btn-sm" id="btnKeepLocal">Keep Local</button>
            <button class="btn btn-primary btn-sm" id="btnKeepRemote">Keep Remote</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Catalog Modal -->
    <div class="modal-overlay" id="modelCatalogOverlay" style="display:none;">
      <div class="modal-dialog modal-dialog-md modal-dialog-scroll">
        <div class="modal-header">
          <h3 class="modal-title">Model Catalog</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseModelCatalog" style="font-size:14px;">×</button>
        </div>
        <div class="modal-body">
          <div id="gpuInfo" style="font-size:11px;color:var(--text3);margin-bottom:12px;"></div>
          <div id="modelCatalogList" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
      </div>
    </div>

    <!-- Prompt Library Modal -->
    <div class="modal-overlay" id="promptLibraryOverlay" style="display:none;">
      <div class="modal-dialog" style="width:620px;max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;font-size:15px;font-weight:600;">Prompt Library</h3>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="btn btn-ghost btn-sm" id="btnExportPrompts" title="Export" style="font-size:11px;">Export</button>
            <button class="btn btn-ghost btn-sm" id="btnImportPrompts" title="Import" style="font-size:11px;">Import</button>
            <input type="file" id="importPromptsInput" accept=".json" style="display:none;" />
            <button class="btn btn-primary btn-sm" id="btnNewPrompt" style="font-size:11px;">New</button>
            <button class="btn btn-ghost btn-icon btn-sm" id="btnClosePromptLibrary" style="font-size:14px;">×</button>
          </div>
        </div>
        <div style="padding:16px;">
          <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;">
            <button class="btn btn-sm prompt-filter active" data-filter="all" style="font-size:11px;">All</button>
            <button class="btn btn-sm prompt-filter" data-filter="writing" style="font-size:11px;">Writing</button>
            <button class="btn btn-sm prompt-filter" data-filter="analysis" style="font-size:11px;">Analysis</button>
            <button class="btn btn-sm prompt-filter" data-filter="transform" style="font-size:11px;">Transform</button>
            <button class="btn btn-sm prompt-filter" data-filter="translate" style="font-size:11px;">Translate</button>
            <button class="btn btn-sm prompt-filter" data-filter="custom" style="font-size:11px;">Custom</button>
          </div>
          <div id="promptLibraryList" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>
      </div>
    </div>

    <!-- Prompt Editor Modal -->
    <div class="modal-overlay" id="promptEditorOverlay" style="display:none;">
      <div class="modal-dialog" style="width:520px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;font-size:15px;font-weight:600;" id="promptEditorTitle">New Prompt</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnClosePromptEditor" style="font-size:14px;">×</button>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          <input type="text" id="promptEditorName" placeholder="Prompt name" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px;" />
          <textarea id="promptEditorSystem" placeholder="System instruction (optional)" rows="2" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;"></textarea>
          <textarea id="promptEditorTemplate" placeholder="User template — use {{selection}}, {{note}}, {{title}}, {{content}}" rows="4" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;font-family:inherit;resize:vertical;"></textarea>
          <p style="font-size:10px;color:var(--text3);margin:0;">Variables: <code>{{selection}}</code> <code>{{note}}</code> <code>{{title}}</code> <code>{{content}}</code> (selection or full note)</p>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" id="btnCancelPromptEditor">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btnSavePromptEditor">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Generation Prompt Modal -->
    <div class="modal-overlay" id="generationPromptOverlay" style="display:none;">
      <div class="modal-dialog" style="width:620px;max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;font-size:15px;font-weight:600;">Generation Prompt</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseGenerationPrompt" style="font-size:14px;">×</button>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          <label class="generation-prompt-field-label" for="generationPromptSystemInput">System instruction</label>
          <textarea id="generationPromptSystemInput" class="generation-prompt-input" rows="3" placeholder="Describe how the model should transform the raw draft into markdown."></textarea>
          <label class="generation-prompt-field-label" for="generationPromptTemplateInput">User template</label>
          <textarea id="generationPromptTemplateInput" class="generation-prompt-input generation-prompt-template" rows="6" placeholder="Use variables like {{raw}}, {{title}}, and {{markdown}}."></textarea>
          <p class="generation-prompt-hint">Variables: <code>{{raw}}</code> <code>{{title}}</code> <code>{{markdown}}</code> <code>{{content}}</code>. Prompt edits are saved per note and take effect on the next regenerate.</p>
          <div class="generation-prompt-actions">
            <button class="btn btn-ghost btn-sm generation-prompt-library-shortcut" id="btnLoadGenerationPromptFromLibrary" type="button">Load from Prompt Library</button>
            <button class="btn btn-ghost btn-sm generation-prompt-library-shortcut" id="btnSaveGenerationPromptToLibrary" type="button">Save to Prompt Library</button>
            <button class="btn btn-ghost btn-sm" id="btnResetGenerationPrompt" type="button">Reset to Default</button>
            <button class="btn btn-primary btn-sm" id="btnSaveGenerationPrompt" type="button">Save Prompt</button>
            <button class="btn btn-ghost btn-sm" id="btnCancelGenerationPrompt" type="button">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Note Templates Modal -->
    <div class="modal-overlay" id="noteTemplatesOverlay" style="display:none;">
      <div class="modal-dialog" style="width:560px;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;font-size:15px;font-weight:600;">New from Template</h3>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="btn btn-primary btn-sm" id="btnNewNoteTemplate" style="font-size:11px;">Custom</button>
            <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseNoteTemplates" style="font-size:14px;">×</button>
          </div>
        </div>
        <div style="padding:16px;">
          <div id="noteTemplatesList" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
        </div>
      </div>
    </div>

    <!-- Note Template Editor Modal -->
    <div class="modal-overlay" id="noteTemplateEditorOverlay" style="display:none;">
      <div class="modal-dialog" style="width:520px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);">
          <h3 style="margin:0;font-size:15px;font-weight:600;" id="noteTemplateEditorTitle">New Note Template</h3>
          <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseNoteTemplateEditor" style="font-size:14px;">×</button>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          <input type="text" id="noteTemplateEditorName" placeholder="Template name" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px;" />
          <input type="text" id="noteTemplateEditorIcon" placeholder="Icon" maxlength="2" style="width:60px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px;text-align:center;" />
          <input type="text" id="noteTemplateEditorCategory" placeholder="Category (e.g. Work, Personal)" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:13px;" />
          <textarea id="noteTemplateEditorContent" placeholder="Template content — use {{date}}, {{title}}" rows="8" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:12px;font-family:monospace;resize:vertical;"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" id="btnCancelNoteTemplateEditor">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btnSaveNoteTemplateEditor">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Keyboard Shortcuts Modal -->
    <div class="modal-overlay" id="shortcutsOverlay" style="display:none;">
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <span class="modal-title">Keyboard Shortcuts</span>
          <button class="btn-close" id="btnCloseShortcuts">&times;</button>
        </div>
        <div style="padding:16px;" id="shortcutsGrid"></div>
      </div>
    </div>

    <!-- Onboarding Overlay -->
    <div class="onboarding-overlay" id="onboardingOverlay" style="display:none;">
      <div class="onboarding-card">
        <h2 id="onboardingTitle" style="margin:0 0 8px;">Welcome to Zed Note 🎉</h2>
        <p id="onboardingText" style="color:var(--text2);font-size:13px;margin:0 0 16px;">A powerful, private note-taking app that runs entirely in your browser.</p>
        <div class="onboarding-steps" id="onboardingSteps"></div>
        <div class="onboarding-actions">
          <button class="btn btn-ghost" id="btnOnboardingBack" type="button">Back</button>
          <button class="btn btn-primary" id="btnOnboardingNext" type="button">Next</button>
          <button class="btn btn-ghost" id="btnOnboardingDismiss" type="button">Skip</button>
        </div>
      </div>
    </div>

    <!-- Mobile: peek strip to open TOC / Favorites (sheet is off-screen until opened) -->
    <button type="button" class="mobile-toc-peek" id="btnMobileTocPeek" aria-label="Open contents and favorites">
      <span class="mobile-toc-peek-handle" aria-hidden="true"></span>
      <span class="mobile-toc-peek-label">Contents &amp; favorites</span>
    </button>

    <!-- Mobile Bottom Drawer (TOC / Favorites) -->
    <div class="mobile-bottom-drawer" id="mobileBottomDrawer">
      <div class="mobile-bottom-drawer-handle"></div>
      <div class="mobile-bottom-drawer-header">
        <div class="mobile-bottom-drawer-tabs">
          <button class="mobile-bottom-tab active" data-drawer-tab="toc">Contents</button>
          <button class="mobile-bottom-tab" data-drawer-tab="pinned">Favorites</button>
        </div>
        <button class="btn btn-ghost btn-icon btn-sm mobile-bottom-drawer-close" id="btnCloseMobileDrawer" title="Close">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 4l8 8M12 4 4 12"/></svg>
        </button>
      </div>
      <div class="mobile-bottom-drawer-body">
        <div class="mobile-bottom-panel active" id="mobileDrawerToc" data-drawer-panel="toc">
          <div id="mobileDrawerTocList"></div>
        </div>
        <div class="mobile-bottom-panel" id="mobileDrawerPinned" data-drawer-panel="pinned">
          <div id="mobileDrawerPinnedList"></div>
        </div>
      </div>
    </div>
    <div class="mobile-bottom-drawer-backdrop" id="mobileBottomDrawerBackdrop"></div>

    <!-- Drop Zone Overlay -->
    <div class="dropzone-overlay" id="dropzoneOverlay" style="display:none;">
      <div class="dropzone-box">Drop file to extract text</div>
    </div>

    <!-- Upload Progress -->
    <div class="upload-progress" id="uploadProgress" style="display:none;">
      <div class="upload-progress-bar">
        <div class="upload-progress-fill" id="uploadProgressFill"></div>
      </div>
      <button class="upload-progress-cancel" id="uploadProgressCancel">&times;</button>
    </div>
  `;
}

/* ─── Initialize App ─── */
async function init(): Promise<void> {
  // Load theme first (prevents flash)
  await loadThemeFromSettings();

  // Render shell
  renderApp();
  mergeWorkspacePanels();
  loadCollapsedExplorerSections();
  setWorkspacePanelHidden(false);
  setNoteDetailsPanelHidden(true);
  document.getElementById('btnWorkspaceEdgeToggle')?.addEventListener('click', () => setWorkspacePanelHidden(!workspacePanelHidden));
  document.getElementById('btnTopbarWorkspace')?.addEventListener('click', () => setWorkspacePanelHidden(!workspacePanelHidden));
  document.getElementById('btnTopbarDetails')?.addEventListener('click', () => setNoteDetailsPanelHidden(!noteDetailsPanelHidden));
  document.getElementById('btnFocusMode')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeCompactMenus();
    setFocusModeEnabled(!focusModeEnabled);
  });
  document.getElementById('btnToggleNoteDetailsPanel')?.addEventListener('click', () => setNoteDetailsPanelHidden(!noteDetailsPanelHidden));
  document.getElementById('btnTopbarMore')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCompactMenu('btnTopbarMore', 'topbarMoreMenu');
  });
  document.getElementById('btnEditorMore')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCompactMenu('btnEditorMore', 'editorMoreMenu');
  });
  document.getElementById('btnToggleFormatMore')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCompactMenu('btnToggleFormatMore', 'formatMorePanel');
  });
  document.getElementById('btnToggleFormatBar')?.addEventListener('click', () => {
    const expanded = document.getElementById('formattingBar')?.classList.contains('compact-open') ?? false;
    setFormattingToolbarExpanded(!expanded);
  });
  document.getElementById('btnToggleProperties')?.addEventListener('click', () => {
    setNotePropertiesExpanded(!notePropertiesExpanded);
  });
  document.querySelectorAll('.ui-compact-menu-item').forEach((el) => {
    el.addEventListener('click', () => closeCompactMenus());
  });
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('.ui-compact-menu')) closeCompactMenus();
    if (!target?.closest('#formattingBar')) setFormattingToolbarExpanded(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCompactMenus();
      setFormattingToolbarExpanded(false);
      document.getElementById('app')?.classList.remove('topbar-search-expanded');
    }
  });
  modernizeDialogCloseIcons();
  wireCollapsibleExplorerSections();
  wireExplorerTabs();

  initTips(() => {});

  document.getElementById('btnMobileShellMenu')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleCompactMenu('btnMobileShellMenu', 'mobileShellMenu');
  });
  document.getElementById('btnMobileExplorer')?.addEventListener('click', () => {
    closeCompactMenus();
    toggleMobileDrawer('tree');
  });
  document.getElementById('btnMobileToc')?.addEventListener('click', () => {
    closeCompactMenus();
    void openMobileBottomDrawer('toc');
  });
  document.getElementById('btnMobileTocPeek')?.addEventListener('click', () => { void openMobileBottomDrawer('toc'); });
  document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileDrawers);
  document.getElementById('btnCloseMobileDrawer')?.addEventListener('click', closeMobileBottomDrawer);
  document.getElementById('mobileBottomDrawerBackdrop')?.addEventListener('click', closeMobileBottomDrawer);
  wireMobileBottomDrawerGestures();
  document.querySelectorAll<HTMLElement>('[data-drawer-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.drawerTab as 'toc' | 'pinned';
      void switchMobileDrawerTab(tab);
    });
  });

  document.getElementById('btnOpenTips')?.addEventListener('click', showAllTipsModal);
  document.getElementById('btnEmptyTemplate')?.addEventListener('click', openNoteTemplates);
  document.getElementById('btnEmptyImport')?.addEventListener('click', () => openSettings('sync'));
  document.getElementById('btnEmptyOpenSettings')?.addEventListener('click', () => openSettings());
  document.getElementById('btnEmptyOpenAI')?.addEventListener('click', () => { void toggleAIPanel(); });
  document.getElementById('btnEmptyMore')?.addEventListener('click', () => {
    const more = document.getElementById('emptyStateMore');
    const btn = document.getElementById('btnEmptyMore') as HTMLButtonElement | null;
    if (!more || !btn) return;
    const next = more.hidden;
    more.hidden = !next;
    btn.setAttribute('aria-expanded', String(next));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-ai-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.aiModeBtn as AIPanelMode | undefined;
      if (!mode) return;
      setAIPanelMode(mode);
    });
  });
  document.getElementById('btnWordCountDetails')?.addEventListener('click', () => {
    void refreshFileList(currentListFilter, currentSearchQuery);
    setStatus('Updated writing statistics.');
  });
  document.getElementById('btnPerfDetails')?.addEventListener('click', () => {
    openSettings('general');
  });
  document.getElementById('quickCaptureInput')?.addEventListener('keydown', async (e: Event) => {
    const event = e as KeyboardEvent;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;
    await createNewNote();
    if (currentNote?.id) {
      currentNote.title = text.length > 64 ? `${text.slice(0, 61)}...` : text;
      await saveCurrentNote(true);
      if (editor) replaceContent(editor, text);
      await saveCurrentNote(true);
      setStatus('Quick capture saved.');
      announce('Quick capture note created.');
    }
    input.value = '';
  });

  loadRecentCommands();

  // Load notes & render file list
  await refreshFileList();

  // Build full-text search index
  scheduleSearchIndexBuild();

  const savedFocusMode = localStorage.getItem('focusModeEnabled') === 'true';
  const layoutPrefs = loadLayoutPrefs();
  setFocusModeEnabled(layoutPrefs?.focusModeEnabled ?? savedFocusMode);
  setWorkspacePanelHidden(layoutPrefs?.workspacePanelHidden ?? false);
  setNoteDetailsPanelHidden(layoutPrefs?.noteDetailsPanelHidden ?? true);
  setViewMode(layoutPrefs?.viewMode ?? 'split');
  setAIPanelMode(layoutPrefs?.aiMode ?? 'assist');

  // Load folders
  await refreshFolders();

  // Wire up new folder button
  document.getElementById('btnNewFolder')?.addEventListener('click', createFolder);

  document.getElementById('btnCollapseExplorerSections')?.addEventListener('click', () => {
    const sections = getVisibleExplorerSections();
    const allCollapsed = sections.length > 0 && sections.every(section => section.classList.contains('collapsed'));
    sections.forEach(section => {
      const sectionId = section.dataset.sectionId;
      if (!sectionId) return;
      if (allCollapsed) {
        section.classList.remove('collapsed');
        collapsedExplorerSections.delete(sectionId);
      } else {
        section.classList.add('collapsed');
        collapsedExplorerSections.add(sectionId);
      }
    });
    persistCollapsedExplorerSections();
    updateExplorerCollapseButtonLabel();
  });

  document.getElementById('btnToggleSidebarTree')?.addEventListener('click', () => {
    sidebarTreeCollapsed = !sidebarTreeCollapsed;
    const sidebar = document.getElementById('sidebarTree');
    const btn = document.getElementById('btnToggleSidebarTree');
    if (sidebar) {
      sidebar.classList.toggle('collapsed', sidebarTreeCollapsed);
      if (btn) {
        btn.title = sidebarTreeCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        btn.innerHTML = sidebarTreeCollapsed ? '▶' : '◀';
      }
    }
  });

  document.getElementById('btnToggleSidebarFilelist')?.addEventListener('click', () => {
    sidebarFilelistCollapsed = !sidebarFilelistCollapsed;
    const sidebar = document.getElementById('sidebarFilelist') ?? document.getElementById('sidebarTree');
    const btn = document.getElementById('btnToggleSidebarFilelist');
    if (sidebar) {
      sidebar.classList.toggle('collapsed', sidebarFilelistCollapsed);
      if (btn) {
        btn.title = sidebarFilelistCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        btn.innerHTML = sidebarFilelistCollapsed ? '▶' : '◀';
      }
    }
  });

  document.getElementById('btnCollapseNoteTree')?.addEventListener('click', async () => {
    const groups = Array.from(document.querySelectorAll<HTMLElement>('.note-tree-folder, .note-tree-group'));
    const allCollapsed = groups.length > 0 && groups.every(group => group.classList.contains('collapsed'));
    groups.forEach(group => {
      const folderNodeId = group.dataset.folderNodeId;
      const groupKey = group.dataset.groupKey;
      const key = folderNodeId ? `folder:${folderNodeId}` : (groupKey || 'root:unfiled');
      if (allCollapsed) collapsedNoteTreeFolders.delete(key);
      else collapsedNoteTreeFolders.add(key);
    });
    await refreshFileList();
  });

  document.getElementById('btnBulkMove')?.addEventListener('click', async () => {
    if (selectedNoteIds.size === 0) return;
    const ids = [...selectedNoteIds];
    const folders = await db.folders.orderBy('order').toArray();
    const names = ['(Unfiled)', ...folders.map((f) => f.name)];
    const choice = prompt(`Move selected notes to:\n${names.map((name, i) => `${i}. ${name}`).join('\n')}\n\nEnter number:`);
    if (choice == null) return;
    const idx = Number.parseInt(choice, 10);
    if (Number.isNaN(idx) || idx < 0 || idx > folders.length) return;
    const folderId = idx === 0 ? null : (folders[idx - 1]?.id ?? null);
    await moveNotesToFolder(ids, folderId);
    clearNoteSelection();
    setStatus(`Moved ${ids.length} note${ids.length === 1 ? '' : 's'}`);
  });

  document.getElementById('btnBulkDelete')?.addEventListener('click', async () => {
    if (selectedNoteIds.size === 0) return;
    const ids = [...selectedNoteIds];
    if (!confirm(`Delete ${ids.length} selected note${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    for (const noteId of ids) {
      removeFromIndex(noteId);
      await db.notes.delete(noteId);
      await deleteRemoteNoteFromFirestore(noteId);
      if (currentNote?.id === noteId) {
        currentNote = null;
        editor = null;
      }
    }
    clearNoteSelection();
    document.getElementById('editorContainer')!.style.display = currentNote ? 'flex' : 'none';
    document.getElementById('emptyState')!.style.display = currentNote ? 'none' : '';
    if (!currentNote) document.getElementById('editorPane')!.innerHTML = '';
    syncAppEditorNoteActiveClass();
    await refreshFileList();
    setStatus(`Deleted ${ids.length} note${ids.length === 1 ? '' : 's'}`);
  });
  // Wire "All Notes" as a drop target for removing note from folder
  wireAllNotesDrop();

  // Wire up sort select
  document.getElementById('sortSelect')?.addEventListener('change', (e: Event) => {
    currentSort = (e.target as HTMLSelectElement).value as 'modified' | 'created' | 'title';
    refreshFileList();
  });

  // Wire up new note buttons
  document.getElementById('btnNewNote')?.addEventListener('click', createNewNote);
  document.getElementById('btnNewFromTemplate')?.addEventListener('click', openNoteTemplates);
  document.getElementById('btnEmptyNew')?.addEventListener('click', createNewNote);

  // Wire up tree navigation
  document.querySelectorAll<HTMLElement>('[data-tree]').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.tree-item').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      closeMobileDrawers();
      refreshFileList(el.dataset.tree);
    });
  });

  // Wire up view mode tabs
  document.querySelectorAll<HTMLElement>('.editor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setViewMode(tab.dataset.view as 'edit' | 'preview' | 'split');
    });
  });

  document.getElementById('btnRegenerateMarkdown')?.addEventListener('click', () => {
    if (currentNote) currentNote.markdownDirty = false;
    const raw = getRawEditorValue();
    if (!raw.trim()) {
      setStatus('Add raw draft text before regenerating markdown.');
      return;
    }
    void generateMarkdownFromRaw(raw);
  });
  document.getElementById('btnRawLoadModel')?.addEventListener('click', () => {
    void tryLoadModelForRawMarkdown();
  });
  document.getElementById('btnRawOpenModelCatalog')?.addEventListener('click', () => {
    openModelCatalog();
  });

  document.getElementById('btnOpenGenerationPrompt')?.addEventListener('click', () => {
    openGenerationPromptEditor();
  });
  document.getElementById('btnCloseGenerationPrompt')?.addEventListener('click', () => {
    closeGenerationPromptEditor();
  });
  document.getElementById('btnCancelGenerationPrompt')?.addEventListener('click', () => {
    closeGenerationPromptEditor();
  });
  document.getElementById('generationPromptOverlay')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeGenerationPromptEditor();
  });

  const handleGenerationPromptInput = () => {
    syncGenerationPromptDraftFromInputs();
    queueSilentNoteSave();
  };
  getGenerationPromptSystemInput()?.addEventListener('input', handleGenerationPromptInput);
  getGenerationPromptTemplateInput()?.addEventListener('input', handleGenerationPromptInput);

  document.getElementById('btnResetGenerationPrompt')?.addEventListener('click', () => {
    const systemInput = getGenerationPromptSystemInput();
    const templateInput = getGenerationPromptTemplateInput();
    if (systemInput) systemInput.value = DEFAULT_MARKDOWN_PROMPT_SYSTEM;
    if (templateInput) templateInput.value = DEFAULT_MARKDOWN_PROMPT_TEMPLATE;
    syncGenerationPromptDraftFromInputs();
    queueSilentNoteSave(0);
  });

  document.getElementById('btnSaveGenerationPrompt')?.addEventListener('click', async () => {
    syncGenerationPromptDraftFromInputs();
    await saveCurrentNote(true);
    setStatus('Generation prompt saved');
    closeGenerationPromptEditor();
  });

  document.getElementById('btnLoadGenerationPromptFromLibrary')?.addEventListener('click', () => {
    void loadGenerationPromptFromLibrary();
  });

  document.getElementById('btnSaveGenerationPromptToLibrary')?.addEventListener('click', () => {
    void saveGenerationPromptToLibraryFromNote();
  });

  document.getElementById('rawEditorInput')?.addEventListener('input', (e: Event) => {
    const raw = (e.target as HTMLTextAreaElement).value;
    if (currentNote) currentNote.rawContent = raw;
    if (raw.trim()) void ensureLLMRuntime();
    updateRawGenerationAvailabilityUI();
    scheduleActionPillsGeneration(raw);
    scheduleMarkdownAutogeneration(raw);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveCurrentNote(true);
    }, 2000);
  });

  // Wire up formatting toolbar
  document.getElementById('formattingBar')?.addEventListener('click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-fmt]');
    if (!target || !editor) return;
    handleFormat(target.dataset.fmt!);
    closeCompactMenus();
  });

  // Wire up save
  document.getElementById('btnSave')?.addEventListener('click', () => saveCurrentNote());

  // Wire up delete
  document.getElementById('btnDelete')?.addEventListener('click', deleteCurrentNote);

  // Wire up pin
  document.getElementById('btnPin')?.addEventListener('click', togglePin);

  // Wire up history
  document.getElementById('btnHistory')?.addEventListener('click', openHistory);

  // Wire up title rename → live file list + auto-save
  let titleSaveTimer: ReturnType<typeof setTimeout> | null = null;
  document.getElementById('noteTitle')?.addEventListener('input', (e: Event) => {
    const title = (e.target as HTMLInputElement).value.trim() || 'Untitled';
    // Update file list item title in real time
    if (currentNote?.id) {
      const item = document.querySelector<HTMLElement>(`.note-tree-note[data-note-id="${currentNote.id}"] .note-tree-note-title`) ||
        document.querySelector<HTMLElement>(`.file-item[data-note-id="${currentNote.id}"] .file-item-title`);
      if (item) item.textContent = title;
    }
    // Debounced save
    if (titleSaveTimer) clearTimeout(titleSaveTimer);
    titleSaveTimer = setTimeout(() => saveCurrentNote(true), 1000);
  });

  wireTagInput();

  // Wire up search
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  const searchInputEl = document.getElementById('searchInput') as HTMLInputElement | null;
  const appShell = document.getElementById('app');
  searchInputEl?.addEventListener('input', (e: Event) => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const query = (e.target as HTMLInputElement).value;
      if (query.trim()) await ensureSearchIndexReady();
      refreshFileList('all', query);
    }, 300);
  });
  if (searchInputEl && appShell) {
    searchInputEl.addEventListener('focus', () => {
      if (isMobileViewport()) {
        closeCompactMenus();
        appShell.classList.add('topbar-search-expanded');
      }
    });
    searchInputEl.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (document.activeElement === searchInputEl) return;
        if (isMobileViewport()) appShell.classList.remove('topbar-search-expanded');
      }, 160);
    });
    document.getElementById('btnMobileSearchBack')?.addEventListener('click', () => {
      appShell.classList.remove('topbar-search-expanded');
      searchInputEl.blur();
    });
    document.querySelector('.search-wrap')?.addEventListener('click', (ev: Event) => {
      if (!isMobileViewport() || appShell.classList.contains('topbar-search-expanded')) return;
      const t = ev.target as HTMLElement;
      if (t.closest('button') || t.closest('input')) return;
      searchInputEl.focus();
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentNote();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNewNote();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && e.shiftKey && editor) {
      e.preventDefault();
      handleFormat('link');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey) {
      e.preventDefault();
      openCommandPalette();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b' && editor) {
      e.preventDefault();
      handleFormat('bold');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i' && editor) {
      e.preventDefault();
      handleFormat('italic');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const ov = document.getElementById('shortcutsOverlay')!;
      ov.style.display = ov.style.display === 'none' ? 'flex' : 'none';
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
      e.preventDefault();
      toggleAIPanel();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
    }
    if (e.key === 'Escape') {
      closeCommandPalette();
    }
  });

  const commandPaletteInput = document.getElementById('commandPaletteInput') as HTMLInputElement | null;
  commandPaletteInput?.addEventListener('input', () => {
    renderCommandPaletteList(commandPaletteInput.value);
  });
  commandPaletteInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const firstEnabled = document.querySelector<HTMLElement>('.command-palette-item:not(.disabled)');
      firstEnabled?.click();
    }
  });
  document.getElementById('commandPaletteOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'commandPaletteOverlay') closeCommandPalette();
  });

  document.getElementById('btnStatusbarDetails')?.addEventListener('click', () => {
    const app = document.getElementById('app');
    const btn = document.getElementById('btnStatusbarDetails');
    if (!app || !btn) return;
    const opened = app.classList.toggle('statusbar-details-open');
    btn.setAttribute('aria-expanded', String(opened));
  });

  // Online/offline detection
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ─── Settings modal ───
  document.getElementById('btnSettings')?.addEventListener('click', () => openSettings());
  document.getElementById('btnCloseSettings')?.addEventListener('click', closeSettings);
  document.getElementById('settingsOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'settingsOverlay') closeSettings();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-settings-tab-button]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.settingsTabButton as SettingsTabId | undefined;
      if (!tab) return;
      switchSettingsTab(tab);
      if (tab === 'sync') { renderBackupLog(); updateBackupStats(); }
    });
  });
  if (PASSKEY_UI_ENABLED) {
    document.getElementById('btnEnrollPasskey')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnEnrollPasskey') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adding...';
      }
      await refreshPasskeyEnrollmentStatus('Waiting for passkey confirmation...');
      try {
        const authPasskeyModule = await getAuthPasskeyModule();
        await authPasskeyModule.enrollCurrentUserPasskey();
        await refreshPasskeyEnrollmentStatus('Passkey added successfully.');
      } catch (error) {
        await refreshPasskeyEnrollmentStatus(error instanceof Error ? error.message : 'Could not add passkey.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Add Passkey';
        }
        await refreshPasskeyEnrollmentStatus();
      }
    });
  }

  // ─── Cloud provider setup assistant ───
  document.getElementById('btnConnectGdrive')?.addEventListener('click', () => setSyncProviderSelection('gdrive'));
  document.getElementById('btnConnectOnedrive')?.addEventListener('click', () => setSyncProviderSelection('onedrive'));
  document.getElementById('btnConnectDropbox')?.addEventListener('click', () => setSyncProviderSelection('dropbox'));
  document.getElementById('btnConnectSelectedProvider')?.addEventListener('click', () => connectProvider(selectedSyncProviderType));
  document.getElementById('btnDisconnectSync')?.addEventListener('click', disconnectSync);
  document.getElementById('btnForceSyncSettings')?.addEventListener('click', () => doSync());

  document.getElementById('syncProviderQuickSelect')?.addEventListener('change', (e) => {
    const selected = (e.target as HTMLSelectElement).value as SyncProviderType;
    setSyncProviderSelection(selected);
  });

  // ─── Sync button in statusbar ───
  document.getElementById('btnSync')?.addEventListener('click', async () => {
    const provider = syncEngine.getProvider();
    if (!provider || !provider.isAuthenticated()) {
      await connectProvider(selectedSyncProviderType);
      return;
    }
    await doSync();
  });

  // ─── Sync engine state listener ───
  syncEngine.onStateChange((state, msg) => {
    switch (state) {
      case 'syncing':
        setSyncVisualState('syncing', 'Processing cloud changes');
        break;
      case 'error':
        setSyncVisualState(navigator.onLine ? 'failed' : 'offline', msg || 'Sync error');
        break;
      case 'idle':
        refreshSyncVisualState();
        break;
    }
  });

  // Restore last sync provider
  await restoreSyncProvider();

  // ─── Backup: Export / Import ───
  // ─── Backup log helpers ───
  interface BackupLogEntry {
    type: 'export' | 'restore';
    date: string;
    details: string;
    status: 'success' | 'failed';
  }
  const BACKUP_LOG_KEY = 'backupLog';

  function getBackupLog(): BackupLogEntry[] {
    try { return JSON.parse(localStorage.getItem(BACKUP_LOG_KEY) ?? '[]'); }
    catch { return []; }
  }

  function addBackupLog(entry: BackupLogEntry): void {
    const log = getBackupLog();
    log.unshift(entry);
    localStorage.setItem(BACKUP_LOG_KEY, JSON.stringify(log.slice(0, 50)));
  }

  function renderBackupLog(): void {
    const tbody = document.getElementById('backupLogTbody');
    const empty = document.getElementById('backupLogEmpty');
    if (!tbody) return;
    const log = getBackupLog();
    if (log.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    tbody.innerHTML = log.map(e => {
      const badgeClass = e.status === 'success'
        ? (e.type === 'restore' ? 'backup-log-badge-restore' : 'backup-log-badge-success')
        : 'backup-log-badge-failed';
      return `<tr>
        <td style="text-transform:capitalize;">${e.type}</td>
        <td style="white-space:nowrap;">${e.date}</td>
        <td>${e.details}</td>
        <td><span class="backup-log-badge ${badgeClass}">${e.status}</span></td>
      </tr>`;
    }).join('');
  }

  function updateBackupStats(): void {
    const log = getBackupLog();
    const lastExport = log.find(e => e.type === 'export' && e.status === 'success');
    const datePill = document.getElementById('backupStatDate');
    const countPill = document.getElementById('backupStatCount');
    if (datePill) datePill.textContent = lastExport ? `Last export: ${lastExport.date}` : 'Last export: —';
    if (countPill) {
      const match = lastExport?.details.match(/(\d+) note/);
      countPill.textContent = match ? `${match[1]} notes` : '— notes';
    }
  }

  // ─── Backup: scope radio cards ───
  document.querySelectorAll<HTMLInputElement>('input[name="backupScope"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('backupScopeAllCard')?.classList.toggle('active', radio.value === 'all' ? radio.checked : !radio.checked);
      document.getElementById('backupScopePinnedCard')?.classList.toggle('active', radio.value === 'pinned' ? radio.checked : !radio.checked);
    });
  });

  // ─── Backup: Export ───
  document.getElementById('btnExport')?.addEventListener('click', async () => {
    const spinner = document.getElementById('exportSpinner');
    const btnExport = document.getElementById('btnExport') as HTMLButtonElement | null;
    if (spinner) spinner.style.display = '';
    if (btnExport) btnExport.disabled = true;
    const scopeInput = document.querySelector<HTMLInputElement>('input[name="backupScope"]:checked');
    const scope = (scopeInput?.value ?? 'all') as ExportOptions['scope'];
    try {
      const backupModule = await getBackupModule();
      const blob = await backupModule.exportToZip({ scope });
      const date = new Date().toISOString().slice(0, 10);
      const filename = `qp-notes-backup-${scope === 'pinned' ? 'pinned-' : ''}${date}.zip`;
      backupModule.downloadBlob(blob, filename);
      const sizeKb = Math.round(blob.size / 1024);
      const noteCount = (await db.notes.toArray()).length;
      addBackupLog({ type: 'export', date, details: `${noteCount} notes · ${sizeKb} KB · scope: ${scope}`, status: 'success' });
    } catch (err) {
      const date = new Date().toISOString().slice(0, 10);
      addBackupLog({ type: 'export', date, details: err instanceof Error ? err.message : 'unknown error', status: 'failed' });
    } finally {
      if (spinner) spinner.style.display = 'none';
      if (btnExport) btnExport.disabled = false;
    }
    renderBackupLog();
    updateBackupStats();
  });

  // ─── Backup: Restore (file input + dropzone) ───
  async function handleRestoreFile(file: File): Promise<void> {
    const statusEl = document.getElementById('restoreStatus');
    if (statusEl) statusEl.textContent = 'Restoring…';
    const date = new Date().toISOString().slice(0, 10);
    try {
      const backupModule = await getBackupModule();
      const result = await backupModule.importFromZip(file);
      const detail = `${result.notesImported} notes, ${result.foldersCreated} folders` +
        (result.errors.length ? ` (${result.errors.length} errors)` : '');
      if (statusEl) statusEl.textContent = `Restored: ${detail}`;
      addBackupLog({ type: 'restore', date, details: detail, status: 'success' });
      await refreshFileList();
      await refreshFolders();
      await rebuildSearchIndex();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error';
      if (statusEl) statusEl.textContent = `Restore failed: ${msg}`;
      addBackupLog({ type: 'restore', date, details: msg, status: 'failed' });
    }
    renderBackupLog();
    updateBackupStats();
  }

  document.getElementById('importFileInput')?.addEventListener('change', async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await handleRestoreFile(file);
    (e.target as HTMLInputElement).value = '';
  });

  const dropzone = document.getElementById('backupDropzone');
  dropzone?.addEventListener('click', () => {
    (document.getElementById('importFileInput') as HTMLInputElement | null)?.click();
  });
  dropzone?.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
      (document.getElementById('importFileInput') as HTMLInputElement | null)?.click();
    }
  });
  dropzone?.addEventListener('dragover', (e: Event) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragging'));
  dropzone?.addEventListener('drop', async (e: Event) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file) await handleRestoreFile(file);
  });

  // ─── History modal ───
  document.getElementById('btnHistory')?.addEventListener('click', openHistory);
  document.getElementById('btnCloseHistory')?.addEventListener('click', closeHistory);
  document.getElementById('historyOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'historyOverlay') closeHistory();
  });

  // ─── Conflict modal ───
  document.getElementById('btnCloseConflict')?.addEventListener('click', closeConflict);
  document.getElementById('conflictOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'conflictOverlay') closeConflict();
  });

  // ─── AI Panel ───
  document.getElementById('btnAI')?.addEventListener('click', () => {
    void toggleAIPanel();
  });
  document.getElementById('btnAIPanelClose')?.addEventListener('click', () => { void closeAIPanel(); });
  document.getElementById('aiPanelBackdrop')?.addEventListener('click', () => { void closeAIPanel(); });
  document.getElementById('btnAIMobileExpand')?.addEventListener('click', toggleAIMobileExpanded);
  document.getElementById('btnAIModels')?.addEventListener('click', () => {
    void openModelCatalog();
  });
  document.getElementById('btnCloseModelCatalog')?.addEventListener('click', closeModelCatalog);
  document.getElementById('modelCatalogOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'modelCatalogOverlay') closeModelCatalog();
  });
  document.getElementById('btnAIConverse')?.addEventListener('click', () => {
    void handleAIConverseAction();
  });

  document.getElementById('btnAIAttach')?.addEventListener('click', () => {
    (document.getElementById('aiAttachInput') as HTMLInputElement | null)?.click();
  });

  document.getElementById('aiAttachInput')?.addEventListener('change', async (e: Event) => {
    const inputEl = e.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (!file) return;
    await attachFileToAIChat(file);
    inputEl.value = '';
  });

  document.getElementById('aiAttachmentTray')?.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    const removeBtn = target.closest<HTMLElement>('[data-remove-ai-attachment]');
    if (!removeBtn) return;
    pendingAIAttachment = null;
    renderPendingAIAttachment();
    updateAIComposerUI();
  });

  const btnAIVoiceOutput = document.getElementById('btnAIVoiceOutput') as HTMLButtonElement | null;
  if (btnAIVoiceOutput) {
    const speechModule = await getSpeechModule();
    if (!speechModule.isTtsSupported()) {
      btnAIVoiceOutput.title = 'Text-to-speech not supported in this browser';
      btnAIVoiceOutput.disabled = true;
      btnAIVoiceOutput.style.opacity = '0.4';
      aiVoiceOutputEnabled = false;
      btnAIVoiceOutput.classList.remove('ai-voice-active');
      btnAIVoiceOutput.setAttribute('aria-pressed', 'false');
    } else {
      btnAIVoiceOutput.addEventListener('click', () => {
        aiVoiceOutputEnabled = !aiVoiceOutputEnabled;
        btnAIVoiceOutput.classList.toggle('ai-voice-active', aiVoiceOutputEnabled);
        btnAIVoiceOutput.setAttribute('aria-pressed', String(aiVoiceOutputEnabled));
        btnAIVoiceOutput.title = aiVoiceOutputEnabled ? 'Voice output on' : 'Voice output off';
        if (!aiVoiceOutputEnabled) void getSpeechModule().then((module) => module.stopTts());
        announce(`AI voice output ${aiVoiceOutputEnabled ? 'enabled' : 'disabled'}`);
      });
    }
  }

  // AI quick prompts
  document.querySelectorAll<HTMLElement>('.ai-quick[data-prompt]').forEach(el => {
    el.addEventListener('click', () => {
      const type = el.dataset.prompt!;
      void runQuickPrompt(type);
    });
  });

  // Prompt Library
  document.getElementById('btnPromptLibrary')?.addEventListener('click', openPromptLibrary);
  document.getElementById('btnClosePromptLibrary')?.addEventListener('click', closePromptLibrary);
  document.getElementById('promptLibraryOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'promptLibraryOverlay') closePromptLibrary();
  });
  document.getElementById('btnNewPrompt')?.addEventListener('click', () => openPromptEditor());
  document.querySelectorAll<HTMLElement>('.prompt-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.prompt-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      promptFilter = btn.dataset.filter || 'all';
      refreshPromptLibrary();
    });
  });
  document.getElementById('btnExportPrompts')?.addEventListener('click', async () => {
    const json = await exportPrompts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompts.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('btnImportPrompts')?.addEventListener('click', () => {
    (document.getElementById('importPromptsInput') as HTMLInputElement).click();
  });
  document.getElementById('importPromptsInput')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    await importPrompts(text);
    refreshPromptLibrary();
    (e.target as HTMLInputElement).value = '';
  });

  // Prompt Editor
  document.getElementById('btnClosePromptEditor')?.addEventListener('click', closePromptEditor);
  document.getElementById('btnCancelPromptEditor')?.addEventListener('click', closePromptEditor);
  document.getElementById('promptEditorOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'promptEditorOverlay') closePromptEditor();
  });
  document.getElementById('btnSavePromptEditor')?.addEventListener('click', savePromptFromEditor);

  // Note Templates
  document.getElementById('btnCloseNoteTemplates')?.addEventListener('click', closeNoteTemplates);
  document.getElementById('noteTemplatesOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'noteTemplatesOverlay') closeNoteTemplates();
  });
  document.getElementById('btnNewNoteTemplate')?.addEventListener('click', openNoteTemplateEditor);

  // Note Template Editor
  document.getElementById('btnCloseNoteTemplateEditor')?.addEventListener('click', closeNoteTemplateEditor);
  document.getElementById('btnCancelNoteTemplateEditor')?.addEventListener('click', closeNoteTemplateEditor);
  document.getElementById('noteTemplateEditorOverlay')?.addEventListener('click', (e: Event) => {
    if ((e.target as HTMLElement).id === 'noteTemplateEditorOverlay') closeNoteTemplateEditor();
  });
  document.getElementById('btnSaveNoteTemplateEditor')?.addEventListener('click', saveNoteTemplateFromEditor);

  // AI input: Enter to send (Shift+Enter for newline)
  document.getElementById('aiInput')?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      aiConversationMode = false;
      void sendAIMessage();
    }
  });
  document.getElementById('aiInput')?.addEventListener('input', () => updateAIComposerUI());

  updateAIStatus('idle');
  syncPanelToggleButtons();
  setNotePropertiesExpanded(false);
  setFormattingToolbarExpanded(false);
  renderPendingAIAttachment();
  updateAIComposerUI();
  syncAIPanelUIState();
  syncAIMobileModeUI();
  void ensureAutoLoadedLocalModel();

  window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
      closeMobileDrawers();
      aiMobileExpanded = false;
    }
    syncAIMobileModeUI();
  });

  // Set initial view to split
  setViewMode('split');

  // Wire wiki-link clicks in preview
  document.addEventListener('click', async (e: Event) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.wiki-link');
    if (!link) return;
    e.preventDefault();
    const title = link.dataset.note;
    if (!title) return;
    const notes = await db.notes.where('title').equals(title).toArray();
    if (notes.length > 0 && notes[0].id) {
      openNote(notes[0].id);
    }
  });

  // ─── P10: i18n, a11y, keyboard shortcuts, onboarding ───
  await initI18n();
  initLiveRegion();
  addSkipLink();

  // Populate theme selector
  const selTheme = document.getElementById('selTheme') as HTMLSelectElement | null;
  if (selTheme) {
    selTheme.innerHTML = THEMES.map(t =>
      `<option value="${t.id}"${t.id === getTheme() ? ' selected' : ''}>${t.label}</option>`
    ).join('');
    selTheme.addEventListener('change', () => saveTheme(selTheme.value as ThemeName));
  }

  // Populate accent color picker
  function renderAccentPicker(): void {
    const accentPicker = document.getElementById('accentPicker');
    if (!accentPicker) return;
    const current = getAccent();
    accentPicker.innerHTML = ACCENTS.map(a =>
      `<div class="accent-swatch" data-accent="${a.id}" title="${a.label}"
         style="width:24px;height:24px;border-radius:50%;background:${a.color};cursor:pointer;
                border:2px solid ${a.id === current ? 'var(--text)' : 'transparent'};
                transition:border-color .15s;"></div>`
    ).join('');
    accentPicker.querySelectorAll<HTMLElement>('.accent-swatch').forEach(el => {
      el.addEventListener('click', () => {
        const accent = el.dataset.accent as AccentColor;
        saveAccent(accent);
        if (selTheme) selTheme.value = getTheme();
        renderAccentPicker();
      });
    });
  }
  renderAccentPicker();

  // Populate language selector
  const selLang = document.getElementById('selLanguage') as HTMLSelectElement | null;
  if (selLang) {
    selLang.innerHTML = LANGUAGES.map(l => `<option value="${l.code}"${l.code === getCurrentLanguage() ? ' selected' : ''}>${l.nativeName} (${l.name})</option>`).join('');
    selLang.addEventListener('change', () => setLanguage(selLang.value));
  }

  // Populate speech language selector
  const selSpeechLang = document.getElementById('selSpeechLang') as HTMLSelectElement | null;
  if (selSpeechLang) {
    const speechModule = await getSpeechModule();
    selSpeechLang.innerHTML = speechModule.SPEECH_LANGUAGES.map(l => `<option value="${l.code}"${l.code === speechLang ? ' selected' : ''}>${l.label}</option>`).join('');
    selSpeechLang.addEventListener('change', () => { speechLang = selSpeechLang.value; });
  }

  // ─── P7: Upload / drag-and-drop / clipboard ───
  document.getElementById('btnUpload')?.addEventListener('click', () => {
    (document.getElementById('uploadFileInput') as HTMLInputElement)?.click();
  });

  document.getElementById('uploadFileInput')?.addEventListener('change', async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await handleFileUpload(file);
    (e.target as HTMLInputElement).value = '';
  });

  // Drag-and-drop on editor area
  const dropOverlay = document.getElementById('dropzoneOverlay')!;
  let dragCounter = 0;

  document.addEventListener('dragenter', (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      dragCounter++;
      dropOverlay.style.display = 'flex';
    }
  });
  document.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) { dropOverlay.style.display = 'none'; dragCounter = 0; }
  });
  document.addEventListener('dragover', (e: DragEvent) => { e.preventDefault(); });
  document.addEventListener('drop', async (e: DragEvent) => {
    e.preventDefault();
    dragCounter = 0;
    dropOverlay.style.display = 'none';
    const file = e.dataTransfer?.files[0];
    const uploadModule = await getUploadModule();
    if (file && uploadModule.isSupportedFile(file)) {
      await handleFileUpload(file);
    }
  });

  // Clipboard paste with OCR — attached to document so it works regardless of focus
  document.addEventListener('paste', async (e: ClipboardEvent) => {
    const uploadModule = await getUploadModule();
    const pasteResult = await uploadModule.handleClipboardPaste(e);
    if (pasteResult && editor) {
      insertAtCursor(editor, pasteResult.text);
      announce('Pasted extracted text');
    }
  });

  // ─── P8: Speech-to-text (mic button) ───
  const btnMic = document.getElementById('btnMic');
  if (btnMic) {
    const speechModule = await getSpeechModule();
    if (!speechModule.isWebSpeechSupported()) {
      btnMic.title = 'Speech recognition not supported in this browser';
      btnMic.style.opacity = '0.4';
    } else {
      btnMic.addEventListener('click', () => {
        if (speechModule.getSpeechListening()) {
          speechModule.stopSpeech();
          btnMic.classList.remove('mic-recording');
          announce('Dictation stopped');
        } else {
          speechModule.startWebSpeech(
            (text: string) => {
              if (editor) insertAtCursor(editor, text + ' ');
            },
            (status: string) => {
              if (status === 'end') {
                btnMic.classList.remove('mic-recording');
              }
            },
            { lang: speechLang, continuous: true }
          );
          btnMic.classList.add('mic-recording');
          announce('Dictation started');
        }
      });
    }
  }

  // ─── Keyboard Shortcuts modal (legacy overlay – keep for Ctrl+/) ───
  const shortcutsGrid = document.getElementById('shortcutsGrid');
  if (shortcutsGrid) {
    shortcutsGrid.innerHTML = '<div class="shortcuts-grid">' +
      KEYBOARD_SHORTCUTS.map(s => {
        const combo = `${s.mod ? 'Ctrl+' : ''}${s.shift ? 'Shift+' : ''}${s.alt ? 'Alt+' : ''}${s.key.toUpperCase()}`;
        return `<div><kbd>${combo}</kbd></div><div style="color:var(--text2);font-size:12px;">${s.label}</div>`;
      }).join('') +
      '</div>';
  }
  document.getElementById('btnKeyboardShortcuts')?.addEventListener('click', () => {
    switchSettingsTab('shortcuts');
  });
  document.getElementById('btnCloseShortcuts')?.addEventListener('click', () => {
    const ov = document.getElementById('shortcutsOverlay');
    if (ov) ov.style.display = 'none';
  });

  // ─── Shortcuts Settings Tab: render, search, filter ───
  function renderShortcutList(query: string = '', category: string = 'all'): void {
    const container = document.getElementById('shortcutList');
    if (!container) return;
    const q = query.toLowerCase().trim();
    const filtered = KEYBOARD_SHORTCUTS.filter(s => {
      const matchCat = category === 'all' || s.category === category;
      const matchQ = !q || s.label.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
      return matchCat && matchQ;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:16px 0;text-align:center;">No shortcuts match your search.</p>';
      return;
    }

    // Group by category
    const groups: Record<string, typeof KEYBOARD_SHORTCUTS> = {};
    for (const s of filtered) {
      (groups[s.category] ??= []).push(s);
    }

    container.innerHTML = Object.entries(groups).map(([cat, items]) => {
      const rows = items.map(s => {
        const keys: string[] = [];
        if (s.mod) keys.push('Ctrl');
        if (s.shift) keys.push('⇧');
        if (s.alt) keys.push('Alt');
        keys.push(s.key === 'Enter' ? '↵' : s.key === '\\' ? '\\' : s.key.toUpperCase());
        const badges = keys.map(k => `<span class="kbd-key">${k}</span>`).join('');
        return `<div class="kbd-row">
          <div class="kbd-row-info">
            <span class="kbd-row-label">${s.label}</span>
            ${s.description ? `<span class="kbd-row-desc">${s.description}</span>` : ''}
          </div>
          <div class="kbd-row-keys">${badges}</div>
        </div>`;
      }).join('');
      return `<div class="shortcut-group">
        <div class="shortcut-group-header">${cat}</div>
        ${rows}
      </div>`;
    }).join('');
  }

  // Initial render
  renderShortcutList();

  document.getElementById('shortcutSearchInput')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value;
    const activeFilter = (document.querySelector<HTMLElement>('.shortcut-filter-btn.active')?.dataset.shortcutCategory) ?? 'all';
    renderShortcutList(q, activeFilter);
  });

  document.getElementById('shortcutFilterBar')?.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-shortcut-category]');
    if (!btn) return;
    document.querySelectorAll('.shortcut-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const q = (document.getElementById('shortcutSearchInput') as HTMLInputElement | null)?.value ?? '';
    renderShortcutList(q, btn.dataset.shortcutCategory ?? 'all');
  });

  // ─── Accessibility Settings Tab ───
  const fontScaleRange = document.getElementById('fontScaleRange') as HTMLInputElement | null;
  const fontScaleLabel = document.getElementById('fontScaleLabel');
  const savedFontScale = parseInt(localStorage.getItem('fontScale') ?? '100', 10);
  if (fontScaleRange) {
    fontScaleRange.value = String(savedFontScale);
    document.documentElement.style.setProperty('--font-scale', `${savedFontScale / 100}`);
    if (fontScaleLabel) fontScaleLabel.textContent = `${savedFontScale}%`;
    fontScaleRange.addEventListener('input', () => {
      const v = parseInt(fontScaleRange.value, 10);
      document.documentElement.style.setProperty('--font-scale', `${v / 100}`);
      if (fontScaleLabel) fontScaleLabel.textContent = `${v}%`;
      localStorage.setItem('fontScale', String(v));
    });
  }

  const highContrastToggle = document.getElementById('highContrastToggle') as HTMLInputElement | null;
  if (highContrastToggle) {
    highContrastToggle.checked = document.documentElement.classList.contains('high-contrast');
    highContrastToggle.addEventListener('change', () => {
      document.documentElement.classList.toggle('high-contrast', highContrastToggle.checked);
      localStorage.setItem('highContrast', String(highContrastToggle.checked));
    });
    const savedHC = localStorage.getItem('highContrast') === 'true';
    highContrastToggle.checked = savedHC;
    document.documentElement.classList.toggle('high-contrast', savedHC);
  }

  const reduceMotionToggle = document.getElementById('reduceMotionToggle') as HTMLInputElement | null;
  if (reduceMotionToggle) {
    const savedRM = localStorage.getItem('reduceMotion') === 'true';
    reduceMotionToggle.checked = savedRM;
    document.documentElement.classList.toggle('reduce-motion', savedRM);
    reduceMotionToggle.addEventListener('change', () => {
      document.documentElement.classList.toggle('reduce-motion', reduceMotionToggle.checked);
      localStorage.setItem('reduceMotion', String(reduceMotionToggle.checked));
    });
  }

  const focusRingToggle = document.getElementById('focusRingToggle') as HTMLInputElement | null;
  if (focusRingToggle) {
    const savedFR = localStorage.getItem('focusRingAlways') === 'true';
    focusRingToggle.checked = savedFR;
    document.documentElement.classList.toggle('focus-ring-always', savedFR);
    focusRingToggle.addEventListener('change', () => {
      document.documentElement.classList.toggle('focus-ring-always', focusRingToggle.checked);
      localStorage.setItem('focusRingAlways', String(focusRingToggle.checked));
    });
  }

  document.getElementById('btnA11yAnnounceTest')?.addEventListener('click', () => {
    announce('Screen reader test: Zed Note is working correctly.');
    const status = document.getElementById('a11yTestStatus');
    if (status) { status.textContent = 'Announced ✓'; setTimeout(() => { status.textContent = ''; }, 3000); }
  });

  // ─── Onboarding (first run) ───
  const onboardingSteps = [
    { title: 'Welcome to Zed Note', text: 'Capture ideas quickly, then shape them into structured notes.', bullets: ['Create notes fast', 'Split writing and preview', 'Use quick capture from top bar'] },
    { title: 'AI Workflows', text: 'Switch between Assist and Transform modes depending on your task.', bullets: ['Assist mode for chat and context', 'Transform mode for rewrite/summarize tasks'] },
    { title: 'Sync and Accessibility', text: 'Keep notes available everywhere with cloud sync and keyboard-first controls.', bullets: ['Google Drive / OneDrive / Dropbox', 'Command palette and focus mode'] },
  ] as const;
  const onboarded = await getSetting('onboarded');
  if (!onboarded) {
    const overlay = document.getElementById('onboardingOverlay');
    const titleEl = document.getElementById('onboardingTitle');
    const textEl = document.getElementById('onboardingText');
    const stepsEl = document.getElementById('onboardingSteps');
    const btnBack = document.getElementById('btnOnboardingBack') as HTMLButtonElement | null;
    const btnNext = document.getElementById('btnOnboardingNext') as HTMLButtonElement | null;
    const btnDismiss = document.getElementById('btnOnboardingDismiss');
    let idx = 0;
    const renderStep = () => {
      const step = onboardingSteps[idx];
      if (!step || !titleEl || !textEl || !stepsEl || !btnBack || !btnNext) return;
      titleEl.textContent = step.title;
      textEl.textContent = step.text;
      stepsEl.innerHTML = step.bullets.map((b, i) => `<div class="onboarding-step"><span class="onboarding-step-num">${i + 1}</span><span>${escapeHtml(b)}</span></div>`).join('');
      btnBack.disabled = idx === 0;
      btnNext.textContent = idx === onboardingSteps.length - 1 ? 'Finish' : 'Next';
    };
    if (overlay) overlay.style.display = 'flex';
    renderStep();
    btnBack?.addEventListener('click', () => {
      idx = Math.max(0, idx - 1);
      renderStep();
    });
    btnNext?.addEventListener('click', async () => {
      if (idx >= onboardingSteps.length - 1) {
        if (overlay) overlay.style.display = 'none';
        await setSetting('onboarded', 'true');
        return;
      }
      idx += 1;
      renderStep();
    });
    btnDismiss?.addEventListener('click', async () => {
      if (overlay) overlay.style.display = 'none';
      await setSetting('onboarded', 'true');
    });
  }

  // Performance indicator
  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      const loadTime = nav.loadEventEnd - nav.startTime;
      const dot = document.getElementById('perfDot');
      const label = document.getElementById('perfLabel');
      if (dot && label) {
        if (loadTime < 2000) { dot.style.background = 'var(--green, #22c55e)'; label.textContent = `${Math.round(loadTime)}ms`; }
        else if (loadTime < 5000) { dot.style.background = 'var(--yellow, #eab308)'; label.textContent = `${Math.round(loadTime)}ms`; }
        else { dot.style.background = 'var(--red, #ef4444)'; label.textContent = `${Math.round(loadTime)}ms`; }
      }
    }
  }
}

/* ─── File Upload Handler ─── */
async function handleFileUpload(file: File): Promise<void> {
  const progressEl = document.getElementById('uploadProgress')!;
  const fillEl = document.getElementById('uploadProgressFill')!;
  const cancelBtn = document.getElementById('uploadProgressCancel')!;
  progressEl.style.display = 'flex';
  fillEl.style.width = '0%';

  uploadAbortController = new AbortController();
  const cancelHandler = () => { uploadAbortController?.abort(); };
  cancelBtn.addEventListener('click', cancelHandler, { once: true });

  try {
    const uploadModule = await getUploadModule();
    const result = await uploadModule.extractFromFile(file, (pct: number) => {
      fillEl.style.width = `${Math.round(pct * 100)}%`;
    });
    if (uploadAbortController.signal.aborted) return;
    // Create a new note with extracted text
    const title = result.title || file.name.replace(/\.[^.]+$/, '');
    const now = Date.now();
    const id = await db.notes.add({
      title,
      content: result.text,
      rawContent: result.text,
      markdownContent: result.text,
      markdownPromptSystem: DEFAULT_MARKDOWN_PROMPT_SYSTEM,
      markdownPromptTemplate: DEFAULT_MARKDOWN_PROMPT_TEMPLATE,
      markdownDirty: false,
      suggestedActions: [],
      lastRawSuggestionHash: null,
      tags: ['imported'],
      pinned: false,
      folderId: currentFolderId,
      created: now,
      modified: now,
      syncStatus: 'pending',
      revision: null,
      providerFileId: null,
    });
    // Save attachment reference
    await uploadModule.saveAttachment(id as number, file, result.text);
    await refreshFileList();
    await rebuildSearchIndex();
    await pushLocalNoteToFirestore(id as number);
    openNote(id as number);
    announce(`Imported: ${title}`);
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Upload failed:', err);
      announce('Upload failed');
    }
  } finally {
    progressEl.style.display = 'none';
    uploadAbortController = null;
  }
}

function updateExplorerCollapseButtonLabel(): void {
  const btn = document.getElementById('btnCollapseExplorerSections');
  if (!btn) return;
  const sections = getVisibleExplorerSections();
  const allCollapsed = sections.length > 0 && sections.every(section => section.classList.contains('collapsed'));
  btn.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
}

function getVisibleExplorerSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.tree-section[data-section-id]'))
    .filter((section) => section.style.display !== 'none' && !section.classList.contains('explorer-tab-hidden'));
}

function applyExplorerTabVisibility(): void {
  const sectionTabMap: Partial<Record<string, ExplorerTabId>> = {
    library: 'library',
    folders: 'folders',
    tags: 'tags',
  };

  document.querySelectorAll<HTMLElement>('.tree-section[data-section-id]').forEach((section) => {
    const sectionId = section.dataset.sectionId;
    if (!sectionId) return;
    const mappedTab = sectionTabMap[sectionId];
    const hiddenByTab = mappedTab ? mappedTab !== activeExplorerTab : true;
    section.classList.toggle('explorer-tab-hidden', hiddenByTab);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-explorer-tab]').forEach((btn) => {
    const isActive = btn.dataset.explorerTab === activeExplorerTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  updateExplorerCollapseButtonLabel();
}

function wireExplorerTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-explorer-tab]').forEach((btn) => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.explorerTab as ExplorerTabId | undefined;
      if (!tabId || tabId === activeExplorerTab) return;
      activeExplorerTab = tabId;
      applyExplorerTabVisibility();
    });
  });

  applyExplorerTabVisibility();
}

function wireCollapsibleExplorerSections(): void {
  document.querySelectorAll<HTMLElement>('.tree-section[data-section-id]').forEach(section => {
    const sectionId = section.dataset.sectionId;
    if (!sectionId) return;
    if (collapsedExplorerSections.has(sectionId)) {
      section.classList.add('collapsed');
    }
  });

  document.querySelectorAll<HTMLElement>('.tree-section-title[data-section-toggle]').forEach(title => {
    const sectionId = title.dataset.sectionToggle;
    if (!sectionId || title.dataset.wired === '1') return;
    title.dataset.wired = '1';
    title.addEventListener('click', (e: Event) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const section = document.querySelector<HTMLElement>(`.tree-section[data-section-id="${sectionId}"]`);
      if (!section) return;
      const collapsed = section.classList.toggle('collapsed');
      if (collapsed) collapsedExplorerSections.add(sectionId);
      else collapsedExplorerSections.delete(sectionId);
      persistCollapsedExplorerSections();
      updateExplorerCollapseButtonLabel();
    });
  });

  updateExplorerCollapseButtonLabel();
}

function updateNoteTreeCollapseButtonLabel(): void {
  const btn = document.getElementById('btnCollapseNoteTree');
  if (!btn) return;
  const groups = Array.from(document.querySelectorAll<HTMLElement>('.note-tree-folder, .note-tree-group'));
  const allCollapsed = groups.length > 0 && groups.every(group => group.classList.contains('collapsed'));
  btn.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
}

function noteTreeHeaderLabel(filter: string): string {
  if (filter === 'pinned') return 'Favorites';
  if (filter === 'recent') return 'Recent Notes';
  if (filter === 'folder' && currentFolderId != null) return 'Folder Notes';
  return 'Notes Tree';
}

function getRenderedNoteOrder(): number[] {
  const container = document.getElementById('filelistItems');
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('.note-tree-note[data-note-id]'))
    .map((el) => Number(el.dataset.noteId))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function updateBulkSelectionUI(): void {
  const count = selectedNoteIds.size;
  const countEl = document.getElementById('bulkSelectionCount');
  const moveBtn = document.getElementById('btnBulkMove');
  const delBtn = document.getElementById('btnBulkDelete');
  if (countEl) {
    countEl.textContent = `${count} selected`;
    countEl.style.display = count > 0 ? '' : 'none';
  }
  if (moveBtn) moveBtn.style.display = count > 0 ? '' : 'none';
  if (delBtn) delBtn.style.display = count > 0 ? '' : 'none';
  document.querySelectorAll<HTMLElement>('.note-tree-note[data-note-id]').forEach((el) => {
    const id = Number(el.dataset.noteId);
    el.classList.toggle('selected', selectedNoteIds.has(id));
  });
}

function clearNoteSelection(): void {
  selectedNoteIds.clear();
  lastSelectedNoteId = null;
  updateBulkSelectionUI();
}

function parseDraggedNoteIds(event: DragEvent): number[] {
  const rawList = event.dataTransfer?.getData(NOTE_DRAG_MIME) || '';
  if (rawList) {
    try {
      const parsed = JSON.parse(rawList) as number[];
      const ids = parsed.filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length > 0) return ids;
    } catch {
      // fall through to single-item payload
    }
  }
  const single = Number(event.dataTransfer?.getData('text/plain') || '');
  return single > 0 ? [single] : [];
}

function renderNoteTreeNote(note: Note, depth: number): string {
  const selected = note.id != null && selectedNoteIds.has(note.id);
  return `
    <div class="note-tree-note${currentNote?.id === note.id ? ' active' : ''}${selected ? ' selected' : ''}" data-note-id="${note.id}" draggable="true" style="--tree-depth:${depth};">
      <span class="note-tree-select-indicator" aria-hidden="true">${selected ? '✓' : ''}</span>
      <div class="note-tree-note-title">${escapeHtml(note.title || 'Untitled')}</div>
      <div class="note-tree-note-meta">
        <span class="sync-badge ${note.syncStatus}"></span>
        <span>${new Date(note.modified).toLocaleDateString()}</span>
        ${note.pinned ? '<span class="note-tree-note-pin" aria-label="Pinned" title="Pinned"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2 9.8 5.8l4 .6-2.9 2.8.7 4.1L8 11.3l-3.6 2 .7-4.1L2.2 6.4l4-.6L8 2.2z"/></svg></span>' : ''}
      </div>
      <div class="note-tree-note-snippet">${escapeHtml(note.content.slice(0, 100))}</div>
    </div>
  `;
}

/* ─── File List ─── */
async function refreshFileList(filter?: string, search?: string): Promise<void> {
  if (filter !== undefined) currentListFilter = filter;
  if (search !== undefined) currentSearchQuery = search;
  if (!currentNote) updateNoteDetailsProperties(null);

  const activeFilter = currentListFilter;
  const activeSearch = currentSearchQuery;
  let notes: Note[];

  if (activeFilter === 'pinned') {
    notes = await db.notes.where('pinned').equals(1).toArray();
  } else if (activeFilter === 'recent') {
    const recentIds = await getRecentNoteIds();
    const allNotes = await db.notes.toArray();
    const noteMap = new Map(allNotes.filter(n => n.id != null).map(n => [n.id!, n]));
    notes = recentIds.map(id => noteMap.get(id)).filter((n): n is Note => !!n);
  } else if (activeFilter === 'folder' && currentFolderId != null) {
    notes = await db.notes.where('folderId').equals(currentFolderId).toArray();
  } else {
    notes = await db.notes.toArray();
  }

  // Sort (skip for recent — already ordered)
  if (activeFilter !== 'recent') {
    switch (currentSort) {
      case 'modified':
        notes.sort((a, b) => b.modified - a.modified);
        break;
      case 'created':
        notes.sort((a, b) => b.created - a.created);
        break;
      case 'title':
        notes.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
  }

  // Search filter
  if (activeSearch?.trim()) {
    const q = activeSearch.toLowerCase();
    const tagMatch = q.match(/tag:(\S+)/);
    const dateMatch = q.match(/date:(\S+)/);
    const textQuery = q.replace(/tag:\S+/g, '').replace(/date:\S+/g, '').trim();

    notes = notes.filter(n => {
      if (tagMatch && !n.tags.some(t => t.toLowerCase().includes(tagMatch[1]))) return false;
      if (dateMatch) {
        const noteDate = new Date(n.modified).toISOString().slice(0, 10);
        if (!noteDate.startsWith(dateMatch[1])) return false;
      }
      if (textQuery) {
        const matchIds = searchNotes(textQuery);
        if (matchIds.size > 0) {
          if (!n.id || !matchIds.has(n.id)) return false;
        } else {
          const haystack = `${n.title} ${n.content}`.toLowerCase();
          if (!haystack.includes(textQuery)) return false;
        }
      }
      return true;
    });
  }

  const visibleNoteIds = new Set(notes.filter((n) => n.id != null).map((n) => n.id!));
  for (const id of [...selectedNoteIds]) {
    if (!visibleNoteIds.has(id)) selectedNoteIds.delete(id);
  }
  if (lastSelectedNoteId != null && !visibleNoteIds.has(lastSelectedNoteId)) {
    lastSelectedNoteId = null;
  }

  // Update counts
  const allCount = await db.notes.count();
  const pinnedCount = await db.notes.where('pinned').equals(1).count();
  const countEl = document.getElementById('allNotesCount');
  const pinnedEl = document.getElementById('pinnedCount');
  const filelistCount = document.getElementById('filelistCount');
  const headerTitle = document.getElementById('filelistHeaderTitle');
  if (countEl) countEl.textContent = String(allCount);
  if (pinnedEl) pinnedEl.textContent = String(pinnedCount);
  if (filelistCount) filelistCount.textContent = `${notes.length} note${notes.length !== 1 ? 's' : ''}`;
  if (headerTitle) headerTitle.textContent = noteTreeHeaderLabel(activeFilter);

  const folders = await db.folders.orderBy('order').toArray();
  const folderById = new Map<number, Folder>();
  const foldersByParent = new Map<number | null, Folder[]>();
  for (const folder of folders) {
    if (folder.id == null) continue;
    folderById.set(folder.id, folder);
    const parentId = folder.parentId ?? null;
    const bucket = foldersByParent.get(parentId) || [];
    bucket.push(folder);
    foldersByParent.set(parentId, bucket);
  }

  const notesByFolder = new Map<number | null, Note[]>();
  for (const note of notes) {
    const key = note.folderId ?? null;
    const bucket = notesByFolder.get(key) || [];
    bucket.push(note);
    notesByFolder.set(key, bucket);
  }

  const visibleFolderIds = new Set<number>();
  for (const note of notes) {
    if (note.folderId == null) continue;
    let cursor: number | null = note.folderId;
    while (cursor != null) {
      visibleFolderIds.add(cursor);
      const folder = folderById.get(cursor);
      cursor = folder?.parentId ?? null;
    }
  }

  const renderFolderNodes = (parentId: number | null, depth: number): string => {
    const children = (foldersByParent.get(parentId) || []).filter(folder => folder.id != null && visibleFolderIds.has(folder.id));
    return children.map(folder => {
      const folderId = folder.id!;
      const directNotes = notesByFolder.get(folderId) || [];
      const nestedHtml = renderFolderNodes(folderId, depth + 1);
      const folderKey = `folder:${folderId}`;
      const collapsed = collapsedNoteTreeFolders.has(folderKey);
      return `
        <div class="note-tree-folder${collapsed ? ' collapsed' : ''}" data-folder-node-id="${folderId}">
          <button type="button" class="note-tree-folder-header" data-folder-node-id="${folderId}" style="--tree-depth:${depth};">
            <span class="note-tree-folder-chevron">${collapsed ? '▸' : '▾'}</span>
            <span class="note-tree-folder-name">${escapeHtml(folder.name)}</span>
            <span class="note-tree-folder-count">${directNotes.length}</span>
          </button>
          <div class="note-tree-folder-children">
            ${directNotes.map(note => renderNoteTreeNote(note, depth + 1)).join('')}
            ${nestedHtml}
          </div>
        </div>
      `;
    }).join('');
  };

  const unfiledNotes = notesByFolder.get(null) || [];
  const unfiledKey = 'root:unfiled';
  const unfiledCollapsed = collapsedNoteTreeFolders.has(unfiledKey);

  const container = document.getElementById('filelistItems')!;
  container.innerHTML = `
    ${renderFolderNodes(null, 0)}
    ${unfiledNotes.length > 0 ? `
      <div class="note-tree-group${unfiledCollapsed ? ' collapsed' : ''}" data-group-key="${unfiledKey}">
        <button type="button" class="note-tree-folder-header" data-folder-node-id="" style="--tree-depth:0;">
          <span class="note-tree-folder-chevron">${unfiledCollapsed ? '▸' : '▾'}</span>
          <span class="note-tree-folder-name">Unfiled</span>
          <span class="note-tree-folder-count">${unfiledNotes.length}</span>
        </button>
        <div class="note-tree-folder-children">
          ${unfiledNotes.map(note => renderNoteTreeNote(note, 1)).join('')}
        </div>
      </div>
    ` : ''}
  `;

  container.querySelectorAll<HTMLElement>('.note-tree-note').forEach(el => {
    el.addEventListener('click', (event: MouseEvent) => {
      const noteId = Number(el.dataset.noteId);
      if (!noteId) return;

      const additive = event.ctrlKey || event.metaKey;
      const range = event.shiftKey;
      if (range && lastSelectedNoteId != null) {
        const order = getRenderedNoteOrder();
        const from = order.indexOf(lastSelectedNoteId);
        const to = order.indexOf(noteId);
        if (from >= 0 && to >= 0) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          for (let i = start; i <= end; i += 1) selectedNoteIds.add(order[i]);
        } else {
          selectedNoteIds.add(noteId);
        }
        updateBulkSelectionUI();
        return;
      }

      if (additive) {
        if (selectedNoteIds.has(noteId)) selectedNoteIds.delete(noteId);
        else selectedNoteIds.add(noteId);
        lastSelectedNoteId = noteId;
        updateBulkSelectionUI();
        return;
      }

      selectedNoteIds.clear();
      selectedNoteIds.add(noteId);
      lastSelectedNoteId = noteId;
      updateBulkSelectionUI();
      closeMobileDrawers();
      openNote(noteId);
    });
    el.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
      showNoteContextMenu(e as MouseEvent, Number(el.dataset.noteId));
    });
    el.addEventListener('dragstart', (e: DragEvent) => {
      const noteId = Number(el.dataset.noteId);
      if (!noteId) return;
      const dragIds = selectedNoteIds.has(noteId)
        ? [...selectedNoteIds]
        : [noteId];
      e.dataTransfer!.setData('text/plain', String(noteId));
      e.dataTransfer!.setData(NOTE_DRAG_MIME, JSON.stringify(dragIds));
      e.dataTransfer!.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  });

  container.querySelectorAll<HTMLElement>('.note-tree-folder-header').forEach(el => {
    const folderNodeId = el.dataset.folderNodeId;
    const collapseKey = folderNodeId ? `folder:${folderNodeId}` : unfiledKey;

    el.addEventListener('click', () => {
      const holder = el.closest<HTMLElement>('.note-tree-folder, .note-tree-group');
      if (!holder) return;
      const collapsed = holder.classList.toggle('collapsed');
      if (collapsed) collapsedNoteTreeFolders.add(collapseKey);
      else collapsedNoteTreeFolders.delete(collapseKey);
      const caret = el.querySelector<HTMLElement>('.note-tree-folder-chevron');
      if (caret) caret.textContent = collapsed ? '▸' : '▾';
      updateNoteTreeCollapseButtonLabel();
    });

    el.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', (e: DragEvent) => {
      if (!el.contains(e.relatedTarget as Node)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const noteIds = parseDraggedNoteIds(e);
      if (noteIds.length === 0) return;
      const newFolderId = folderNodeId ? Number(folderNodeId) : null;
      await moveNotesToFolder(noteIds, newFolderId);
    });
  });

  updateBulkSelectionUI();

  updateNoteTreeCollapseButtonLabel();

  // Update tags sidebar
  const allTags = new Map<string, number>();
  const allNotes = await db.notes.toArray();
  for (const n of allNotes) {
    for (const t of n.tags) {
      allTags.set(t, (allTags.get(t) || 0) + 1);
    }
  }
  const tagsList = document.getElementById('tagsList')!;
  tagsList.innerHTML = [...allTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `
      <button type="button" class="tag-chip" data-tag="${escapeHtml(tag)}" title="Filter by #${escapeHtml(tag)}">
        <span class="tag-chip-label">#${escapeHtml(tag)}</span>
        <span class="tag-chip-count">${count}</span>
      </button>
    `).join('');

  tagsList.querySelectorAll<HTMLElement>('[data-tag]').forEach(el => {
    el.addEventListener('click', () => {
      const searchInput = document.getElementById('searchInput') as HTMLInputElement;
      searchInput.value = `tag:${el.dataset.tag}`;
      closeMobileDrawers();
      refreshFileList('all', searchInput.value);
    });
  });

  knownTags = allTags;
  const activeTagInput = document.getElementById('tagTextInput') as HTMLInputElement | null;
  if (activeTagInput && document.activeElement === activeTagInput) {
    renderTagSuggestions(activeTagInput.value);
  }
}

/* ─── Open Note ─── */
async function openNote(noteId: number): Promise<void> {
  const note = await db.notes.get(noteId);
  if (!note) return;

  currentNote = note;

  // Track in recent notes
  if (note.id) await trackRecentNote(note.id);

  // Show editor, hide empty state
  document.getElementById('emptyState')!.style.display = 'none';
  const editorContainer = document.getElementById('editorContainer')!;
  editorContainer.style.display = 'flex';

  // Set title and tags
  (document.getElementById('noteTitle') as HTMLInputElement).value = note.title;
  setNoteTags(note.tags);
  setRawEditorValue(getNoteRawContent(note));
  setGenerationPromptEditorValues(note);
  scheduleActionPillsGeneration(getNoteRawContent(note));

  // Update sync badge
  updateSyncBadge(note.syncStatus);

  // Update pin button
  setPinButtonState(note.pinned);

  // Populate folder select
  const folderSelect = document.getElementById('folderSelect') as HTMLSelectElement;
  const folders = await db.folders.orderBy('order').toArray();
  folderSelect.innerHTML = '<option value="">None</option>' + folders.map(f =>
    `<option value="${f.id}"${note.folderId === f.id ? ' selected' : ''}>${escapeHtml(f.name)}</option>`
  ).join('');
  folderSelect.onchange = () => {
    if (!currentNote?.id) return;
    const fid = folderSelect.value ? Number(folderSelect.value) : null;
    currentNote.folderId = fid;
    updateNoteDetailsProperties(currentNote);
    moveNoteToFolder(currentNote.id, fid);
  };
  updateNoteDetailsProperties(note);

  // Create or update editor
  const editorPane = document.getElementById('editorPane')!;
  const markdown = getNoteMarkdownContent(note);
  if (editor) {
    applyingProgrammaticMarkdownUpdate = true;
    replaceContent(editor, markdown);
    applyingProgrammaticMarkdownUpdate = false;
  } else {
    editorPane.innerHTML = '';
    const opts: EditorOptions = {
      parent: editorPane,
      content: markdown,
      onChange: (content: string) => {
        if (!applyingProgrammaticMarkdownUpdate && currentNote) {
          currentNote.markdownDirty = true;
        }

        // Debounced preview
        if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(() => {
          const previewPane = document.getElementById('previewPane')!;
          void renderMarkdownContent(content, previewPane);
        }, 300);

        // Auto-save debounce (2s)
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
          saveCurrentNote(true);
        }, 2000);

        // Update word count
        updateWordCount(content);

        // Update TOC
        updateTOC(content);
      },
      onCursorChange: (line: number, col: number) => {
        const el = document.getElementById('cursorPos');
        if (el) el.textContent = `Ln ${line}, Col ${col}`;
      },
    };
    editor = createEditor(opts);
  }

  // Initial preview render
  const previewPane = document.getElementById('previewPane')!;
  await renderMarkdownContent(markdown, previewPane);

  // Initial word count
  updateWordCount(markdown);

  // Initial TOC
  updateTOC(markdown);

  // Initial backlinks
  await updateBacklinks();

  // Scroll sync: editor → preview
  const editorScroller = editorPane.querySelector('.cm-scroller');
  if (editorScroller) {
    editorScroller.addEventListener('scroll', () => {
      if (viewMode !== 'split') return;
      const ratio = editorScroller.scrollTop / (editorScroller.scrollHeight - editorScroller.clientHeight || 1);
      previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
    });
  }

  // Update file list active state
  await refreshFileList();

  // Update status
  setStatus(`Opened: ${note.title || 'Untitled'}`);
  syncAppEditorNoteActiveClass();
}

/* ─── Create Note ─── */
async function createNewNote(): Promise<void> {
  const now = Date.now();
  const id = await db.notes.add({
    title: `Untitled ${new Date(now).toLocaleDateString()}`,
    content: '',
    rawContent: '',
    markdownContent: '',
    markdownPromptSystem: DEFAULT_MARKDOWN_PROMPT_SYSTEM,
    markdownPromptTemplate: DEFAULT_MARKDOWN_PROMPT_TEMPLATE,
    markdownDirty: false,
    suggestedActions: [],
    lastRawSuggestionHash: null,
    tags: [],
    folderId: currentFolderId,
    created: now,
    modified: now,
    syncStatus: 'local',
    revision: null,
    providerFileId: null,
    pinned: false,
  });
  await openNote(id as number);

  // Push the newly created note to Firestore in the background.
  await pushLocalNoteToFirestore(id as number);
  scheduleAutoSync();

  // Focus title
  setTimeout(() => {
    const titleInput = document.getElementById('noteTitle') as HTMLInputElement;
    titleInput.select();
    titleInput.focus();
  }, 50);
}

/* ─── Save Note ─── */
async function saveCurrentNote(silent = false): Promise<void> {
  if (!currentNote?.id || !editor) return;

  setSyncVisualState('saving');

  const title = (document.getElementById('noteTitle') as HTMLInputElement).value.trim();
  const tags = [...noteTags];
  const content = editor.state.doc.toString();
  const rawContent = getRawEditorValue();
  const markdownPromptSystem = getGenerationPromptSystemInput()?.value ?? getResolvedGenerationPromptSystem(currentNote);
  const markdownPromptTemplate = getGenerationPromptTemplateInput()?.value ?? getResolvedGenerationPromptTemplate(currentNote);

  await db.notes.update(currentNote.id, {
    title: title || 'Untitled',
    content,
    markdownContent: content,
    rawContent,
    markdownPromptSystem,
    markdownPromptTemplate,
    markdownDirty: currentNote.markdownDirty ?? false,
    tags,
    modified: Date.now(),
    syncStatus: 'pending',
  });

  // Save revision for history
  await saveRevision(currentNote.id, content);

  currentNote = await db.notes.get(currentNote.id) || null;
  if (currentNote) {
    indexNote(currentNote);
    updateNoteDetailsProperties(currentNote);
    await pushLocalNoteToFirestore(currentNote.id!);
    scheduleAutoSync();
  }

  if (currentNote?.syncStatus === 'synced') {
    updateSyncBadge('synced');
  } else {
    updateSyncBadge('pending');
  }

  await refreshFileList();

  if (!silent) setStatus('Saved locally');
}

/* ─── Delete Note ─── */
async function deleteCurrentNote(): Promise<void> {
  if (!currentNote?.id) return;
  if (!confirm('Delete this note? This cannot be undone.')) return;

  const noteId = currentNote.id;

  removeFromIndex(noteId);
  await deleteHistory(noteId);
  await db.notes.delete(noteId);
  await deleteRemoteNoteFromFirestore(noteId);

  currentNote = null;
  editor = null;
  updateNoteDetailsProperties(null);

  document.getElementById('editorContainer')!.style.display = 'none';
  document.getElementById('emptyState')!.style.display = '';
  document.getElementById('editorPane')!.innerHTML = '';
  syncAppEditorNoteActiveClass();

  await refreshFileList();
  setStatus('Note deleted');
}

/* ─── Toggle Pin ─── */
async function togglePin(): Promise<void> {
  if (!currentNote?.id) return;
  const newPinned = !currentNote.pinned;
  await db.notes.update(currentNote.id, {
    pinned: newPinned,
    modified: Date.now(),
    syncStatus: 'pending',
  });
  currentNote.pinned = newPinned;
  currentNote.syncStatus = 'pending';
  setPinButtonState(newPinned);
  updateSyncBadge('pending');
  await refreshFileList();
  await pushLocalNoteToFirestore(currentNote.id);
  scheduleAutoSync();
}

/* ─── Format Toolbar ─── */
function handleFormat(fmt: string): void {
  if (!editor) return;
  switch (fmt) {
    case 'bold': wrapSelection(editor, '**', '**'); break;
    case 'italic': wrapSelection(editor, '_', '_'); break;
    case 'strikethrough': wrapSelection(editor, '~~', '~~'); break;
    case 'code': wrapSelection(editor, '`', '`'); break;
    case 'h1': insertLinePrefix(editor, '# '); break;
    case 'h2': insertLinePrefix(editor, '## '); break;
    case 'h3': insertLinePrefix(editor, '### '); break;
    case 'ul': insertLinePrefix(editor, '- '); break;
    case 'ol': insertLinePrefix(editor, '1. '); break;
    case 'task': insertLinePrefix(editor, '- [ ] '); break;
    case 'quote': insertLinePrefix(editor, '> '); break;
    case 'hr': insertAtCursor(editor, '\n---\n'); break;
    case 'codeblock': insertAtCursor(editor, '\n```\n\n```\n'); break;
    case 'link': {
      const url = prompt('Enter URL:');
      if (url) wrapSelection(editor, '[', `](${url})`);
      break;
    }
    case 'image': {
      const imgUrl = prompt('Enter image URL:');
      if (imgUrl) insertAtCursor(editor, `![Alt text](${imgUrl})`);
      break;
    }
    case 'table':
      insertAtCursor(editor, '\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n');
      break;
    case 'mermaid':
      insertAtCursor(editor, '\n```mermaid\nflowchart LR\n    A[Start] --> B[End]\n```\n');
      break;
    case 'math':
      insertAtCursor(editor, '$$\nE = mc^2\n$$');
      break;
  }
}

/* ─── View Mode ─── */
function setViewMode(mode: 'edit' | 'preview' | 'split'): void {
  viewMode = mode;
  const content = document.getElementById('editorContent')!;
  content.classList.remove('split');
  document.querySelector<HTMLElement>('.editor-section[data-section="raw"]')?.classList.remove('hidden-by-mode');
  document.querySelector<HTMLElement>('.editor-section[data-section="markdown"]')?.classList.remove('hidden-by-mode');
  document.querySelector<HTMLElement>('.editor-section[data-section="preview"]')?.classList.remove('hidden-by-mode');

  switch (mode) {
    case 'edit':
      document.querySelector<HTMLElement>('.editor-section[data-section="preview"]')?.classList.add('hidden-by-mode');
      break;
    case 'preview':
      document.querySelector<HTMLElement>('.editor-section[data-section="raw"]')?.classList.add('hidden-by-mode');
      document.querySelector<HTMLElement>('.editor-section[data-section="markdown"]')?.classList.add('hidden-by-mode');
      break;
    case 'split':
      content.classList.add('split');
      break;
  }
  announce(`View mode set to ${mode}`);
  persistLayoutPrefs();
}

function buildFallbackActionPills(raw: string): string[] {
  const lowered = raw.toLowerCase();
  const actions = new Set<string>(DEFAULT_RAW_ACTIONS);

  if (/todo|task|deadline|next step|action item/.test(lowered)) actions.add('Extract action items');
  if (/meeting|call|discussion|agenda/.test(lowered)) actions.add('Generate meeting summary');
  if (/why|because|impact|decision/.test(lowered)) actions.add('Draft decision log');
  if (/\[\[.+\]\]/.test(raw) || /link|reference/.test(lowered)) actions.add('Link to related notes');

  return [...actions].slice(0, 6);
}

function renderRawActionPills(actions: string[]): void {
  const host = document.getElementById('rawActionPills');
  if (!host) return;

  if (actions.length === 0) {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }

  host.style.display = 'flex';
  host.innerHTML = actions.map((action) => `
    <button type="button" class="raw-action-pill" data-raw-action="${escapeHtml(action)}">${escapeHtml(action)}</button>
  `).join('');

  host.querySelectorAll<HTMLElement>('[data-raw-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void handleRawAction(btn.dataset.rawAction || '');
    });
  });
}

async function generateActionPillsFromRaw(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) {
    renderRawActionPills([]);
    return;
  }

  try {
    const { engineModule } = await ensureLLMRuntime();
    if (engineModule.llmEngine.getStatus() !== 'ready') {
      renderRawActionPills(buildFallbackActionPills(raw));
      return;
    }

    const response = await engineModule.llmEngine.chatComplete([
      {
        role: 'system',
        content: 'You create concise action suggestions for note drafts. Return only JSON array of 3-6 short imperative actions.',
      },
      {
        role: 'user',
        content: `Draft:\n${trimmed.slice(0, 2400)}\n\nReturn JSON array only. Example: ["Create task list","Generate mind map"]`,
      },
    ], { maxTokens: 180, temperature: 0.2 });

    const jsonText = response.trim().replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(jsonText);
    const actions = Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
      : [];

    if (actions.length > 0) {
      renderRawActionPills(actions);
      return;
    }
  } catch {
    // Fall back to heuristic actions when LLM is unavailable or response is malformed.
  }

  renderRawActionPills(buildFallbackActionPills(raw));
}

function scheduleActionPillsGeneration(raw: string): void {
  if (actionPillsTimer) clearTimeout(actionPillsTimer);
  actionPillsTimer = setTimeout(() => {
    void generateActionPillsFromRaw(raw);
  }, ACTION_PILLS_DEBOUNCE_MS);
}

async function generateMarkdownFromRaw(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed || !editor || !currentNote) {
    setStatus('Add some raw draft text first.');
    return;
  }
  if (currentNote.markdownDirty) return;

  const seq = ++markdownGenerationSeq;

  try {
    const { engineModule } = await ensureLLMRuntime();
    let llmStatus = engineModule.llmEngine.getStatus();
    const readyId = llmStatus === 'ready' ? engineModule.llmEngine.getLoadedModelId() ?? undefined : undefined;
    if (llmStatus !== currentLLMStatus || (llmStatus === 'ready' && readyId !== currentLLMDetail)) {
      updateAIStatus(llmStatus, llmStatus === 'ready' ? readyId : currentLLMDetail);
      llmStatus = engineModule.llmEngine.getStatus();
    }

    // Best effort auto-load if a cached local model exists.
    if (llmStatus === 'idle') {
      await ensureAutoLoadedLocalModel();
      llmStatus = engineModule.llmEngine.getStatus();
    }

    if (llmStatus === 'loading') {
      setStatus('AI model is still loading. Try again in a few seconds.');
      updateRawGenerationAvailabilityUI();
      return;
    }

    if (llmStatus !== 'ready') {
      setStatus('Load an AI model to generate markdown from raw notes.');
      updateRawGenerationAvailabilityUI();
      return;
    }

    const generated = await engineModule.llmEngine.chatComplete(
      buildMarkdownGenerationMessages(currentNote, trimmed),
      { maxTokens: 1800, temperature: 0.2 },
    );

    if (seq !== markdownGenerationSeq || !currentNote || currentNote.markdownDirty || !editor) return;

    applyingProgrammaticMarkdownUpdate = true;
    replaceContent(editor, generated.trim());
    applyingProgrammaticMarkdownUpdate = false;

    const previewPane = document.getElementById('previewPane');
    if (previewPane) await renderMarkdownContent(generated, previewPane);
    updateWordCount(generated);
    updateTOC(generated);
    scheduleTagSave();
    saveCurrentNote(true);
    setStatus('Markdown regenerated from raw draft.');
  } catch (error) {
    applyingProgrammaticMarkdownUpdate = false;
    const message = error instanceof Error ? error.message : 'Markdown regeneration failed';
    setStatus(`Could not regenerate markdown: ${message}`);
    console.error('Markdown regeneration failed:', error);
  }
}

async function tryLoadModelForRawMarkdown(): Promise<void> {
  const triggerBtn = document.getElementById('btnRawLoadModel') as HTMLButtonElement | null;
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Loading…';
  }

  try {
    await ensureAutoLoadedLocalModel();
    const { engineModule } = await ensureLLMRuntime();
    if (engineModule.llmEngine.getStatus() !== 'ready') {
      setStatus('No cached model available. Pick a model from the catalog.');
      openModelCatalog();
    } else {
      setStatus('Model loaded. Markdown generation is ready.');
    }
  } catch {
    setStatus('Could not load a cached model. Open Model Catalog to choose one.');
    openModelCatalog();
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = 'Load Cached Model';
    }
    updateRawGenerationAvailabilityUI();
  }
}

function scheduleMarkdownAutogeneration(raw: string): void {
  if (markdownAutoGenTimer) clearTimeout(markdownAutoGenTimer);
  markdownAutoGenTimer = setTimeout(() => {
    if (currentNote) currentNote.markdownDirty = false;
    void generateMarkdownFromRaw(raw);
  }, RAW_MARKDOWN_DEBOUNCE_MS);
}

async function handleRawAction(action: string): Promise<void> {
  if (!action) return;

  const lower = action.toLowerCase();
  if (lower.includes('mind map') && editor) {
    insertAtCursor(editor, '\n```mermaid\nmindmap\n  root((Idea))\n    Branch\n      Detail\n```\n');
    return;
  }

  const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
  if (!input) return;

  input.value = `${action}\n\nUse this raw draft as source:\n${getRawEditorValue().slice(0, 4000)}`;
  document.getElementById('aiPanel')?.classList.add('open');
  syncAIPanelUIState();
  await ensureLLMRuntime();
  await sendAIMessage();
}

/* ─── Recent Notes ─── */
async function trackRecentNote(noteId: number): Promise<void> {
  const raw = await getSetting('recentNoteIds');
  let ids: number[] = raw ? JSON.parse(raw) : [];
  ids = ids.filter(id => id !== noteId);
  ids.unshift(noteId);
  if (ids.length > 10) ids.length = 10;
  await setSetting('recentNoteIds', JSON.stringify(ids));
}

async function getRecentNoteIds(): Promise<number[]> {
  const raw = await getSetting('recentNoteIds');
  return raw ? JSON.parse(raw) : [];
}

/* ─── Context Menu ─── */
let activeContextMenu: HTMLElement | null = null;

function closeContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

function showContextMenu(e: MouseEvent, items: { label: string; action: () => void }[]): void {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:4px 0;min-width:140px;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
  menu.innerHTML = items.map(item =>
    `<div class="ctx-item" style="padding:6px 12px;font-size:12px;color:var(--text);cursor:pointer;font-family:var(--font);">${escapeHtml(item.label)}</div>`
  ).join('');
  document.body.appendChild(menu);
  activeContextMenu = menu;

  const menuItems = menu.querySelectorAll<HTMLElement>('.ctx-item');
  menuItems.forEach((el, i) => {
    el.addEventListener('mouseenter', () => el.style.background = 'var(--accent)');
    el.addEventListener('mouseleave', () => el.style.background = '');
    el.addEventListener('click', () => {
      items[i].action();
      closeContextMenu();
    });
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
  }, 0);
}

function showNoteContextMenu(e: MouseEvent, noteId: number): void {
  showContextMenu(e, [
    { label: 'Open', action: () => openNote(noteId) },
    { label: 'Toggle Pin', action: async () => {
      const note = await db.notes.get(noteId);
      if (note?.id) {
        await db.notes.update(noteId, {
          pinned: !note.pinned,
          modified: Date.now(),
          syncStatus: 'pending',
        });
        if (currentNote?.id === noteId) {
          currentNote.pinned = !note.pinned;
          currentNote.syncStatus = 'pending';
          setPinButtonState(currentNote.pinned);
          updateSyncBadge('pending');
        }
        await refreshFileList();
        await pushLocalNoteToFirestore(noteId);
        scheduleAutoSync();
      }
    }},
    { label: 'Move to folder…', action: async () => {
      const folders = await db.folders.orderBy('order').toArray();
      const names = ['(None)', ...folders.map(f => f.name)];
      const choice = prompt(`Move to folder:\n${names.map((n, i) => `${i}. ${n}`).join('\n')}\n\nEnter number:`);
      if (choice == null) return;
      const idx = parseInt(choice, 10);
      const folderId = idx === 0 ? null : (folders[idx - 1]?.id ?? null);
      await moveNoteToFolder(noteId, folderId);
    }},
    { label: 'Delete', action: async () => {
      if (!confirm('Delete this note?')) return;
      removeFromIndex(noteId);
      await db.notes.delete(noteId);
      await deleteRemoteNoteFromFirestore(noteId);
      if (currentNote?.id === noteId) {
        currentNote = null;
        editor = null;
        document.getElementById('editorContainer')!.style.display = 'none';
        document.getElementById('emptyState')!.style.display = '';
        document.getElementById('editorPane')!.innerHTML = '';
        syncAppEditorNoteActiveClass();
      }
      await refreshFileList();
    }},
  ]);
}

function showFolderContextMenu(e: MouseEvent, folderId: number): void {
  showContextMenu(e, [
    { label: 'Rename', action: () => renameFolder(folderId) },
    { label: 'Delete', action: () => deleteFolder(folderId) },
  ]);
}

/* ─── Folders ─── */
async function refreshFolders(): Promise<void> {
  const folders = await db.folders.orderBy('order').toArray();
  const byParent = new Map<number | null, Folder[]>();
  for (const folder of folders) {
    if (folder.id == null) continue;
    const key = folder.parentId ?? null;
    const bucket = byParent.get(key) || [];
    bucket.push(folder);
    byParent.set(key, bucket);
  }

  const renderTree = (parentId: number | null, depth: number): string => {
    const nodes = byParent.get(parentId) || [];
    return nodes.map((f) => {
      const folderId = f.id as number;
      return `
      <div class="folder-tree-node">
        <div class="tree-item folder-tree-item${currentFolderId === folderId ? ' active' : ''}" data-folder-id="${folderId}" style="--tree-depth:${depth};">
          <span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"><path d="M2.2 4.6h4l1.3 1.6H14v5a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1v-6.6Z"/></svg></span>
          <span class="tree-item-label">${escapeHtml(f.name)}</span>
        </div>
        ${renderTree(folderId, depth + 1)}
      </div>
    `;
    }).join('');
  };

  const container = document.getElementById('foldersList')!;
  container.innerHTML = renderTree(null, 0);
  container.querySelectorAll<HTMLElement>('[data-folder-id]').forEach(el => {
    el.addEventListener('click', () => {
      const fid = Number(el.dataset.folderId);
      currentFolderId = currentFolderId === fid ? null : fid;
      document.querySelectorAll('.tree-item').forEach(t => t.classList.remove('active'));
      if (currentFolderId) el.classList.add('active');
      else document.querySelector('[data-tree="all"]')?.classList.add('active');
      closeMobileDrawers();
      refreshFileList(currentFolderId ? 'folder' : 'all');
    });
    el.addEventListener('dblclick', () => renameFolder(Number(el.dataset.folderId)));
    el.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
      showFolderContextMenu(e as MouseEvent, Number(el.dataset.folderId));
    });
    // Drop target: drag a note onto a folder to move it
    el.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', (e: DragEvent) => {
      if (!el.contains(e.relatedTarget as Node)) el.classList.remove('drag-over');
    });
    el.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const noteIds = parseDraggedNoteIds(e);
      if (noteIds.length === 0) return;
      await moveNotesToFolder(noteIds, Number(el.dataset.folderId));
    });
  });
  // Wire the "All Notes" tree item as a drop target to remove folder assignment
  wireAllNotesDrop();
}

/** Wire the static "All Notes" tree item as a drop target so dragged notes lose their folder. */
function wireAllNotesDrop(): void {
  const allNotesEl = document.querySelector<HTMLElement>('[data-tree="all"]');
  if (!allNotesEl || allNotesEl.dataset.dropWired) return;
  allNotesEl.dataset.dropWired = '1';
  allNotesEl.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    allNotesEl.classList.add('drag-over');
  });
  allNotesEl.addEventListener('dragleave', (e: DragEvent) => {
    if (!allNotesEl.contains(e.relatedTarget as Node)) allNotesEl.classList.remove('drag-over');
  });
  allNotesEl.addEventListener('drop', async (e: DragEvent) => {
    e.preventDefault();
    allNotesEl.classList.remove('drag-over');
    const noteIds = parseDraggedNoteIds(e);
    if (noteIds.length === 0) return;
    await moveNotesToFolder(noteIds, null);
  });
}

async function createFolder(): Promise<void> {
  const name = prompt('Folder name:');
  if (!name?.trim()) return;
  const maxOrder = (await db.folders.orderBy('order').last())?.order ?? 0;
  await db.folders.add({ name: name.trim(), parentId: null, providerFolderId: null, order: maxOrder + 1 });
  await refreshFolders();
}

async function renameFolder(fid: number): Promise<void> {
  const folder = await db.folders.get(fid);
  if (!folder) return;
  const name = prompt('Rename folder:', folder.name);
  if (!name?.trim() || name.trim() === folder.name) return;
  await db.folders.update(fid, { name: name.trim() });
  await refreshFolders();
}

async function deleteFolder(fid: number): Promise<void> {
  if (!confirm('Delete this folder? Notes inside will be moved to "All Notes".')) return;
  // Unassign notes from this folder
  const notesInFolder = await db.notes.where('folderId').equals(fid).toArray();
  for (const n of notesInFolder) {
    if (n.id) await db.notes.update(n.id, { folderId: null });
  }
  await db.folders.delete(fid);
  if (currentFolderId === fid) currentFolderId = null;
  await refreshFolders();
  await refreshFileList();
}

async function moveNoteToFolder(noteId: number, folderId: number | null): Promise<void> {
  await moveNotesToFolder([noteId], folderId);
}

async function moveNotesToFolder(noteIds: number[], folderId: number | null): Promise<void> {
  const uniqueIds = [...new Set(noteIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) return;

  const modified = Date.now();
  for (const noteId of uniqueIds) {
    await db.notes.update(noteId, {
      folderId,
      modified,
      syncStatus: 'pending',
    });
    if (currentNote?.id === noteId) {
      currentNote.folderId = folderId;
      currentNote.syncStatus = 'pending';
      updateSyncBadge('pending');
    }
  }

  await refreshFileList();
  for (const noteId of uniqueIds) await pushLocalNoteToFirestore(noteId);
  scheduleAutoSync();
}

/* ─── Backlinks ─── */
function scrollEditorToLine(line: number): void {
  if (!editor) return;
  const lineInfo = editor.state.doc.line(Math.min(line, editor.state.doc.lines));
  editor.dispatch({
    selection: { anchor: lineInfo.from },
    scrollIntoView: true,
  });
  editor.focus();
}

function updateNoteDetailsProperties(note: Note | null): void {
  const statusEl = document.getElementById('noteDetailsStatus');
  const updatedEl = document.getElementById('noteDetailsUpdated');
  const folderEl = document.getElementById('noteDetailsFolder');
  const tagsEl = document.getElementById('noteDetailsTags');
  if (!statusEl || !updatedEl || !folderEl || !tagsEl) return;

  if (!note) {
    statusEl.textContent = 'Idle';
    statusEl.className = 'note-prop-badge';
    updatedEl.textContent = '-';
    folderEl.textContent = '-';
    tagsEl.textContent = '-';
    return;
  }

  const statusMap: Record<string, string> = {
    synced: 'Synced',
    pending: 'In Progress',
    conflict: 'Conflict',
    local: 'Local',
  };
  statusEl.textContent = statusMap[note.syncStatus] || 'Unknown';
  statusEl.className = `note-prop-badge ${note.syncStatus}`;
  updatedEl.textContent = new Date(note.modified).toLocaleDateString();

  const folderName = note.folderId != null
    ? document.querySelector<HTMLElement>(`#folderSelect option[value="${note.folderId}"]`)?.textContent
    : null;
  folderEl.textContent = folderName || 'Unfiled';

  tagsEl.textContent = note.tags.length > 0
    ? note.tags.map((tag) => `#${tag}`).join(', ')
    : '-';
}

function updateNoteDetailsTagPreview(): void {
  const tagsEl = document.getElementById('noteDetailsTags');
  if (!tagsEl) return;
  tagsEl.textContent = noteTags.length > 0
    ? noteTags.map((tag) => `#${tag}`).join(', ')
    : '-';
}

async function updateBacklinks(): Promise<void> {
  const section = document.getElementById('backlinksSection');
  const list = document.getElementById('backlinksList');
  const detailsSection = document.getElementById('noteDetailsBacklinksSection');
  const detailsList = document.getElementById('noteDetailsBacklinksList');
  if (!currentNote) {
    if (section) section.style.display = 'none';
    if (detailsSection) detailsSection.style.display = 'none';
    updateExplorerCollapseButtonLabel();
    return;
  }
  const title = currentNote.title;
  if (!title) {
    if (section) section.style.display = 'none';
    if (detailsSection) detailsSection.style.display = 'none';
    updateExplorerCollapseButtonLabel();
    return;
  }
  const pattern = `[[${title}]]`;
  const allNotes = await db.notes.toArray();
  const links = allNotes.filter(n => n.id !== currentNote!.id && n.content.includes(pattern));
  if (links.length === 0) {
    if (section) section.style.display = 'none';
    if (detailsSection) detailsSection.style.display = 'none';
    updateExplorerCollapseButtonLabel();
    return;
  }
  if (section) section.style.display = '';
  if (detailsSection) detailsSection.style.display = '';
  updateExplorerCollapseButtonLabel();

  const markup = links.map(n => `
    <div class="tree-item" data-backlink-id="${n.id}">
      <span class="tree-item-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 5.1 3.2 8.4l3.3 3.3"/><path d="M3.4 8.4h6.2a3 3 0 1 0 0-6H7.8"/></svg></span>
      <span class="tree-item-label">${escapeHtml(n.title || 'Untitled')}</span>
    </div>
  `).join('');

  const detailsMarkup = links.map((n) => {
    const plain = n.content
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`~\-\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const snippet = plain.length > 96 ? `${plain.slice(0, 96)}...` : (plain || 'Linked mention');
    return `
      <button type="button" class="note-details-card" data-details-backlink-id="${n.id}">
        <span class="note-details-card-title">${escapeHtml(n.title || 'Untitled')}</span>
        <span class="note-details-card-snippet">${escapeHtml(snippet)}</span>
      </button>
    `;
  }).join('');

  if (list) {
    list.innerHTML = markup;
    list.querySelectorAll<HTMLElement>('[data-backlink-id]').forEach(el => {
      el.addEventListener('click', () => openNote(Number(el.dataset.backlinkId)));
    });
  }

  if (detailsList) {
    detailsList.innerHTML = detailsMarkup;
    detailsList.querySelectorAll<HTMLElement>('[data-details-backlink-id]').forEach(el => {
      el.addEventListener('click', () => openNote(Number(el.dataset.detailsBacklinkId)));
    });
  }
}

/* ─── Table of Contents ─── */
function updateTOC(content: string): void {
  const tocSection = document.getElementById('tocSection');
  const tocList = document.getElementById('tocList');
  const detailsTocList = document.getElementById('noteDetailsTocList');
  const headings: { level: number; text: string; line: number }[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].replace(/[#*_`~]/g, '').trim(), line: i + 1 });
    }
  }
  if (headings.length === 0) {
    if (tocSection) tocSection.style.display = 'none';
    if (detailsTocList) {
      detailsTocList.innerHTML = '<p class="note-details-empty">No headings found in this note.</p>';
    }
    updateExplorerCollapseButtonLabel();
    return;
  }
  if (tocSection) tocSection.style.display = '';
  updateExplorerCollapseButtonLabel();

  const tocMarkup = headings.map(h => `
    <div class="tree-item toc-item" data-toc-line="${h.line}" data-toc-level="${h.level}" style="--toc-indent:${8 + (h.level - 1) * 12}px;">
      <span class="tree-item-label">${escapeHtml(h.text)}</span>
    </div>
  `).join('');

  const tocLevels = [0, 0, 0, 0, 0, 0];
  const detailsTocMarkup = headings.map((h) => {
    tocLevels[h.level - 1] += 1;
    for (let idx = h.level; idx < tocLevels.length; idx += 1) tocLevels[idx] = 0;
    const prefix = tocLevels.slice(0, h.level).filter((value) => value > 0).join('.');
    return `
      <button type="button" class="note-details-toc-item" data-toc-line="${h.line}" data-toc-level="${h.level}">
        <span class="note-details-toc-number">${prefix}</span>
        <span class="note-details-toc-label">${escapeHtml(h.text)}</span>
      </button>
    `;
  }).join('');

  if (tocList) {
    tocList.innerHTML = tocMarkup;
    tocList.querySelectorAll<HTMLElement>('[data-toc-line]').forEach(el => {
      el.addEventListener('click', () => {
        const line = Number(el.dataset.tocLine);
        scrollEditorToLine(line);
      });
    });
  }

  if (detailsTocList) {
    detailsTocList.innerHTML = detailsTocMarkup;
    detailsTocList.querySelectorAll<HTMLElement>('[data-toc-line]').forEach(el => {
      el.addEventListener('click', () => {
        const line = Number(el.dataset.tocLine);
        scrollEditorToLine(line);
      });
    });
  }
}

/* ─── Word Count ─── */
function updateWordCount(content: string): void {
  const text = content.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = text.length;
  const readMin = Math.max(1, Math.ceil(words / 200));
  const el = document.getElementById('wordCount');
  if (el) el.textContent = `${words} words · ${chars} chars · ${readMin} min read`;
}

/* ─── Helpers ─── */
function updateSyncBadge(status: string): void {
  const badge = document.getElementById('syncBadge');
  if (badge) {
    badge.className = `sync-badge ${status}`;
    badge.title = status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (status === 'synced') {
    setSyncVisualState('synced');
  } else if (status === 'pending') {
    setSyncVisualState(navigator.onLine ? 'saved-local' : 'offline');
  } else if (status === 'conflict') {
    setSyncVisualState('conflict');
  } else if (status === 'local') {
    setSyncVisualState('local');
  }
}

function updateOnlineStatus(): void {
  const dot = document.getElementById('statusDot')!;
  const text = document.getElementById('statusText')!;
  if (navigator.onLine) {
    dot.classList.remove('offline');
    text.textContent = 'Online — Ready';
  } else {
    dot.classList.add('offline');
    text.textContent = 'Offline — Changes saved locally';
  }
  refreshSyncVisualState();
}

function setStatus(msg: string): void {
  const el = document.getElementById('statusText');
  if (!el) return;
  el.textContent = msg;
  if (statusResetTimer) clearTimeout(statusResetTimer);
  statusResetTimer = setTimeout(() => {
    if (!el.isConnected) return;
    updateOnlineStatus();
  }, 4000);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* ─── Settings Modal ─── */
function openSettings(tab?: SettingsTabId): void {
  document.getElementById('settingsOverlay')!.style.display = 'flex';
  switchSettingsTab(tab ?? activeSettingsTab);
  updateSyncProviderStatus();
  if (PASSKEY_UI_ENABLED) void refreshPasskeyEnrollmentStatus();
  const currentType = (syncEngine.getProvider()?.id === 'google-drive'
    ? 'gdrive'
    : syncEngine.getProvider()?.id === 'onedrive'
      ? 'onedrive'
      : syncEngine.getProvider()?.id === 'dropbox'
        ? 'dropbox'
        : selectedSyncProviderType) as SyncProviderType;
  setSyncProviderSelection(currentType);
  renderAIProviderSettings();
  // Sync theme selector to current theme (may have changed via system preference)
  const selTheme = document.getElementById('selTheme') as HTMLSelectElement | null;
  if (selTheme) selTheme.value = getTheme();
  // Re-render accent picker to reflect current accent
  const accentPicker = document.getElementById('accentPicker');
  if (accentPicker) {
    const current = getAccent();
    accentPicker.querySelectorAll<HTMLElement>('.accent-swatch').forEach(el => {
      el.style.borderColor = el.dataset.accent === current ? 'var(--text)' : 'transparent';
    });
  }
}

function closeSettings(): void {
  document.getElementById('settingsOverlay')!.style.display = 'none';
}

function switchSettingsTab(tabId: SettingsTabId): void {
  activeSettingsTab = tabId;

  document.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach((panel) => {
    panel.style.display = panel.dataset.settingsTab === tabId ? '' : 'none';
  });

  document.querySelectorAll<HTMLElement>('[data-settings-tab-button]').forEach((btn) => {
    const isActive = btn.dataset.settingsTabButton === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

async function refreshPasskeyEnrollmentStatus(message?: string): Promise<void> {
  if (!PASSKEY_UI_ENABLED) return;
  const statusEl = document.getElementById('passkeyEnrollmentStatus');
  const enrollBtn = document.getElementById('btnEnrollPasskey') as HTMLButtonElement | null;
  if (!statusEl || !enrollBtn) return;

  if (message) {
    statusEl.textContent = message;
    return;
  }

  const authPasskeyModule = await getAuthPasskeyModule();
  const passkeySupported = await authPasskeyModule.canUsePasskeySignIn().catch(() => false);
  if (!passkeySupported) {
    statusEl.textContent = 'Passkeys are not available on this device/browser.';
    enrollBtn.disabled = true;
    return;
  }

  enrollBtn.disabled = false;
  try {
    const status = await authPasskeyModule.getPasskeyEnrollmentStatus();
    statusEl.textContent = status.enrolled
      ? 'Passkey enrolled. You can now sign in with biometrics/device unlock.'
      : 'No passkey enrolled yet.';
  } catch {
    statusEl.textContent = 'Sign in with Google first, then add a passkey.';
  }
}

function updateSyncProviderStatus(): void {
  const el = document.getElementById('syncProviderStatus');
  const disconnectBtn = document.getElementById('btnDisconnectSync')!;
  const quickSelect = document.getElementById('syncProviderQuickSelect') as HTMLSelectElement | null;
  const provider = syncEngine.getProvider();
  if (!el) return;
  if (provider && provider.isAuthenticated()) {
    el.textContent = `Connected to ${provider.name}`;
    el.style.color = 'var(--green, #4caf50)';
    disconnectBtn.style.display = '';
    if (quickSelect) {
      quickSelect.value = provider.id === 'google-drive'
        ? 'gdrive'
        : provider.id === 'onedrive'
          ? 'onedrive'
          : 'dropbox';
    }
  } else {
    el.textContent = 'Not connected';
    el.style.color = 'var(--text3)';
    disconnectBtn.style.display = 'none';
    if (quickSelect) quickSelect.value = selectedSyncProviderType;
  }
}

/* ─── AI Provider Settings ─── */
async function renderAIProviderSettings(): Promise<void> {
  const container = document.getElementById('aiProviderCards')!;
  const select = document.getElementById('selActiveProvider') as HTMLSelectElement;
  const { dispatchModule } = await ensureLLMRuntime();
  const {
    getAllProviders,
    getActiveProvider,
    setActiveProvider,
    buildAutoChain,
    setFallbackChain,
    loadApiKey,
    getProviderModel,
    saveApiKey,
    deleteApiKey,
    setProviderModel,
  } = dispatchModule;
  const providers = getAllProviders();
  const activeId = await getActiveProvider();

  // Populate active provider dropdown
  select.innerHTML = '<option value="local">Local (WebLLM)</option>' +
    providers.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  select.value = activeId;

  select.onchange = async () => {
    await setActiveProvider(select.value);
    // Rebuild fallback chain with new active provider
    const chain = await buildAutoChain();
    await setFallbackChain(chain);
    showProviderStatus(`Active provider set to ${select.options[select.selectedIndex].text}`);
  };

  // Render provider cards
  const cards: string[] = [];
  for (const p of providers) {
    const hasKey = !!(await loadApiKey(p.id));
    const savedModel = await getProviderModel(p.id);
    const setup = AI_PROVIDER_SETUP[p.id];
    const setupSteps = setup
      ? `<ol style="margin:6px 0 0 18px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:10px;color:var(--text3);">${setup.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
      : '';
    cards.push(`
      <div class="provider-card" style="border:1px solid var(--border);border-radius:8px;padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <strong style="font-size:12px;">${p.name}</strong>
          <span style="font-size:10px;color:${hasKey ? 'var(--green, #4caf50)' : 'var(--text3)'};">${hasKey ? '● Connected' : '○ Not configured'}</span>
        </div>
        ${setup ? `<details style="margin-bottom:6px;"><summary style="cursor:pointer;font-size:10px;color:var(--accent);">How to get ${escapeHtml(p.name)} credentials</summary><div style="margin-top:6px;"><a href="${setup.docsUrl}" target="_blank" rel="noreferrer" style="font-size:10px;color:var(--accent);">Open ${escapeHtml(p.name)} credentials page ↗</a>${setupSteps}</div></details>` : ''}
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input type="password" class="provider-key-input" data-provider="${p.id}"
            placeholder="${setup ? escapeHtml(setup.keyHint) : 'API key'}" autocomplete="off"
            value="${hasKey ? '••••••••••••••••' : ''}"
            style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:11px;" />
          <button class="btn btn-primary btn-sm provider-save-key" data-provider="${p.id}" style="font-size:11px;">Save</button>
          ${hasKey ? `<button class="btn btn-ghost btn-sm provider-delete-key" data-provider="${p.id}" style="font-size:11px;color:var(--red);">${closeIconSvg(10)}</button>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <label style="font-size:10px;color:var(--text3);">Model:</label>
          <select class="provider-model-select" data-provider="${p.id}" style="flex:1;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);font-size:11px;">
            ${p.models.map(m => `<option value="${m.id}" ${m.id === savedModel ? 'selected' : ''}>${m.name} (${Math.round(m.contextWindow / 1000)}K ctx)</option>`).join('')}
          </select>
        </div>
      </div>
    `);
  }
  container.innerHTML = cards.join('');

  // Wire save key buttons
  container.querySelectorAll<HTMLElement>('.provider-save-key').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.provider!;
      const input = container.querySelector<HTMLInputElement>(`.provider-key-input[data-provider="${pid}"]`)!;
      const key = input.value.trim();
      if (!key || key === '••••••••••••••••') {
        showProviderStatus('Enter a new API key to save.');
        return;
      }
      btn.textContent = 'Validating…';
      btn.setAttribute('disabled', 'true');
      const provider = getAllProviders().find(p => p.id === pid)!;
      const valid = await provider.validate(key);
      if (valid) {
        await saveApiKey(pid, key);
        // Rebuild fallback chain
        const chain = await buildAutoChain();
        await setFallbackChain(chain);
        showProviderStatus(`${provider.name} key saved and validated ✓`);
        renderAIProviderSettings();
      } else {
        showProviderStatus(`${provider.name} key validation failed. Check the key and try again.`);
        btn.textContent = 'Save';
        btn.removeAttribute('disabled');
      }
    });
  });

  // Wire delete key buttons
  container.querySelectorAll<HTMLElement>('.provider-delete-key').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.provider!;
      await deleteApiKey(pid);
      const chain = await buildAutoChain();
      await setFallbackChain(chain);
      // If this was the active provider, switch to local
      if (activeId === pid) {
        await setActiveProvider('local');
      }
      showProviderStatus('API key deleted.');
      renderAIProviderSettings();
    });
  });

  // Wire model selects
  container.querySelectorAll<HTMLSelectElement>('.provider-model-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await setProviderModel(sel.dataset.provider!, sel.value);
      showProviderStatus(`Model set to ${sel.options[sel.selectedIndex].text}`);
    });
  });
}

function showProviderStatus(msg: string): void {
  const el = document.getElementById('aiProviderStatus');
  if (el) {
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 4000);
  }
}

type CommandPaletteItem = {
  id: string;
  label: string;
  keywords: string;
  aliases?: string[];
  disabled?: boolean;
  run: () => Promise<void> | void;
};

let commandPaletteFocusRelease: (() => void) | null = null;
let recentCommandIds: string[] = [];

function loadRecentCommands(): void {
  const raw = localStorage.getItem(COMMAND_PALETTE_RECENTS_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      recentCommandIds = parsed.filter((id): id is string => typeof id === 'string').slice(0, 8);
    }
  } catch {
    recentCommandIds = [];
  }
}

function rememberRecentCommand(commandId: string): void {
  recentCommandIds = [commandId, ...recentCommandIds.filter((id) => id !== commandId)].slice(0, 8);
  localStorage.setItem(COMMAND_PALETTE_RECENTS_KEY, JSON.stringify(recentCommandIds));
}

function closeCommandPalette(): void {
  const overlay = document.getElementById('commandPaletteOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  if (commandPaletteFocusRelease) {
    commandPaletteFocusRelease();
    commandPaletteFocusRelease = null;
  }
}

async function promptFolderSelection(promptTitle: string): Promise<number | null | undefined> {
  const folders = await db.folders.orderBy('order').toArray();
  const options = ['(Unfiled)', ...folders.map((f) => f.name)];
  const choice = prompt(`${promptTitle}\n${options.map((name, i) => `${i}. ${name}`).join('\n')}\n\nEnter number:`);
  if (choice == null) return undefined;
  const idx = Number.parseInt(choice, 10);
  if (Number.isNaN(idx) || idx < 0 || idx > folders.length) return undefined;
  return idx === 0 ? null : (folders[idx - 1]?.id ?? null);
}

function getCommandPaletteItems(): CommandPaletteItem[] {
  return [
    {
      id: 'new-note',
      label: 'Create New Note',
      keywords: 'create add note',
      aliases: ['new', 'note'],
      run: async () => { await createNewNote(); },
    },
    {
      id: 'open-settings',
      label: 'Open Settings',
      keywords: 'preferences configuration settings',
      aliases: ['settings', 'preferences'],
      run: () => openSettings(),
    },
    {
      id: 'open-templates',
      label: 'Open Note Templates',
      keywords: 'templates snippets quickstart',
      run: () => openNoteTemplates(),
    },
    {
      id: 'focus-search',
      label: 'Focus Search',
      keywords: 'search find notes',
      run: () => document.getElementById('searchInput')?.focus(),
    },
    {
      id: 'toggle-ai',
      label: 'Toggle AI Panel',
      keywords: 'assistant ai panel',
      aliases: ['ai', 'assistant'],
      run: () => toggleAIPanel(),
    },
    {
      id: 'open-ai-model-catalog',
      label: 'Open AI Model Catalog',
      keywords: 'ai model catalog local model webllm',
      run: () => openModelCatalog(),
    },
    {
      id: 'ai-mode-assist',
      label: 'Switch AI Mode: Assist',
      keywords: 'ai assist mode chat',
      run: () => setAIPanelMode('assist'),
    },
    {
      id: 'ai-mode-transform',
      label: 'Switch AI Mode: Transform',
      keywords: 'ai transform mode rewrite summarize',
      run: () => setAIPanelMode('transform'),
    },
    {
      id: 'toggle-focus-mode',
      label: focusModeEnabled ? 'Exit Focus Mode' : 'Enter Focus Mode',
      keywords: 'focus mode distraction free zen',
      run: () => setFocusModeEnabled(!focusModeEnabled),
    },
    {
      id: 'sync-now',
      label: 'Sync Now',
      keywords: 'sync cloud backup now',
      run: async () => {
        const provider = syncEngine.getProvider();
        if (!provider || !provider.isAuthenticated()) await connectProvider(selectedSyncProviderType);
        else await doSync();
      },
    },
    {
      id: 'sync-provider-gdrive',
      label: 'Set Sync Provider: Google Drive',
      keywords: 'sync provider google drive',
      run: () => setSyncProviderSelection('gdrive'),
    },
    {
      id: 'sync-provider-onedrive',
      label: 'Set Sync Provider: OneDrive',
      keywords: 'sync provider onedrive microsoft',
      run: () => setSyncProviderSelection('onedrive'),
    },
    {
      id: 'sync-provider-dropbox',
      label: 'Set Sync Provider: Dropbox',
      keywords: 'sync provider dropbox',
      run: () => setSyncProviderSelection('dropbox'),
    },
    {
      id: 'move-current-note',
      label: 'Move Current Note to Folder',
      keywords: 'move folder organize current note',
      disabled: !currentNote?.id,
      run: async () => {
        if (!currentNote?.id) return;
        const folderId = await promptFolderSelection('Move current note to:');
        if (folderId === undefined) return;
        await moveNoteToFolder(currentNote.id, folderId);
      },
    },
    {
      id: 'add-tag',
      label: 'Add Tag to Current Note',
      keywords: 'tag label annotate current note',
      disabled: !currentNote?.id,
      run: async () => {
        if (!currentNote?.id) return;
        const value = prompt('Tag to add:');
        if (!value?.trim()) return;
        addTag(value);
        await saveCurrentNote(true);
      },
    },
    {
      id: 'remove-tag',
      label: 'Remove Tag from Current Note',
      keywords: 'tag remove label current note',
      disabled: !currentNote?.id || noteTags.length === 0,
      run: async () => {
        if (!currentNote?.id || noteTags.length === 0) return;
        const value = prompt(`Remove which tag?\n${noteTags.join(', ')}`);
        if (!value?.trim()) return;
        removeTag(value);
        await saveCurrentNote(true);
      },
    },
    {
      id: 'bulk-move',
      label: 'Move Selected Notes',
      keywords: 'bulk multi select move folder',
      disabled: selectedNoteIds.size === 0,
      run: async () => {
        if (selectedNoteIds.size === 0) return;
        const ids = [...selectedNoteIds];
        const folderId = await promptFolderSelection('Move selected notes to:');
        if (folderId === undefined) return;
        await moveNotesToFolder(ids, folderId);
        clearNoteSelection();
      },
    },
    {
      id: 'bulk-delete',
      label: 'Delete Selected Notes',
      keywords: 'bulk multi delete notes',
      disabled: selectedNoteIds.size === 0,
      run: async () => {
        if (selectedNoteIds.size === 0) return;
        const ids = [...selectedNoteIds];
        if (!confirm(`Delete ${ids.length} selected note${ids.length === 1 ? '' : 's'}?`)) return;
        for (const id of ids) {
          removeFromIndex(id);
          await db.notes.delete(id);
          await deleteRemoteNoteFromFirestore(id);
        }
        clearNoteSelection();
        await refreshFileList();
      },
    },
  ];
}

function renderCommandPaletteList(query: string): void {
  const list = document.getElementById('commandPaletteList');
  if (!list) return;
  const q = query.trim().toLowerCase();
  const items = getCommandPaletteItems();
  const scored = items.map((item) => {
    if (!q) {
      const recentIndex = recentCommandIds.indexOf(item.id);
      return { item, score: recentIndex >= 0 ? 100 - recentIndex : 0 };
    }
    const label = item.label.toLowerCase();
    const keywords = item.keywords.toLowerCase();
    const aliasMatch = item.aliases?.some((alias) => alias.toLowerCase().includes(q)) ?? false;
    let score = 0;
    if (label.startsWith(q)) score += 80;
    if (label.includes(q)) score += 40;
    if (keywords.includes(q)) score += 25;
    if (aliasMatch) score += 35;
    const recentIndex = recentCommandIds.indexOf(item.id);
    if (recentIndex >= 0) score += 10 - recentIndex;
    return { item, score };
  }).filter((entry) => entry.score > 0 || !q).sort((a, b) => b.score - a.score).map((entry) => entry.item);
  list.innerHTML = scored.length === 0
    ? '<div class="command-palette-empty">No commands found</div>'
    : scored.map((item) => `
        <button type="button" class="command-palette-item${item.disabled ? ' disabled' : ''}" data-command-id="${item.id}" ${item.disabled ? 'disabled' : ''}>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `).join('');

  list.querySelectorAll<HTMLElement>('[data-command-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commandId = btn.dataset.commandId;
      const item = getCommandPaletteItems().find((candidate) => candidate.id === commandId);
      if (!item || item.disabled) return;
      if (commandId) rememberRecentCommand(commandId);
      closeCommandPalette();
      await item.run();
    });
  });
}

function openCommandPalette(): void {
  const overlay = document.getElementById('commandPaletteOverlay');
  const input = document.getElementById('commandPaletteInput') as HTMLInputElement | null;
  const dialog = overlay?.querySelector<HTMLElement>('.command-palette-dialog') || null;
  if (!overlay || !input || !dialog) return;
  overlay.style.display = 'flex';
  renderCommandPaletteList('');
  input.value = '';
  input.focus();
  if (commandPaletteFocusRelease) commandPaletteFocusRelease();
  commandPaletteFocusRelease = trapFocus(dialog);
}

function setSyncProviderSelection(type: SyncProviderType): void {
  selectedSyncProviderType = type;
  const quickSelect = document.getElementById('syncProviderQuickSelect') as HTMLSelectElement | null;
  const typeOrder: SyncProviderType[] = ['gdrive', 'onedrive', 'dropbox'];

  typeOrder.forEach((candidate) => {
    const buttonId = candidate === 'gdrive'
      ? 'btnConnectGdrive'
      : candidate === 'onedrive'
        ? 'btnConnectOnedrive'
        : 'btnConnectDropbox';
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.classList.toggle('btn-primary', candidate === type);
    button.classList.toggle('btn-ghost', candidate !== type);
  });

  const setup = SYNC_PROVIDER_SETUP[type];
  const guide = document.getElementById('syncProviderGuide');
  const managedClientId = getManagedSyncClientId(type);
  const isConfigured = managedClientId.length > 0;

  if (quickSelect) quickSelect.value = type;

  if (guide) {
    if (isConfigured) {
      guide.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:12px;">${setup.label}</strong>
          <span style="font-size:11px;color:var(--green, #4caf50);">✓ No setup required</span>
        </div>
        <p style="margin:8px 0 0;font-size:11px;color:var(--text2);line-height:1.5;">
          ${setup.description}
        </p>
      `;
    } else {
      guide.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:12px;">${setup.label}</strong>
          <span style="font-size:11px;color:var(--text3);">Not configured</span>
        </div>
        <p style="margin:8px 0 0;font-size:11px;color:var(--text2);line-height:1.5;">
          ${setup.label} sync has not been enabled for this app yet. Please contact support.
        </p>
      `;
    }
  }

  const connectButton = document.getElementById('btnConnectSelectedProvider') as HTMLButtonElement | null;
  if (connectButton) {
    connectButton.textContent = `Connect ${setup.label}`;
    connectButton.disabled = !isConfigured;
  }
}

/* ─── Cloud Sync ─── */
async function connectProvider(type: 'gdrive' | 'onedrive' | 'dropbox', providedClientId?: string): Promise<void> {
  const managedClientId = getManagedSyncClientId(type);
  const rawClientId = providedClientId ?? managedClientId;
  const clientId = rawClientId.trim();
  if (!clientId) {
    const setup = SYNC_PROVIDER_SETUP[type];
    setStatus(`${setup.label} sync is not configured for this app. Please contact support.`);
    return;
  }

  let provider;
  switch (type) {
    case 'gdrive': {
      const mod = await getGoogleDriveProviderModule();
      provider = new mod.GoogleDriveProvider(clientId.trim());
      break;
    }
    case 'onedrive': {
      const mod = await getOneDriveProviderModule();
      provider = new mod.OneDriveProvider(clientId.trim());
      break;
    }
    case 'dropbox': {
      const mod = await getDropboxProviderModule();
      provider = new mod.DropboxProvider(clientId.trim());
      break;
    }
  }

  try {
    await provider.authorize();
    await syncEngine.setProvider(provider);
    await setSetting('syncProvider', type);
    await setSetting('syncClientId', clientId.trim());
    syncEngine.start();
    updateSyncProviderStatus();
    setStatus(`Connected to ${provider.name}`);
  } catch (err) {
    setStatus(`Auth failed: ${err instanceof Error ? err.message : 'error'}`);
  }
}

async function disconnectSync(): Promise<void> {
  const provider = syncEngine.getProvider();
  if (provider) {
    syncEngine.stop();
    await provider.disconnect();
    await setSetting('syncProvider', '');
    await setSetting('syncClientId', '');
    updateSyncProviderStatus();
    setStatus('Disconnected from cloud');
  }
}

async function restoreSyncProvider(): Promise<void> {
  const type = await getSetting('syncProvider');
  const storedClientId = await getSetting('syncClientId');
  const restoredType = (type || '') as SyncProviderType;
  const managedClientId = restoredType ? getManagedSyncClientId(restoredType) : '';
  const clientId = (managedClientId || storedClientId || '').trim();
  if (!type) return;
  if (!clientId) return;

  let provider;
  switch (type) {
    case 'gdrive': {
      const mod = await getGoogleDriveProviderModule();
      provider = new mod.GoogleDriveProvider(clientId);
      break;
    }
    case 'onedrive': {
      const mod = await getOneDriveProviderModule();
      provider = new mod.OneDriveProvider(clientId);
      break;
    }
    case 'dropbox': {
      const mod = await getDropboxProviderModule();
      provider = new mod.DropboxProvider(clientId);
      break;
    }
    default: return;
  }

  await provider.init();
  if (provider.isAuthenticated()) {
    await syncEngine.setProvider(provider);
    syncEngine.start();
  }
}

async function doSync(silent = false): Promise<void> {
  setSyncVisualState('syncing', 'Processing cloud changes');
  const result: SyncResult = await syncEngine.sync();
  if (result.errors.length) {
    setStatus(`Sync error: ${result.errors[0]}`);
    setSyncVisualState(navigator.onLine ? 'failed' : 'offline', result.errors[0]);
  } else if (!silent) {
    setStatus(`Synced: ↑${result.pushed} ↓${result.pulled}${result.conflicts ? ` ⚠${result.conflicts}` : ''}`);
    refreshSyncVisualState();
  }

  // Show conflict modal if there are unresolved conflicts
  if (result.conflicts > 0) {
    showConflictModal();
  }

  // Refresh file list to show any pulled notes
  if (result.pulled > 0) {
    await refreshFileList();
    await rebuildSearchIndex();
  }
}

/* ─── Conflict Resolution ─── */
let activeConflictNoteId: number | null = null;

function showConflictModal(): void {
  const conflicts = syncEngine.getConflicts();
  if (conflicts.length === 0) return;

  const conflict = conflicts[0]; // Show first conflict
  activeConflictNoteId = conflict.noteId;

  const diff = diffTexts(conflict.localContent, conflict.remoteContent);
  document.getElementById('conflictDiff')!.innerHTML = renderDiffHTML(diff);
  document.getElementById('conflictOverlay')!.style.display = 'flex';

  // Wire buttons
  document.getElementById('btnKeepLocal')!.onclick = async () => {
    if (activeConflictNoteId != null) {
      await syncEngine.resolveConflict(activeConflictNoteId, 'local');
      closeConflict();
      // Show next conflict or close
      if (syncEngine.getConflicts().length > 0) showConflictModal();
      await refreshFileList();
    }
  };
  document.getElementById('btnKeepRemote')!.onclick = async () => {
    if (activeConflictNoteId != null) {
      await syncEngine.resolveConflict(activeConflictNoteId, 'remote');
      closeConflict();
      if (syncEngine.getConflicts().length > 0) showConflictModal();
      await refreshFileList();
      // Reload note if currently open
      if (currentNote?.id === activeConflictNoteId) {
        await openNote(activeConflictNoteId);
      }
    }
  };
}

function closeConflict(): void {
  document.getElementById('conflictOverlay')!.style.display = 'none';
  activeConflictNoteId = null;
}

/* ─── Version History ─── */
async function openHistory(): Promise<void> {
  if (!currentNote?.id) return;
  const revisions = await getRevisions(currentNote.id);
  const historyList = document.getElementById('historyList')!;
  const historyDiff = document.getElementById('historyDiff')!;

  if (revisions.length === 0) {
    renderSurfaceState(historyList, 'empty', 'No history yet. Save the note to create revisions.');
    historyDiff.innerHTML = '';
    document.getElementById('historyOverlay')!.style.display = 'flex';
    return;
  }

  historyList.innerHTML = revisions.map((r: Revision, i: number) => `
    <div class="history-item" data-rev-idx="${i}" style="
      padding:6px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;
      font-size:11px;display:flex;justify-content:space-between;
    ">
      <span>${new Date(r.timestamp).toLocaleString()}</span>
      <span style="color:var(--text3);">${r.wordCount} words</span>
    </div>
  `).join('');

  // Default: show diff between latest and previous
  if (revisions.length >= 2) {
    const diff = diffTexts(revisions[revisions.length - 2].content, revisions[revisions.length - 1].content);
    historyDiff.innerHTML = renderDiffHTML(diff);
  } else {
    historyDiff.innerHTML = '<p style="font-size:12px;color:var(--text3);">Need at least 2 revisions to show diff.</p>';
  }

  // Wire revision clicks to show diff vs current
  historyList.querySelectorAll<HTMLElement>('[data-rev-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.revIdx);
      historyList.querySelectorAll('.history-item').forEach(h => (h as HTMLElement).style.borderColor = 'var(--border)');
      el.style.borderColor = 'var(--accent)';
      if (currentNote) {
        const diff = diffTexts(revisions[idx].content, currentNote.content);
        historyDiff.innerHTML = `<p style="font-size:11px;color:var(--text3);margin:0 0 8px;">Comparing revision ${idx + 1} → current</p>` + renderDiffHTML(diff);
      }
    });
  });

  document.getElementById('historyOverlay')!.style.display = 'flex';
}

function closeHistory(): void {
  document.getElementById('historyOverlay')!.style.display = 'none';
}

/* ─── All Tips Modal ─── */
function showAllTipsModal(): void {
  // Group tips by category
  const categoryLabels: Record<string, string> = {
    shortcuts: 'Shortcuts',
    editor:    'Editor',
    markdown:  'Markdown',
    mermaid:   '◈ Diagrams',
    snippets:  '⚡ Snippets',
    ai:        'AI',
    search:    'Search',
  };

  const groups = new Map<string, Tip[]>();
  for (const tip of TIPS) {
    if (!groups.has(tip.category)) groups.set(tip.category, []);
    groups.get(tip.category)!.push(tip);
  }

  const body = [...groups.entries()].map(([cat, tips]) => `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text3);margin-bottom:6px;">${categoryLabels[cat] ?? cat}</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${tips.map(t => `<div style="font-size:12px;color:var(--text);padding:6px 10px;background:var(--bg2);border-radius:6px;line-height:1.5;">${t.text}</div>`).join('')}
      </div>
    </div>
  `).join('');

  // Reuse modal-overlay pattern
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog" style="width:500px;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg1);z-index:1;">
        <h3 style="margin:0;font-size:15px;font-weight:600;">All Tips (${TIPS.length})</h3>
        <button class="btn btn-ghost btn-icon btn-sm" id="btnCloseAllTips" style="font-size:14px;">${closeIconSvg(12)}</button>
      </div>
      <div style="padding:16px;">${body}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#btnCloseAllTips')!.addEventListener('click', close);
  overlay.addEventListener('click', (e: Event) => { if (e.target === overlay) close(); });
}

/* ─── AI Panel ─── */

let aiChatHistory: ChatMessage[] = [];

function syncAIPanelUIState(): void {
  const panel = document.getElementById('aiPanel');
  const backdrop = document.getElementById('aiPanelBackdrop');
  if (!panel) return;
  const open = panel.classList.contains('open');
  if (backdrop) backdrop.classList.toggle('open', open);
  syncPanelToggleButtons();
  syncAIMobileModeUI();
}

async function toggleAIPanel(): Promise<void> {
  const panel = document.getElementById('aiPanel')!;
  const opening = !panel.classList.contains('open');
  if (opening) closeMobileBottomDrawer();
  panel.classList.toggle('open');
  if (!opening) {
    aiMobileExpanded = false;
  }
  syncAIPanelUIState();

  if (opening) {
    void ensureLLMRuntime();
    void ensureAutoLoadedLocalModel();
  }
}

async function closeAIPanel(): Promise<void> {
  document.getElementById('aiPanel')!.classList.remove('open');
  aiMobileExpanded = false;
  aiConversationMode = false;
  if (aiVoiceInputListening) {
    const speechModule = await getSpeechModule();
    speechModule.stopSpeech();
    aiVoiceInputListening = false;
  }
  const speechModule = await getSpeechModule();
  speechModule.stopTts();
  updateAIComposerUI();
  syncAIPanelUIState();
}

async function openModelCatalog(): Promise<void> {
  document.getElementById('modelCatalogOverlay')!.style.display = 'flex';
  await renderModelCatalog();
}

function closeModelCatalog(): void {
  document.getElementById('modelCatalogOverlay')!.style.display = 'none';
}

async function renderModelCatalog(): Promise<void> {
  const list = document.getElementById('modelCatalogList')!;
  const gpuEl = document.getElementById('gpuInfo')!;

  const useE2EMockCatalog =
    localStorage.getItem('e2e-mode') === 'true' &&
    localStorage.getItem('e2e-mock-model-catalog') === 'true';
  if (useE2EMockCatalog) {
    gpuEl.textContent = 'WebGPU: ✓ (Mock GPU)';
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
    return;
  }

  const { engineModule } = await ensureLLMRuntime();
  const { detectWebGPU, llmEngine } = engineModule;

  renderSurfaceState(list, 'loading', 'Loading model catalog...');

  const gpu = await detectWebGPU();
  gpuEl.textContent = gpu.supported
    ? `WebGPU: ✓ (${gpu.vendor})`
    : 'WebGPU: ✗ — WASM fallback may be slower';

  let models = [] as Awaited<ReturnType<typeof llmEngine.getModelCatalog>>;
  try {
    models = await llmEngine.getModelCatalog();
  } catch (error) {
    renderSurfaceState(list, 'error', 'Unable to load model catalog. Check network access and try again.');
    console.warn('Model catalog load failed:', error);
    return;
  }
  const loadedId = llmEngine.getLoadedModelId();

  list.innerHTML = models.map(m => `
    <div class="model-card" style="
      border:1px solid ${m.id === loadedId ? 'var(--accent)' : 'var(--border)'};
      border-radius:8px;padding:12px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <strong style="font-size:13px;">${m.name}</strong>
          ${m.id === loadedId ? '<span style="font-size:10px;color:var(--accent);margin-left:6px;">● LOADED</span>' : ''}
          <p style="font-size:11px;color:var(--text3);margin:2px 0 0;">${m.description}</p>
          <span style="font-size:10px;color:var(--text3);">${m.sizeMB >= 1000 ? (m.sizeMB / 1000).toFixed(1) + ' GB' : m.sizeMB + ' MB'}${m.cached ? ' · Cached' : ''}</span>
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0;">
          ${m.id === loadedId
            ? '<button class="btn btn-ghost btn-sm ai-model-action" data-action="unload" data-model-id="' + m.id + '">Unload</button>'
            : '<button class="btn btn-primary btn-sm ai-model-action" data-action="load" data-model-id="' + m.id + '">Load</button>'}
          ${m.cached ? '<button class="btn btn-ghost btn-sm ai-model-action" data-action="delete" data-model-id="' + m.id + '" style="color:var(--red);">Delete</button>' : ''}
        </div>
      </div>
    </div>
  `).join('');

  // Wire model action buttons
  list.querySelectorAll<HTMLElement>('.ai-model-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action!;
      const modelId = btn.dataset.modelId!;
      if (action === 'load') {
        btn.textContent = 'Loading…';
        btn.setAttribute('disabled', 'true');
        try {
          await loadLocalModel(modelId);
        } catch {
          // Status listener handles error display
        }
        renderModelCatalog();
      } else if (action === 'unload') {
        await llmEngine.unload();
        await setSetting(LOCAL_MODEL_SETTING_KEY, '');
        renderModelCatalog();
      } else if (action === 'delete') {
        await llmEngine.deleteModel(modelId);
        if (llmEngine.getLoadedModelId() === modelId) await llmEngine.unload();
        if ((await getSetting(LOCAL_MODEL_SETTING_KEY)) === modelId) {
          await setSetting(LOCAL_MODEL_SETTING_KEY, '');
        }
        renderModelCatalog();
      }
    });
  });
}

function updateAIStatus(status: LLMStatus, detail?: string): void {
  const nameEl = document.getElementById('aiModelName')!;
  currentLLMStatus = status;
  currentLLMDetail = detail;

  nameEl.style.color = 'var(--text3)';

  switch (status) {
    case 'idle':
      nameEl.textContent = 'No model loaded';
      setAIProgressState();
      aiIsGenerating = false;
      break;
    case 'loading':
      nameEl.textContent = `Loading ${detail || 'model'}…`;
      aiIsGenerating = false;
      break;
    case 'ready':
      nameEl.textContent = detail || 'Model ready';
      nameEl.style.color = 'var(--text2)';
      setAIProgressState();
      aiIsGenerating = false;
      break;
    case 'generating':
      nameEl.style.color = 'var(--text2)';
      aiIsGenerating = true;
      break;
    case 'error':
      nameEl.textContent = `Error: ${detail || 'Unknown'}`;
      nameEl.style.color = 'var(--red)';
      setAIProgressState();
      aiIsGenerating = false;
      break;
  }

  updateAIComposerUI();
  updateRawGenerationAvailabilityUI();
}

function renderPendingAIAttachment(): void {
  const tray = document.getElementById('aiAttachmentTray') as HTMLElement | null;
  if (!tray) return;
  if (!pendingAIAttachment) {
    tray.style.display = 'none';
    tray.innerHTML = '';
    return;
  }

  tray.style.display = 'flex';
  tray.innerHTML = `
    <div class="ai-attachment-chip">
      <span class="ai-attachment-chip-name">${escapeHtml(pendingAIAttachment.filename)}</span>
      <span class="ai-attachment-chip-meta">${escapeHtml(pendingAIAttachment.mimeType)}</span>
      <button class="btn btn-ghost btn-icon btn-sm ai-attachment-remove" data-remove-ai-attachment title="Remove attachment" aria-label="Remove attachment">${closeIconSvg(10)}</button>
    </div>
  `;
}

function updateAIComposerUI(): void {
  const btn = document.getElementById('btnAIConverse') as HTMLButtonElement | null;
  const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
  if (!btn || !input) return;

  btn.classList.toggle('ai-voice-listening', aiVoiceInputListening);
  btn.classList.toggle('ai-converse-stop', aiIsGenerating || aiConversationMode);

  if (aiIsGenerating) {
    btn.title = 'Stop response';
    btn.setAttribute('aria-label', 'Stop response');
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>';
    return;
  }

  if (aiVoiceInputListening) {
    btn.title = 'Stop listening';
    btn.setAttribute('aria-label', 'Stop listening');
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>';
    return;
  }

  if (input.value.trim()) {
    btn.title = 'Send message';
    btn.setAttribute('aria-label', 'Send message');
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2.5 13.5 8 3 13.5 4.8 8z"/></svg>';
    return;
  }

  btn.title = aiConversationMode ? 'Stop live conversation' : 'Start live conversation';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.2" width="4" height="7.1" rx="2"/><path d="M4 7.9a4 4 0 0 0 8 0M8 11.9V14M6.4 14h3.2"/></svg>';
}

async function attachFileToAIChat(file: File): Promise<void> {
  const uploadModule = await getUploadModule();
  if (!uploadModule.isSupportedFile(file)) {
    setStatus('Unsupported file for AI chat. Use PDF, DOCX, or image.');
    return;
  }

  try {
    setStatus(`Extracting ${file.name}…`);
    const result = await uploadModule.extractFromFile(file, (pct: number, label: string) => {
      setStatus(`${label} ${pct}%`);
    });

    const extractedText = result.text.trim().slice(0, AI_ATTACHMENT_TEXT_LIMIT);
    const preview = extractedText.slice(0, AI_ATTACHMENT_PREVIEW_LIMIT);
    pendingAIAttachment = {
      filename: result.filename,
      mimeType: result.mimeType,
      extractedText,
      preview,
    };
    renderPendingAIAttachment();
    updateAIComposerUI();
    setStatus(`Attached ${result.filename} for AI analysis`);
  } catch (err) {
    setStatus(`Attachment extraction failed: ${err instanceof Error ? err.message : 'error'}`);
  }
}

async function startAIListeningTurn(): Promise<void> {
  const speechModule = await getSpeechModule();
  if (!speechModule.isWebSpeechSupported()) {
    setStatus('Speech recognition not supported in this browser');
    return;
  }

  if (speechModule.getSpeechListening()) {
    speechModule.stopSpeech();
    document.getElementById('btnMic')?.classList.remove('mic-recording');
  }

  const aiInputEl = document.getElementById('aiInput') as HTMLTextAreaElement | null;
  if (!aiInputEl) return;

  speechModule.startWebSpeech(
    (text: string, isFinal: boolean) => {
      aiInputEl.value = isFinal ? text.trim() : text;
      updateAIComposerUI();
      if (isFinal && aiInputEl.value) {
        speechModule.stopSpeech();
        aiVoiceInputListening = false;
        updateAIComposerUI();
        void sendAIMessage();
      }
    },
    (status: 'idle' | 'listening' | 'processing' | 'error') => {
      if (status === 'idle' || status === 'error') {
        aiVoiceInputListening = false;
        updateAIComposerUI();
      }
    },
    { lang: speechLang, continuous: false },
  );

  aiVoiceInputListening = true;
  updateAIComposerUI();
}

async function stopAIListeningTurn(): Promise<void> {
  const speechModule = await getSpeechModule();
  speechModule.stopSpeech();
  aiVoiceInputListening = false;
  updateAIComposerUI();
}

async function handleAIConverseAction(): Promise<void> {
  const input = document.getElementById('aiInput') as HTMLTextAreaElement | null;
  if (!input) return;

  if (aiIsGenerating) {
    aiConversationMode = false;
    await abortAIGeneration();
    updateAIComposerUI();
    return;
  }

  if (aiVoiceInputListening) {
    aiConversationMode = false;
    await stopAIListeningTurn();
    announce('Live conversation stopped');
    return;
  }

  const speechModule = await getSpeechModule();
  if (aiConversationMode && speechModule.getTtsState() === 'speaking') {
    aiConversationMode = false;
    speechModule.stopTts();
    updateAIComposerUI();
    announce('Live conversation stopped');
    return;
  }

  if (input.value.trim() || pendingAIAttachment) {
    aiConversationMode = false;
    await sendAIMessage();
    return;
  }

  aiConversationMode = true;
  await startAIListeningTurn();
  announce('Live conversation started. Speak now');
}

function addAIMessage(role: 'user' | 'assistant', content: string): HTMLElement {
  const container = document.getElementById('aiMessages')!;
  const wrapper = document.createElement('div');
  wrapper.className = `ai-msg ai-msg-${role}`;

  const bodyEl = document.createElement('div');
  if (role === 'assistant' && content) {
    void renderMarkdownContent(content, bodyEl);
  } else {
    bodyEl.textContent = content;
  }
  wrapper.appendChild(bodyEl);

  if (role === 'assistant') {
    const actionsBar = document.createElement('div');
    actionsBar.className = 'ai-response-actions';
    actionsBar.style.cssText = 'display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;';
    actionsBar.innerHTML = `
      <button class="btn btn-ghost btn-sm ai-act" data-act="copy" title="Copy" style="font-size:10px;padding:2px 6px;">Copy</button>
      <button class="btn btn-ghost btn-sm ai-act" data-act="insert" title="Insert at cursor" style="font-size:10px;padding:2px 6px;">Insert</button>
      <button class="btn btn-ghost btn-sm ai-act" data-act="replace" title="Replace selection" style="font-size:10px;padding:2px 6px;">Replace</button>
      <button class="btn btn-ghost btn-sm ai-act" data-act="append" title="Append to note" style="font-size:10px;padding:2px 6px;">Append</button>
    `;
    actionsBar.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn) return;
      const txt = bodyEl.textContent || '';
      handleResponseAction(btn.dataset.act!, txt);
    });
    wrapper.appendChild(actionsBar);

    const suggestedBar = document.createElement('div');
    suggestedBar.className = 'ai-suggested-pills';
    suggestedBar.innerHTML = AI_SUGGESTED_ACTIONS.map((action) =>
      `<button class="ai-suggest-pill" data-suggest-act="${action.id}" title="${action.title}">${action.label}</button>`
    ).join('');
    suggestedBar.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-suggest-act]');
      if (!btn) return;
      const action = btn.dataset.suggestAct as AISuggestedActionId | undefined;
      if (!action) return;
      void handleAISuggestedAction(action);
    });
    wrapper.appendChild(suggestedBar);
  }

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
  return bodyEl;
}

async function createLinkedNoteFromCurrent(): Promise<void> {
  if (!currentNote?.id || !editor) {
    setStatus('Open a note to link first.');
    return;
  }

  const sourceNoteId = currentNote.id;

  try {
    await saveCurrentNote(true);
    await createNewNote();

    const linkedTitle = (currentNote?.title || '').trim() || `Untitled ${new Date().toLocaleDateString()}`;
    const backlinkToken = `[[${linkedTitle}]]`;

    await openNote(sourceNoteId);
    if (!editor) {
      setStatus('Could not link notes: editor is unavailable.');
      return;
    }

    const needsLeadingBreak = editor.state.doc.length > 0;
    insertAtCursor(editor, `${needsLeadingBreak ? '\n' : ''}${backlinkToken}`);
    await saveCurrentNote(true);
    await updateBacklinks();
    setStatus('Linked note created.');
  } catch {
    setStatus('Failed to create linked note.');
  }
}

async function handleAISuggestedAction(action: AISuggestedActionId): Promise<void> {
  switch (action) {
    case 'create-note':
      await createNewNote();
      break;
    case 'summarize-note':
      await runQuickPrompt('Summarize');
      break;
    case 'action-items':
      await runQuickPrompt('Action Items');
      break;
    case 'link-notes':
      await createLinkedNoteFromCurrent();
      break;
  }
}

async function sendAIMessage(): Promise<void> {
  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  let text = input.value.trim();
  const attachment = pendingAIAttachment;
  if (!text && !attachment) return;

  if (!text && attachment) {
    text = 'Please analyze the attached file and summarize the key points.';
  }

  const { engineModule, dispatchModule } = await ensureLLMRuntime();
  const {
    getActiveProvider,
    getAllProviders,
    loadApiKey,
    dispatchChat,
  } = dispatchModule;
  const { llmEngine } = engineModule;

  const activeId = await getActiveProvider();
  if (activeId === 'local' && llmEngine.getStatus() === 'idle') {
    const externals = getAllProviders();
    let anyExternal = false;
    for (const p of externals) {
      if (await loadApiKey(p.id)) { anyExternal = true; break; }
    }
    if (!anyExternal) {
      addAIMessage('assistant', 'No AI provider is ready. Load a local model in Models or configure an API key in Settings.');
      return;
    }
  }
  if (activeId === 'local' && llmEngine.getStatus() === 'loading') return;
  if (activeId === 'local' && llmEngine.getStatus() === 'generating') return;

  const userDisplayText = attachment
    ? `${text}\n\n[Attached for analysis: ${attachment.filename}]`
    : text;
  const modelUserText = attachment
    ? `${text}\n\n[ATTACHMENT CONTEXT]\nFilename: ${attachment.filename}\nMimeType: ${attachment.mimeType}\nExtractedText:\n${attachment.extractedText}`
    : text;

  input.value = '';
  pendingAIAttachment = null;
  renderPendingAIAttachment();
  updateAIComposerUI();
  addAIMessage('user', userDisplayText);

  const systemMsg: ChatMessage = {
    role: 'system',
    content: `You are a helpful AI writing assistant integrated into a note-taking app. ${currentNote ? `The user is editing a note titled "${currentNote.title}". Note content:\n\n${currentNote.content.slice(0, 4000)}` : 'No note is currently open.'}`,
  };

  const messages: ChatMessage[] = [
    systemMsg,
    ...aiChatHistory.slice(-10),
    { role: 'user', content: modelUserText },
  ];

  const msgEl = addAIMessage('assistant', '');
  let fullResponse = '';

  aiIsGenerating = true;
  updateAIComposerUI();

  try {
    const result = await dispatchChat(messages, (_token, full) => {
      fullResponse = full;
      void renderMarkdownContent(full, msgEl);
      msgEl.parentElement!.scrollTop = msgEl.parentElement!.scrollHeight;
    });
    fullResponse = result.text;
  } catch {
    if (!fullResponse) msgEl.innerHTML = '<em style="color:var(--red);">Generation failed.</em>';
  } finally {
    aiIsGenerating = false;
    updateAIComposerUI();
  }

  if (fullResponse) {
    aiChatHistory.push({ role: 'user', content: text });
    aiChatHistory.push({ role: 'assistant', content: fullResponse });

    const speechModule = await getSpeechModule();
    if (aiVoiceOutputEnabled && speechModule.isTtsSupported()) {
      await speechModule.speakText(fullResponse, { lang: speechLang });
    }

    if (aiConversationMode && document.getElementById('aiPanel')?.classList.contains('open')) {
      await startAIListeningTurn();
    }
  }
}

async function runQuickPrompt(name: string): Promise<void> {
  if (!currentNote) {
    addAIMessage('assistant', 'Open a note first.');
    return;
  }

  // Find builtin or custom prompt by name
  const builtin = BUILTIN_PROMPTS.find(p => p.name === name);
  if (!builtin) return;

  const ctx: PromptContext = {
    selection: editor ? getSelectedText(editor) : '',
    note: currentNote.content.slice(0, 4000),
    title: currentNote.title,
  };

  const userText = interpolate(builtin.userTemplate, ctx);
  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  input.value = userText;

  document.getElementById('aiPanel')!.classList.add('open');
  syncAIPanelUIState();
  await ensureLLMRuntime();
  await sendAIMessage();
}

async function runCustomPrompt(promptId: number): Promise<void> {
  if (!currentNote) {
    addAIMessage('assistant', 'Open a note first.');
    return;
  }

  const all = await getAllPrompts();
  const prompt = all.find(p => p.id === promptId);
  if (!prompt) return;

  const ctx: PromptContext = {
    selection: editor ? getSelectedText(editor) : '',
    note: currentNote.content.slice(0, 4000),
    title: currentNote.title,
  };

  const userText = interpolate(prompt.userTemplate, ctx);
  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  input.value = userText;

  document.getElementById('aiPanel')!.classList.add('open');
  syncAIPanelUIState();
  await ensureLLMRuntime();
  await sendAIMessage();
}

/* ─── Response Actions ─── */
function handleResponseAction(action: string, text: string): void {
  if (!text) return;
  switch (action) {
    case 'copy':
      navigator.clipboard.writeText(text);
      break;
    case 'insert':
      if (editor) insertAtCursor(editor, text);
      break;
    case 'replace':
      if (editor) {
        const sel = getSelectedText(editor);
        if (sel) {
          replaceContent(editor, text);
        } else {
          insertAtCursor(editor, text);
        }
      }
      break;
    case 'append':
      if (editor) {
        const len = editor.state.doc.length;
        editor.dispatch({ changes: { from: len, insert: '\n\n' + text } });
      }
      break;
  }
}

/* ─── Prompt Library UI ─── */
let promptFilter = 'all';

function openPromptLibrary(): void {
  document.getElementById('promptLibraryOverlay')!.style.display = '';
  refreshPromptLibrary();
}

function closePromptLibrary(): void {
  document.getElementById('promptLibraryOverlay')!.style.display = 'none';
}

async function refreshPromptLibrary(): Promise<void> {
  const list = document.getElementById('promptLibraryList')!;
  list.innerHTML = '';

  // Built-in prompts
  const builtins = BUILTIN_PROMPTS.filter(p => promptFilter === 'all' || p.category === promptFilter);
  for (const p of builtins) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px;';
    card.innerHTML = `<span style="font-size:18px;">${p.icon}</span><div style="flex:1;"><div style="font-size:13px;font-weight:500;">${p.name}</div><div style="font-size:10px;color:var(--text3);text-transform:capitalize;">${p.category}</div></div><span style="font-size:10px;color:var(--text3);">Built-in</span>`;
    card.addEventListener('click', () => {
      closePromptLibrary();
      runQuickPrompt(p.name);
    });
    if (promptFilter !== 'custom') list.appendChild(card);
  }

  // Custom prompts
  if (promptFilter === 'all' || promptFilter === 'custom') {
    const customs = await getAllPrompts();
    for (const p of customs) {
      const card = document.createElement('div');
      card.style.cssText = 'padding:10px;border:1px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px;';
      card.innerHTML = `<span style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:.04em;">P</span><div style="flex:1;"><div style="font-size:13px;font-weight:500;">${escapeHtml(p.name)}</div><div style="font-size:10px;color:var(--text3);">Custom</div></div><div style="display:flex;gap:4px;"><button class="btn btn-ghost btn-sm prompt-edit" data-id="${p.id}" style="font-size:10px;" title="Edit">Edit</button><button class="btn btn-ghost btn-sm prompt-del" data-id="${p.id}" style="font-size:10px;color:var(--red);" title="Delete">Delete</button></div>`;
      card.querySelector('.prompt-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openPromptEditor(p.id!);
      });
      card.querySelector('.prompt-del')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deletePrompt(p.id!);
        refreshPromptLibrary();
      });
      card.addEventListener('click', () => {
        closePromptLibrary();
        runCustomPrompt(p.id!);
      });
      list.appendChild(card);
    }
  }
}

/* ─── Prompt Editor ─── */
let editingPromptId: number | null = null;

function openPromptEditor(id?: number): void {
  editingPromptId = id ?? null;
  const title = document.getElementById('promptEditorTitle')!;
  const nameInput = document.getElementById('promptEditorName') as HTMLInputElement;
  const sysInput = document.getElementById('promptEditorSystem') as HTMLTextAreaElement;
  const tmplInput = document.getElementById('promptEditorTemplate') as HTMLTextAreaElement;

  if (id) {
    title.textContent = 'Edit Prompt';
    getAllPrompts().then(all => {
      const p = all.find(x => x.id === id);
      if (p) {
        nameInput.value = p.name;
        sysInput.value = p.systemInstruction;
        tmplInput.value = p.userTemplate;
      }
    });
  } else {
    title.textContent = 'New Prompt';
    nameInput.value = '';
    sysInput.value = '';
    tmplInput.value = '';
  }
  document.getElementById('promptEditorOverlay')!.style.display = '';
}

function closePromptEditor(): void {
  document.getElementById('promptEditorOverlay')!.style.display = 'none';
  editingPromptId = null;
}

async function savePromptFromEditor(): Promise<void> {
  const name = (document.getElementById('promptEditorName') as HTMLInputElement).value.trim();
  const sys = (document.getElementById('promptEditorSystem') as HTMLTextAreaElement).value.trim();
  const tmpl = (document.getElementById('promptEditorTemplate') as HTMLTextAreaElement).value.trim();
  if (!name || !tmpl) return;

  await savePrompt({
    id: editingPromptId ?? undefined,
    name,
    systemInstruction: sys,
    userTemplate: tmpl,
    defaultProvider: '',
  });

  closePromptEditor();
  refreshPromptLibrary();
}

/* ─── Note Templates UI ─── */
function openNoteTemplates(): void {
  document.getElementById('noteTemplatesOverlay')!.style.display = '';
  refreshNoteTemplatesList();
}

function closeNoteTemplates(): void {
  document.getElementById('noteTemplatesOverlay')!.style.display = 'none';
}

async function refreshNoteTemplatesList(): Promise<void> {
  const list = document.getElementById('noteTemplatesList')!;
  list.innerHTML = '';
  const templates = await getAllNoteTemplates();
  for (const t of templates) {
    const card = document.createElement('div');
    card.style.cssText = 'padding:12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;text-align:center;transition:background .15s;';
    card.innerHTML = `<div style="font-size:24px;margin-bottom:4px;">${t.icon}</div><div style="font-size:12px;font-weight:500;">${escapeHtml(t.name)}</div>${!t.builtin ? '<div style="font-size:9px;color:var(--text3);margin-top:2px;">Custom</div>' : ''}`;
    card.addEventListener('mouseenter', () => { card.style.background = 'var(--bg3)'; });
    card.addEventListener('mouseleave', () => { card.style.background = ''; });
    card.addEventListener('click', () => createNoteFromTemplate(t));
    if (!t.builtin) {
      const del = document.createElement('button');
      del.className = 'btn btn-ghost btn-sm';
      del.style.cssText = 'font-size:9px;color:var(--red);position:absolute;top:2px;right:2px;';
      del.innerHTML = closeIconSvg(10);
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteNoteTemplate(t.id);
        refreshNoteTemplatesList();
      });
      card.style.position = 'relative';
      card.appendChild(del);
    }
    list.appendChild(card);
  }
}

async function createNoteFromTemplate(t: { name: string; content: string }): Promise<void> {
  closeNoteTemplates();
  const title = `${t.name} - ${new Date().toLocaleDateString()}`;
  const content = renderNoteTemplate({ id: '', name: t.name, icon: '', category: '', content: t.content, builtin: false }, title);
  const now = Date.now();
  const id = await db.notes.add({
    title,
    content,
    rawContent: content,
    markdownContent: content,
    markdownPromptSystem: DEFAULT_MARKDOWN_PROMPT_SYSTEM,
    markdownPromptTemplate: DEFAULT_MARKDOWN_PROMPT_TEMPLATE,
    markdownDirty: false,
    suggestedActions: [],
    lastRawSuggestionHash: null,
    tags: [],
    folderId: null,
    created: now,
    modified: now,
    syncStatus: 'local',
    revision: null,
    providerFileId: null,
    pinned: false,
  });
  await openNote(id as number);
}

/* ─── Note Template Editor ─── */
let _editingNoteTemplateId: string | null = null;

function openNoteTemplateEditor(): void {
  _editingNoteTemplateId = null;
  (document.getElementById('noteTemplateEditorName') as HTMLInputElement).value = '';
  (document.getElementById('noteTemplateEditorIcon') as HTMLInputElement).value = 'N';
  (document.getElementById('noteTemplateEditorCategory') as HTMLInputElement).value = '';
  (document.getElementById('noteTemplateEditorContent') as HTMLTextAreaElement).value = '';
  document.getElementById('noteTemplateEditorTitle')!.textContent = 'New Note Template';
  document.getElementById('noteTemplateEditorOverlay')!.style.display = '';
}

function closeNoteTemplateEditor(): void {
  document.getElementById('noteTemplateEditorOverlay')!.style.display = 'none';
}

async function saveNoteTemplateFromEditor(): Promise<void> {
  const name = (document.getElementById('noteTemplateEditorName') as HTMLInputElement).value.trim();
  const icon = (document.getElementById('noteTemplateEditorIcon') as HTMLInputElement).value.trim() || 'N';
  const category = (document.getElementById('noteTemplateEditorCategory') as HTMLInputElement).value.trim() || 'Custom';
  const content = (document.getElementById('noteTemplateEditorContent') as HTMLTextAreaElement).value;
  if (!name || !content) return;

  await saveNoteTemplate({ name, icon, category, content });
  closeNoteTemplateEditor();
  refreshNoteTemplatesList();
}

/* ─── Batch Execution ─── */
export async function batchExecutePrompt(noteIds: number[], promptName: string): Promise<void> {
  const builtin = BUILTIN_PROMPTS.find(p => p.name === promptName);
  if (!builtin) return;

  const { dispatchModule } = await ensureLLMRuntime();
  const { dispatchChat } = dispatchModule;

  for (const noteId of noteIds) {
    const note = await db.notes.get(noteId);
    if (!note) continue;
    const ctx: PromptContext = { selection: '', note: note.content.slice(0, 4000), title: note.title };
    const userText = interpolate(builtin.userTemplate, ctx);
    const sysMsg: ChatMessage = { role: 'system', content: builtin.systemInstruction || 'You are a helpful AI writing assistant.' };
    try {
      await dispatchChat([sysMsg, { role: 'user', content: userText }], () => {});
    } catch { /* skip failures */ }
  }
}

/* ─── Suppress unused variable warnings ─── */
void viewMode;
void _editingNoteTemplateId;

/* ─── Boot ─── */
/* ─── Login Screen ─── */

function renderLoginScreen(offlineNoSession = false): void {
  const app = document.getElementById('app')!;
  const googleButtonMarkup = `
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
    <span>Continue with Google</span>
  `;
  app.innerHTML = `
    <div class="auth-screen${PASSKEY_UI_ENABLED ? '' : ' auth-screen--simple'}">
      ${PASSKEY_UI_ENABLED ? `
      <div class="auth-toolbar" role="presentation">
        <button class="auth-toolbar-btn" type="button" aria-label="Toggle RTL" title="Toggle RTL (coming soon)">
          <span aria-hidden="true">RTL</span>
        </button>
        <button class="auth-toolbar-btn" type="button" aria-label="Change language" title="Language selector (coming soon)">
          <span aria-hidden="true">English (US)</span>
        </button>
        <button class="auth-toolbar-btn" type="button" aria-label="Toggle theme" title="Theme switcher (coming soon)">
          <span aria-hidden="true">Theme</span>
        </button>
      </div>
      ` : ''}
      <main class="auth-main" role="main">
      <div class="auth-card">
        <div class="auth-logo auth-logo-centered">
          <div class="auth-logo-mark">Z</div>
          <span class="auth-logo-text">Zed Notetaker</span>
        </div>
        <div class="auth-copy">
          <h1 class="auth-title">Welcome to Zed Notetaker</h1>
          <p class="auth-tagline">${offlineNoSession
    ? 'You need an internet connection to sign in.'
    : PASSKEY_UI_ENABLED
      ? 'Sign in to access your secure workspace.'
      : 'Sign in once with Google. Your notes stay on this device and sync when you are online.'}</p>
        </div>
        ${offlineNoSession ? `
          <div class="auth-offline-notice">
            <span class="auth-offline-icon" aria-hidden="true">!</span>
            <span>You're offline. Connect to the internet and sign in at least once. After that, you can use your notes offline.</span>
          </div>
        ` : `
          ${PASSKEY_UI_ENABLED ? `
          <div class="auth-primary-action" id="passkeyLoginContainer" style="display:none;">
            <button class="auth-passkey-btn" id="btnPasskeySignIn" type="button" title="Sign in with your device passkey">
              <span class="auth-passkey-icon" aria-hidden="true">*</span>
              <span class="auth-passkey-copy">
                <strong>Sign in with Passkey</strong>
                <small>Biometric or device lock</small>
              </span>
              <span class="auth-passkey-arrow" aria-hidden="true">&gt;</span>
            </button>
            <div class="auth-passkey-msg" id="authPasskeyMsg"></div>
          </div>

          <div class="auth-divider" aria-hidden="true">
            <span></span>
            <em>or continue with</em>
            <span></span>
          </div>
          ` : ''}
          <button class="auth-google-btn" id="btnGoogleSignIn" type="button">
            ${googleButtonMarkup}
          </button>
          <p class="auth-disclaimer">${PASSKEY_UI_ENABLED
    ? 'Your notes are stored locally on this device first, then synced through your Google account via Firestore. Zed Notetaker keeps the app usable offline and syncs when your connection returns.'
    : 'Notes are saved on this device and synced with Google (Firestore) when connected. We never see your Google password.'}</p>
        `}
      </div>
      </main>
    </div>
  `;

  document.getElementById('btnGoogleSignIn')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnGoogleSignIn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span>Signing in...</span>'; }
    try {
      await signInWithGoogle();
      // onAuthStateChanged will fire and call bootApp()
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = googleButtonMarkup;
      }
      console.error('Sign-in failed:', err);
    }
  });

  if (PASSKEY_UI_ENABLED) {
    const passkeyBtn = document.getElementById('btnPasskeySignIn') as HTMLButtonElement | null;
    const passkeyContainer = document.getElementById('passkeyLoginContainer') as HTMLElement | null;
    const passkeyMsg = document.getElementById('authPasskeyMsg') as HTMLElement | null;

    if (passkeyBtn && passkeyContainer) {
      void (async () => {
        const authPasskeyModule = await getAuthPasskeyModule();
        const supported = await authPasskeyModule.canUsePasskeySignIn().catch(() => false);
        if (!supported) {
          passkeyContainer.style.display = 'none';
          return;
        }

        passkeyContainer.style.display = 'grid';
        if (passkeyMsg) {
          passkeyMsg.textContent = 'Use a passkey to sign in without entering a password.';
        }

        passkeyBtn.addEventListener('click', async () => {
          passkeyBtn.disabled = true;
          const googleBtn = document.getElementById('btnGoogleSignIn') as HTMLButtonElement | null;
          if (googleBtn) googleBtn.disabled = true;
          if (passkeyMsg) passkeyMsg.textContent = 'Waiting for passkey confirmation...';

          try {
            const customToken = await authPasskeyModule.signInWithPasskeyFlow();
            await signInWithAuthToken(customToken);
          } catch (error) {
            if (passkeyMsg) {
              passkeyMsg.textContent = error instanceof Error ? error.message : 'Passkey sign-in failed';
            }
            passkeyBtn.disabled = false;
            if (googleBtn) googleBtn.disabled = false;
          }
        });
      })();
    }
  }
}

function renderUserBadge(user: User): void {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;
  // Remove existing badge if present
  actions.querySelector('.auth-user-badge')?.remove();

  const badge = document.createElement('div');
  badge.className = 'auth-user-badge';
  badge.innerHTML = `
    ${user.photoURL ? `<img src="${user.photoURL}" alt="${user.displayName ?? 'User'}" class="auth-user-avatar" referrerpolicy="no-referrer" />` : `<span class="auth-user-initials">${(user.displayName ?? 'U')[0].toUpperCase()}</span>`}
    <button class="btn btn-ghost btn-sm auth-signout-btn" id="btnSignOut" type="button" title="Sign out (${user.email ?? ''})" aria-label="Sign out"><span class="auth-signout-label">Sign out</span></button>
  `;
  actions.appendChild(badge);

  document.getElementById('btnSignOut')?.addEventListener('click', async () => {
    if (!confirm('Sign out of Zed Note? This will clear cached local notes for this account on this browser.')) return;

    if (firestoreUnsubscribe) {
      firestoreUnsubscribe();
      firestoreUnsubscribe = null;
    }

    // Clear local user-scoped DB for strict account isolation.
    try {
      await getDb().delete();
    } catch {
      // best effort
    }

    // Clear runtime references
    currentUserUid = null;
    currentNote = null;
    editor = null;

    await signOut();
    // Keep onAuthStateChanged subscribed so the handler runs with user === null and shows the login screen.
  });
}

/* ─── Boot with auth ─── */

async function bootApp(user: User): Promise<void> {
  // Initialise the UID-scoped database before anything else accesses it
  initDb(user.uid);

  if (localStorage.getItem('e2e-mode') === 'true') {
    await setSetting('onboarded', 'true');
  }

  await init();

  // Render user badge immediately so UI is fully usable
  renderUserBadge(user);

  // Start Firestore realtime sync — non-fatal: app works offline if this fails
  try {
    await initFirestoreRealtimeSync(user.uid);
  } catch (err) {
    console.warn('Firestore realtime sync failed to start:', err);
  }
}

/* ─── Entry point ─── */

(async () => {
  // Initialise Firebase SDK
  initFirebase();

  // Optional test bypass for deterministic E2E flows in CI/local automation.
  if (localStorage.getItem('e2e-bypass-auth') === '1') {
    const mockUser = {
      uid: localStorage.getItem('e2e-user-id') || 'e2e-user',
      displayName: 'E2E User',
      email: 'e2e@example.com',
      photoURL: null,
    } as User;
    await bootApp(mockUser);
    return;
  }

  // Handle OAuth redirect result (mobile fallback from signInWithRedirect)
  await handleRedirectResult();

  // Show a loading indicator while Firebase resolves auth state from cache
  const app = document.getElementById('app')!;
  app.innerHTML = '<div class="auth-loading"><div class="auth-spinner"></div></div>';

  // Subscribe to auth state — this fires immediately with cached state (no network needed)
  onAuthStateChanged(async (user) => {
    if (user) {
      // Authenticated (online or offline via cached token)
      await bootApp(user);
    } else {
      // Not authenticated: tear down realtime listeners and clear runtime user state.
      if (firestoreUnsubscribe) {
        firestoreUnsubscribe();
        firestoreUnsubscribe = null;
      }
      currentUserUid = null;

      if (isOffline()) {
        // Offline and no cached session — strict security: cannot load app
        renderLoginScreen(true);
      } else {
        // Online but not signed in — show login
        renderLoginScreen(false);
      }
    }
  });
})();
