/* ─── Tips data and rotation logic ─── */

export interface Tip {
  id: string;
  text: string;
  category: 'editor' | 'ai' | 'search' | 'markdown' | 'mermaid' | 'snippets' | 'shortcuts';
}

export const TIPS: Tip[] = [
  // Editor
  { id: 'e1', text: 'Press <strong>Ctrl+S</strong> to save your note instantly', category: 'shortcuts' },
  { id: 'e2', text: 'Use <strong>Ctrl+P</strong> to quickly switch between notes', category: 'shortcuts' },
  { id: 'e3', text: 'Press <strong>Ctrl+N</strong> to create a new note', category: 'shortcuts' },
  { id: 'e4', text: '<strong>Ctrl+B</strong> for bold, <strong>Ctrl+I</strong> for italic', category: 'shortcuts' },
  { id: 'e5', text: 'Press <strong>Ctrl+K</strong> to insert a hyperlink', category: 'shortcuts' },
  { id: 'e6', text: 'Use <strong>Ctrl+Shift+P</strong> to open the command palette', category: 'shortcuts' },

  // Markdown
  { id: 'm1', text: 'Type <strong>## Heading</strong> for a section title — supports H1 through H6', category: 'markdown' },
  { id: 'm2', text: 'Use <strong>- [ ]</strong> for task lists with checkboxes', category: 'markdown' },
  { id: 'm3', text: 'Wrap text in <strong>$$...$$</strong> for LaTeX math equations', category: 'markdown' },
  { id: 'm4', text: 'Create tables with <strong>| col1 | col2 |</strong> pipe syntax', category: 'markdown' },
  { id: 'm5', text: 'Use <strong>> quote</strong> for blockquotes', category: 'markdown' },
  { id: 'm6', text: 'Link to other notes with <strong>[[note title]]</strong> syntax', category: 'markdown' },

  // Mermaid
  { id: 'd1', text: 'Type <strong>```mermaid</strong> to start a diagram — try flowchart, sequence, or mindmap', category: 'mermaid' },
  { id: 'd2', text: 'Mermaid supports <strong>flowchart</strong>, <strong>sequence</strong>, <strong>gantt</strong>, <strong>state</strong>, <strong>ER</strong>, <strong>pie</strong>, and <strong>class</strong> diagrams', category: 'mermaid' },
  { id: 'd3', text: 'Use the <strong>/mindmap</strong> snippet to quickly scaffold a mind map', category: 'mermaid' },

  // Snippets
  { id: 's1', text: 'Type <strong>/</strong> at the start of a line to see all available snippets', category: 'snippets' },
  { id: 's2', text: 'Try <strong>/agenda</strong> for a meeting agenda template', category: 'snippets' },
  { id: 's3', text: 'Use <strong>/flowchart</strong> to insert a Mermaid diagram scaffold', category: 'snippets' },
  { id: 's4', text: 'Create your own snippets in <strong>Settings → Snippets</strong>', category: 'snippets' },

  // AI
  { id: 'a1', text: 'Select text and press <strong>Ask AI</strong> to analyze with the local LLM', category: 'ai' },
  { id: 'a2', text: 'Use <strong>{{selection}}</strong> in prompts to inject selected text', category: 'ai' },
  { id: 'a3', text: 'Your local LLM runs entirely in-browser — no data leaves your device', category: 'ai' },
  { id: 'a4', text: 'Create reusable prompts in <strong>Settings → Prompt Templates</strong>', category: 'ai' },

  // Search
  { id: 'r1', text: 'Search with <strong>tag:meeting date:2026-03</strong> for precise filtering', category: 'search' },
  { id: 'r2', text: 'Press <strong>Ctrl+P</strong> for fuzzy file-name search', category: 'search' },
  { id: 'r3', text: 'Click a tag in the sidebar to filter notes by that tag', category: 'search' },
  { id: 'r4', text: '<strong>Star</strong> important notes to pin them to the top of the list', category: 'search' },
];

let currentIndex = 0;
let dismissed: Set<string> = new Set();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function initTips(renderFn: (tip: Tip) => void): void {
  // Load dismissed tips from localStorage (lightweight, no DB needed)
  try {
    const raw = localStorage.getItem('qp-dismissed-tips');
    if (raw) dismissed = new Set(JSON.parse(raw));
  } catch { /* ignore */ }

  const available = TIPS.filter(t => !dismissed.has(t.id));
  if (available.length === 0) return;

  currentIndex = 0;
  renderFn(available[currentIndex]);

  intervalId = setInterval(() => {
    const avail = TIPS.filter(t => !dismissed.has(t.id));
    if (avail.length === 0) {
      if (intervalId) clearInterval(intervalId);
      return;
    }
    currentIndex = (currentIndex + 1) % avail.length;
    renderFn(avail[currentIndex]);
  }, 30_000);
}

export function dismissTip(tipId: string): void {
  dismissed.add(tipId);
  localStorage.setItem('qp-dismissed-tips', JSON.stringify([...dismissed]));
}

export function resetTips(): void {
  dismissed.clear();
  localStorage.removeItem('qp-dismissed-tips');
  currentIndex = 0;
}

export function stopTips(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

export function getAvailableTips(): Tip[] {
  return TIPS.filter(t => !dismissed.has(t.id));
}
