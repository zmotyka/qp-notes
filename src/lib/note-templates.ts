/* ═══════════════════════════════════════════════════════════
   Note Templates — Built-in + user-created note scaffolds
   ═══════════════════════════════════════════════════════════ */

import { getSetting, setSetting } from './db';

/* ─── Types ─── */

export interface NoteTemplate {
  id: string;
  name: string;
  icon: string;
  category: string;
  content: string;
  builtin: boolean;
}

/* ─── Built-in Templates ─── */

const BUILTIN_TEMPLATES: NoteTemplate[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    icon: '📋',
    category: 'Work',
    builtin: true,
    content: `# Meeting Notes — {{date}}

## Attendees
- 

## Agenda
1. 

## Discussion


## Action Items
- [ ] 

## Next Steps

`,
  },
  {
    id: 'daily-journal',
    name: 'Daily Journal',
    icon: '📔',
    category: 'Personal',
    builtin: true,
    content: `# Journal — {{date}}

## Today I'm grateful for
- 

## What happened today


## What I learned


## Tomorrow I want to

`,
  },
  {
    id: 'project-plan',
    name: 'Project Plan',
    icon: '🎯',
    category: 'Work',
    builtin: true,
    content: `# Project: {{title}}

## Overview


## Goals
- [ ] 

## Timeline
| Phase | Date | Status |
|-------|------|--------|
|       |      |        |

## Resources


## Risks & Mitigations

`,
  },
  {
    id: 'blog-post',
    name: 'Blog Post',
    icon: '✍️',
    category: 'Writing',
    builtin: true,
    content: `# {{title}}

> *Brief description or hook*

## Introduction


## Main Content


## Key Takeaways
- 

## Conclusion


---
*Tags: *
`,
  },
  {
    id: 'study-notes',
    name: 'Study Notes',
    icon: '📚',
    category: 'Learning',
    builtin: true,
    content: `# {{title}}

## Key Concepts
- **Term**: Definition

## Summary


## Important Formulas / Rules


## Examples


## Questions
- 

## References
- 
`,
  },
  {
    id: 'weekly-review',
    name: 'Weekly Review',
    icon: '📊',
    category: 'Personal',
    builtin: true,
    content: `# Weekly Review — {{date}}

## Accomplishments
- 

## Challenges


## Metrics
| Goal | Target | Actual |
|------|--------|--------|
|      |        |        |

## Lessons Learned


## Next Week Priorities
1. 

`,
  },
];

/* ─── Template variables ─── */

function interpolateTemplate(content: string, title: string): string {
  const now = new Date();
  return content
    .replace(/\{\{date\}\}/g, now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
    .replace(/\{\{title\}\}/g, title || 'Untitled');
}

/* ─── CRUD ─── */

const USER_TEMPLATES_KEY = 'note-templates';

async function loadUserTemplates(): Promise<NoteTemplate[]> {
  const raw = await getSetting(USER_TEMPLATES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveUserTemplates(templates: NoteTemplate[]): Promise<void> {
  await setSetting(USER_TEMPLATES_KEY, JSON.stringify(templates));
}

export async function getAllNoteTemplates(): Promise<NoteTemplate[]> {
  const user = await loadUserTemplates();
  return [...BUILTIN_TEMPLATES, ...user];
}

export async function saveNoteTemplate(tpl: Omit<NoteTemplate, 'id' | 'builtin'>): Promise<NoteTemplate> {
  const templates = await loadUserTemplates();
  const newTpl: NoteTemplate = {
    ...tpl,
    id: `user-${Date.now()}`,
    builtin: false,
  };
  templates.push(newTpl);
  await saveUserTemplates(templates);
  return newTpl;
}

export async function updateNoteTemplate(id: string, updates: Partial<Omit<NoteTemplate, 'id' | 'builtin'>>): Promise<void> {
  const templates = await loadUserTemplates();
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) throw new Error('Template not found');
  templates[idx] = { ...templates[idx], ...updates };
  await saveUserTemplates(templates);
}

export async function deleteNoteTemplate(id: string): Promise<void> {
  const templates = await loadUserTemplates();
  await saveUserTemplates(templates.filter(t => t.id !== id));
}

/** Get template content with variables interpolated. */
export function renderNoteTemplate(template: NoteTemplate, title: string): string {
  return interpolateTemplate(template.content, title);
}
