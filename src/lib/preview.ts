import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import katex from 'katex';
import mermaid from 'mermaid';

/* eslint-disable @typescript-eslint/no-explicit-any */
type MdRuleRenderer = (tokens: any[], idx: number, options: any, env: any, self: any) => string;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ─── Configure markdown-it ─── */
const md: MarkdownIt = new MarkdownIt({
  html: false,        // Disable raw HTML for security
  linkify: true,      // Auto-detect URLs
  typographer: true,  // Smart quotes
  breaks: true,       // \n → <br>
  highlight: (str: string, lang: string): string => {
    if (lang === 'mermaid') {
      // Mermaid blocks handled separately
      return `<div class="mermaid-placeholder" data-mermaid="${encodeURIComponent(str)}"></div>`;
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
      } catch { /* fall through */ }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
});

/* ─── KaTeX inline/block math ─── */
// Inline: $...$
md.renderer.rules.text = (tokens: any[], idx: number) => {
  let content: string = tokens[idx].content;
  // Block math: $$...$$
  content = content.replace(/\$\$([^$]+)\$\$/g, (_match: string, math: string) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch { return `<span class="katex-error">${md.utils.escapeHtml(math)}</span>`; }
  });
  // Inline math: $...$
  content = content.replace(/\$([^$\n]+)\$/g, (_match: string, math: string) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch { return `<span class="katex-error">${md.utils.escapeHtml(math)}</span>`; }
  });
  return content;
};

/* ─── Wiki-links: [[note title]] ─── */
md.renderer.rules.text = ((origRule: MdRuleRenderer) => {
  return (tokens: any[], idx: number, options: any, env: any, self: any): string => {
    let content = origRule(tokens, idx, options, env, self);
    content = content.replace(/\[\[([^\]]+)\]\]/g, (_match: string, title: string) => {
      const escaped = md.utils.escapeHtml(title.trim());
      return `<a href="#" class="wiki-link" data-note="${escaped}">${escaped}</a>`;
    });
    return content;
  };
})(md.renderer.rules.text! as MdRuleRenderer);

/* ─── Task list checkboxes ─── */
md.renderer.rules.list_item_open = (tokens: any[], idx: number): string => {
  const content = tokens[idx + 2]?.content || '';
  if (content.startsWith('[ ] ') || content.startsWith('[x] ') || content.startsWith('[X] ')) {
    const checked = content.startsWith('[x] ') || content.startsWith('[X] ');
    return `<li class="task-list-item"><input type="checkbox" disabled ${checked ? 'checked' : ''}>`;
  }
  return '<li>';
};

/* ─── Make external links open in new tab ─── */
const defaultLinkOpen: MdRuleRenderer = (md.renderer.rules.link_open as MdRuleRenderer) || ((tokens: any[], idx: number, options: any, _env: any, self: any): string => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens: any[], idx: number, options: any, env: any, self: any): string => {
  const href = tokens[idx].attrGet('href');
  if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/* ─── Initialize mermaid ─── */
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
  fontFamily: 'DM Sans, sans-serif',
});

/* ─── Render pipeline ─── */
let renderCounter = 0;

export async function renderMarkdown(content: string, container: HTMLElement): Promise<void> {
  const thisRender = ++renderCounter;

  // Render markdown to HTML
  const html = md.render(content);
  container.innerHTML = html;

  // Render mermaid diagrams (lazy — only visible ones)
  const mermaidPlaceholders = container.querySelectorAll<HTMLElement>('.mermaid-placeholder');
  for (const el of mermaidPlaceholders) {
    if (thisRender !== renderCounter) return; // stale render, abort

    const source = decodeURIComponent(el.dataset.mermaid || '');
    if (!source.trim()) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-container';
    try {
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { svg } = await mermaid.render(id, source);
      wrapper.innerHTML = svg;
    } catch (e) {
      wrapper.innerHTML = `<pre class="mermaid-error" style="color:var(--red);font-size:12px;">Mermaid error: ${(e as Error).message || 'Invalid diagram'}</pre>`;
    }
    el.replaceWith(wrapper);
  }
}

/** Lightweight text-only render for search indexing */
export function renderToPlainText(markdownContent: string): string {
  return markdownContent
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/#+\s/g, '')
    .replace(/[*_~]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
