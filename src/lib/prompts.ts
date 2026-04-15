/* ═══════════════════════════════════════════════════════════
   Prompt Templates — Built-in + custom AI prompt library
   ═══════════════════════════════════════════════════════════ */

import { db, type PromptTemplate } from './db';

/* ─── Built-in templates ─── */

export interface BuiltinPrompt {
  name: string;
  category: 'writing' | 'analysis' | 'transform' | 'translate';
  icon: string;
  systemInstruction: string;
  userTemplate: string;
}

export const BUILTIN_PROMPTS: BuiltinPrompt[] = [
  {
    name: 'Summarize',
    category: 'analysis',
    icon: '📝',
    systemInstruction: 'You are a concise summarizer. Extract key points and present them clearly.',
    userTemplate: 'Summarize the following text:\n\n{{content}}',
  },
  {
    name: 'Expand',
    category: 'writing',
    icon: '✨',
    systemInstruction: 'You are a writing assistant. Expand the given text with more detail, examples, and depth while keeping the original meaning and tone.',
    userTemplate: 'Expand on the following text with more detail and examples:\n\n{{content}}',
  },
  {
    name: 'Fix Grammar',
    category: 'transform',
    icon: '🔤',
    systemInstruction: 'You are a proofreader. Fix grammar, spelling, and punctuation. Return only the corrected text without explanations.',
    userTemplate: 'Fix grammar and spelling in this text:\n\n{{content}}',
  },
  {
    name: 'Simplify',
    category: 'transform',
    icon: '💡',
    systemInstruction: 'You are a writing assistant. Rewrite text in simpler, clearer language while preserving the meaning.',
    userTemplate: 'Rewrite this text in simpler, clearer language:\n\n{{content}}',
  },
  {
    name: 'Explain',
    category: 'analysis',
    icon: '🔍',
    systemInstruction: 'You are a helpful explainer. Break down complex concepts into understandable explanations.',
    userTemplate: 'Explain the following in simple terms:\n\n{{content}}',
  },
  {
    name: 'Translate to Spanish',
    category: 'translate',
    icon: '🇪🇸',
    systemInstruction: 'You are a professional translator. Translate accurately while preserving tone and meaning.',
    userTemplate: 'Translate the following to Spanish:\n\n{{content}}',
  },
  {
    name: 'Translate to French',
    category: 'translate',
    icon: '🇫🇷',
    systemInstruction: 'You are a professional translator. Translate accurately while preserving tone and meaning.',
    userTemplate: 'Translate the following to French:\n\n{{content}}',
  },
  {
    name: 'Translate to German',
    category: 'translate',
    icon: '🇩🇪',
    systemInstruction: 'You are a professional translator. Translate accurately while preserving tone and meaning.',
    userTemplate: 'Translate the following to German:\n\n{{content}}',
  },
  {
    name: 'Key Points',
    category: 'analysis',
    icon: '📌',
    systemInstruction: 'You extract key points from text and present them as a clear bullet list.',
    userTemplate: 'Extract the key points from this text as a bullet list:\n\n{{content}}',
  },
  {
    name: 'Action Items',
    category: 'analysis',
    icon: '✅',
    systemInstruction: 'You identify actionable tasks from text and present them as a checklist.',
    userTemplate: 'Identify all action items and tasks from this text as a checklist:\n\n{{content}}',
  },
  {
    name: 'Make Professional',
    category: 'transform',
    icon: '👔',
    systemInstruction: 'You are a professional writing assistant. Rewrite text in a formal, professional tone.',
    userTemplate: 'Rewrite this in a professional, formal tone:\n\n{{content}}',
  },
  {
    name: 'Make Casual',
    category: 'transform',
    icon: '😊',
    systemInstruction: 'You are a writing assistant. Rewrite text in a casual, friendly tone.',
    userTemplate: 'Rewrite this in a casual, friendly tone:\n\n{{content}}',
  },
];

/* ─── Variable interpolation ─── */

export interface PromptContext {
  selection: string;
  note: string;
  title: string;
}

/**
 * Replace {{selection}}, {{note}}, {{title}}, and {{content}} in a template.
 * {{content}} resolves to selection if non-empty, else full note.
 */
export function interpolate(template: string, ctx: PromptContext): string {
  const content = ctx.selection || ctx.note;
  return template
    .replace(/\{\{selection\}\}/g, ctx.selection)
    .replace(/\{\{note\}\}/g, ctx.note)
    .replace(/\{\{title\}\}/g, ctx.title)
    .replace(/\{\{content\}\}/g, content);
}

/* ─── Prompt CRUD (custom user prompts stored in DB) ─── */

export async function getAllPrompts(): Promise<PromptTemplate[]> {
  return db.prompts.toArray();
}

export async function savePrompt(prompt: Omit<PromptTemplate, 'id' | 'created' | 'modified'> & { id?: number }): Promise<number> {
  const now = Date.now();
  if (prompt.id) {
    await db.prompts.update(prompt.id, { ...prompt, modified: now });
    return prompt.id;
  }
  return db.prompts.add({ ...prompt, id: undefined, created: now, modified: now } as PromptTemplate) as Promise<number>;
}

export async function deletePrompt(id: number): Promise<void> {
  await db.prompts.delete(id);
}

export async function exportPrompts(): Promise<string> {
  const prompts = await getAllPrompts();
  return JSON.stringify(prompts, null, 2);
}

export async function importPrompts(json: string): Promise<number> {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Invalid prompt library format');
  let count = 0;
  for (const p of parsed) {
    if (p.name && p.userTemplate) {
      await db.prompts.add({
        name: p.name,
        systemInstruction: p.systemInstruction || '',
        userTemplate: p.userTemplate,
        defaultProvider: p.defaultProvider || '',
        created: p.created || Date.now(),
        modified: Date.now(),
      });
      count++;
    }
  }
  return count;
}
