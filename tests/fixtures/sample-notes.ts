export const sampleNotes = [
  {
    title: 'Welcome Note',
    tags: ['welcome', 'docs'],
    content: '# Welcome\n\nThis is **bold** and _italic_.\n\n- [ ] todo\n- [x] done\n',
  },
  {
    title: 'Math + Diagram',
    tags: ['math', 'diagram'],
    content: '## Equations\n\n$$E=mc^2$$\n\n```mermaid\nflowchart TD\nA-->B\n```',
  },
  {
    title: 'Code Snippet',
    tags: ['code'],
    content: '```ts\nconst n = 42;\n```\n\n[docs](https://example.com)',
  },
  {
    title: 'Linked Note',
    tags: ['links'],
    content: 'See [[Welcome Note]] for context.',
  },
  {
    title: 'Table Note',
    tags: ['table'],
    content: '| A | B |\n|---|---|\n| 1 | 2 |',
  },
] as const;
