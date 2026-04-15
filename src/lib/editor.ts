import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, highlightSpecialChars, ViewPlugin, type ViewUpdate, Decoration, type DecorationSet, MatchDecorator } from '@codemirror/view';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, acceptCompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { BUILTIN_SNIPPETS, type SnippetDef } from './snippets';

const DARK_THEMES = new Set(['dark', 'nord', 'dracula', 'solarized-dark', 'monokai']);

function usesDarkCodeTheme(): boolean {
  const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  return DARK_THEMES.has(activeTheme);
}

function getCodeThemeExtension(): Extension {
  return usesDarkCodeTheme() ? oneDark : [];
}

/* ─── URL decorator: underline URLs in editor ─── */
const urlRegex = /https?:\/\/[^\s<>"\])]+/g;

const urlDecorator = new MatchDecorator({
  regexp: urlRegex,
  decoration: () => Decoration.mark({ class: 'cm-url-link' }),
});

const urlHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = urlDecorator.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = urlDecorator.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

/* ─── Snippet completions (/ trigger) ─── */
function snippetCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // Only trigger at start of line with /
  const match = textBefore.match(/^\/(\w*)$/);
  if (!match) return null;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const options = BUILTIN_SNIPPETS.map((s: SnippetDef) => ({
    label: s.trigger,
    displayLabel: `${s.trigger}  ${s.title}`,
    detail: s.category,
    apply: (_view: EditorView, _completion: unknown, _from: number, to: number) => {
      const body = s.body.replace(/\{\{date\}\}/g, dateStr).replace(/\{\{time\}\}/g, now.toTimeString().slice(0, 5));
      _view.dispatch({
        changes: { from: line.from, to },
        selection: { anchor: line.from + body.length },
      });
      // Insert after dispatch to avoid conflict
      _view.dispatch({
        changes: { from: line.from, insert: body },
      });
    },
    type: 'text',
  }));

  return {
    from: line.from,
    options,
    filter: true,
  };
}

/* ─── Editor creation ─── */
export interface EditorOptions {
  parent: HTMLElement;
  content?: string;
  onChange?: (content: string) => void;
  onCursorChange?: (line: number, col: number) => void;
}

export function createEditor(opts: EditorOptions): EditorView {
  const codeThemeCompartment = new Compartment();

  const updateListener = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (update.docChanged && opts.onChange) {
          opts.onChange(update.state.doc.toString());
        }
        if ((update.selectionSet || update.docChanged) && opts.onCursorChange) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          opts.onCursorChange(line.number, pos - line.from + 1);
        }
      }
    },
  );

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    highlightSelectionMatches(),
    drawSelection(),
    rectangularSelection(),
    bracketMatching(),
    history(),
    EditorState.allowMultipleSelections.of(true),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    codeThemeCompartment.of(getCodeThemeExtension()),
    autocompletion({
      override: [snippetCompletions],
      activateOnTyping: true,
    }),
    keymap.of([
      {
        key: 'Tab',
        run: acceptCompletion,
      },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    urlHighlightPlugin,
    updateListener,
    EditorView.lineWrapping,
    // Performance: this is default CM6 behavior — viewport-only rendering
    // No extra config needed; CM6 only renders visible lines
  ];

  const state = EditorState.create({
    doc: opts.content || '',
    extensions,
  });

  const view = new EditorView({ state, parent: opts.parent });

  const themeObserver = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.attributeName === 'data-theme')) return;
    view.dispatch({
      effects: codeThemeCompartment.reconfigure(getCodeThemeExtension()),
    });
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  const originalDestroy = view.destroy.bind(view);
  view.destroy = () => {
    themeObserver.disconnect();
    originalDestroy();
  };

  return view;
}

/* ─── Editor commands for toolbar ─── */
export function wrapSelection(view: EditorView, before: string, after: string): void {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: to + before.length },
  });
  view.focus();
}

export function insertAtCursor(view: EditorView, text: string): void {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

export function insertLinePrefix(view: EditorView, prefix: string): void {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  view.dispatch({
    changes: { from: line.from, to: line.from, insert: prefix },
  });
  view.focus();
}

export function getSelectedText(view: EditorView): string {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
}

export function replaceContent(view: EditorView, content: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}
