/* ═══════════════════════════════════════════════════════════
   Version History — Per-note revision snapshots + diff
   ═══════════════════════════════════════════════════════════ */

import { db } from './db';

const MAX_REVISIONS = 20;
const HISTORY_TABLE_KEY_PREFIX = 'history:';

export interface Revision {
  timestamp: number;
  content: string;
  wordCount: number;
}

/* ─── Storage (uses settings table with key prefixes) ─── */

async function getHistoryKey(noteId: number): Promise<string> {
  return `${HISTORY_TABLE_KEY_PREFIX}${noteId}`;
}

export async function getRevisions(noteId: number): Promise<Revision[]> {
  const key = await getHistoryKey(noteId);
  const row = await db.settings.where('key').equals(key).first();
  if (!row) return [];
  try {
    return JSON.parse(row.value) as Revision[];
  } catch {
    return [];
  }
}

export async function saveRevision(noteId: number, content: string): Promise<void> {
  const revisions = await getRevisions(noteId);

  // Avoid duplicate if content hasn't changed
  if (revisions.length && revisions[revisions.length - 1].content === content) {
    return;
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  revisions.push({ timestamp: Date.now(), content, wordCount });

  // Trim to last N revisions
  while (revisions.length > MAX_REVISIONS) {
    revisions.shift();
  }

  const key = await getHistoryKey(noteId);
  const existing = await db.settings.where('key').equals(key).first();
  const value = JSON.stringify(revisions);
  if (existing) {
    await db.settings.update(existing.id!, { value });
  } else {
    await db.settings.add({ key, value });
  }
}

export async function deleteHistory(noteId: number): Promise<void> {
  const key = await getHistoryKey(noteId);
  const existing = await db.settings.where('key').equals(key).first();
  if (existing) await db.settings.delete(existing.id!);
}

/* ─── Diff Engine (line-by-line) ─── */

export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  content: string;
  lineOld?: number;
  lineNew?: number;
}

/**
 * Simple LCS-based line diff between two texts.
 * Good enough for markdown note comparison without heavy deps.
 */
export function diffTexts(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  let i = m, j = n;
  const diffStack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffStack.push({ type: 'same', content: oldLines[i - 1], lineOld: i, lineNew: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffStack.push({ type: 'add', content: newLines[j - 1], lineNew: j });
      j--;
    } else {
      diffStack.push({ type: 'remove', content: oldLines[i - 1], lineOld: i });
      i--;
    }
  }

  // Reverse to get correct order
  for (let k = diffStack.length - 1; k >= 0; k--) {
    result.push(diffStack[k]);
  }

  return result;
}

/**
 * Renders a diff to HTML for display in the UI.
 */
export function renderDiffHTML(diff: DiffLine[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = diff.map(d => {
    switch (d.type) {
      case 'add':
        return `<div class="diff-line diff-add">+ ${esc(d.content)}</div>`;
      case 'remove':
        return `<div class="diff-line diff-remove">- ${esc(d.content)}</div>`;
      default:
        return `<div class="diff-line diff-same">  ${esc(d.content)}</div>`;
    }
  });
  return `<div class="diff-viewer">${lines.join('\n')}</div>`;
}
