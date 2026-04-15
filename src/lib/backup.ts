/* ═══════════════════════════════════════════════════════════
   Backup — ZIP export / import for all notes & folders
   ═══════════════════════════════════════════════════════════ */

import JSZip from 'jszip';
import { db, type Note, type Folder } from './db';

interface BackupMetadata {
  version: 1;
  exportedAt: string;
  noteCount: number;
  folderCount: number;
  scope: string;
}


export interface ExportOptions {
  scope?: 'all' | 'pinned';
}

interface NoteMetadata {
  id: number;
  title: string;
  tags: string[];
  folderId: number | null;
  created: number;
  modified: number;
  pinned: boolean;
}

/* ─── Export ─── */

export async function exportToZip(options: ExportOptions = {}): Promise<Blob> {
  const zip = new JSZip();
  let notes = await db.notes.toArray();
  const folders = await db.folders.toArray();

  // Build folder paths map
  const folderMap = new Map<number, Folder>();
  for (const f of folders) {
    folderMap.set(f.id!, f);
  }

  function getFolderPath(folderId: number | null): string {
    if (!folderId) return '';
    const parts: string[] = [];
    let current = folderId;
    const visited = new Set<number>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const f = folderMap.get(current);
      if (!f) break;
      parts.unshift(sanitizeName(f.name));
      current = f.parentId!;
    }
    return parts.join('/');
  }

  // Add notes as .md files with front matter
  const notesMeta: NoteMetadata[] = [];
  const usedPaths = new Set<string>();

  if (options.scope === 'pinned') notes = notes.filter(n => n.pinned);

  for (const note of notes) {
    const folderPath = getFolderPath(note.folderId);
    let filename = sanitizeName(note.title || 'Untitled') + '.md';

    // Deduplicate filenames within same folder
    let fullPath = folderPath ? `${folderPath}/${filename}` : filename;
    let counter = 1;
    while (usedPaths.has(fullPath)) {
      filename = `${sanitizeName(note.title || 'Untitled')}_${counter}.md`;
      fullPath = folderPath ? `${folderPath}/${filename}` : filename;
      counter++;
    }
    usedPaths.add(fullPath);

    // Build markdown with front matter
    const content = serializeFrontMatter(note);
    zip.file(`notes/${fullPath}`, content);

    notesMeta.push({
      id: note.id!,
      title: note.title,
      tags: note.tags,
      folderId: note.folderId,
      created: note.created,
      modified: note.modified,
      pinned: note.pinned,
    });
  }

  // Add metadata
  const meta: BackupMetadata = {
    version: 1,
    exportedAt: new Date().toISOString(),
    noteCount: notes.length,
    folderCount: folders.length,
    scope: options.scope ?? 'all',
  };
  zip.file('metadata.json', JSON.stringify(meta, null, 2));

  // Add folders list for reconstruction
  zip.file('folders.json', JSON.stringify(
    folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, order: f.order })),
    null, 2,
  ));

  // Add notes metadata (for faster import without re-parsing front matter)
  zip.file('notes-meta.json', JSON.stringify(notesMeta, null, 2));

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Import ─── */

export interface ImportResult {
  notesImported: number;
  foldersCreated: number;
  errors: string[];
}

export async function importFromZip(file: File): Promise<ImportResult> {
  const result: ImportResult = { notesImported: 0, foldersCreated: 0, errors: [] };

  const zip = await JSZip.loadAsync(file);

  // Validate metadata
  const metaFile = zip.file('metadata.json');
  if (!metaFile) {
    result.errors.push('Invalid backup: missing metadata.json');
    return result;
  }

  const meta: BackupMetadata = JSON.parse(await metaFile.async('string'));
  if (meta.version !== 1) {
    result.errors.push(`Unsupported backup version: ${meta.version}`);
    return result;
  }

  // Import folders first (to get ID mapping)
  const foldersFile = zip.file('folders.json');
  const folderIdMap = new Map<number, number>(); // old ID → new ID

  if (foldersFile) {
    const rawFolders = JSON.parse(await foldersFile.async('string')) as {
      id: number; name: string; parentId: number | null; order: number;
    }[];

    // Sort so parents come before children
    const sorted = topologicalSort(rawFolders);

    for (const f of sorted) {
      try {
        // Check if folder with same name/parent already exists
        const parentId = f.parentId ? (folderIdMap.get(f.parentId) ?? null) : null;
        const existing = await db.folders
          .where('name').equals(f.name)
          .filter(ef => ef.parentId === parentId)
          .first();

        if (existing) {
          folderIdMap.set(f.id, existing.id!);
        } else {
          const newId = await db.folders.add({
            name: f.name,
            parentId,
            providerFolderId: null,
            order: f.order,
          });
          folderIdMap.set(f.id, newId as number);
          result.foldersCreated++;
        }
      } catch (err) {
        result.errors.push(`Folder "${f.name}": ${err instanceof Error ? err.message : 'error'}`);
      }
    }
  }

  // Import notes
  const noteFiles = Object.keys(zip.files).filter(p => p.startsWith('notes/') && p.endsWith('.md'));

  for (const path of noteFiles) {
    try {
      const raw = await zip.file(path)!.async('string');
      const parsed = parseFrontMatter(raw);

      // Map old folder ID to new
      const folderId = parsed.folderId ? (folderIdMap.get(parsed.folderId) ?? null) : null;

      await db.notes.add({
        title: parsed.title,
        content: parsed.content,
        rawContent: parsed.rawContent ?? parsed.content,
        markdownContent: parsed.content,
        markdownPromptSystem: parsed.markdownPromptSystem,
        markdownPromptTemplate: parsed.markdownPromptTemplate,
        markdownDirty: false,
        suggestedActions: [],
        lastRawSuggestionHash: null,
        tags: parsed.tags,
        folderId,
        created: parsed.created,
        modified: parsed.modified,
        pinned: parsed.pinned,
        syncStatus: 'local',
        revision: null,
        providerFileId: null,
      });

      result.notesImported++;
    } catch (err) {
      result.errors.push(`Note "${path}": ${err instanceof Error ? err.message : 'error'}`);
    }
  }

  return result;
}

/* ─── Helpers ─── */

function sanitizeName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Untitled';
}

function serializeFrontMatter(note: Note): string {
  const lines: string[] = ['---'];
  lines.push(`title: "${note.title.replace(/"/g, '\\"')}"`);
  if (note.tags.length) lines.push(`tags: [${note.tags.map(t => `"${t}"`).join(', ')}]`);
  lines.push(`created: ${new Date(note.created).toISOString()}`);
  lines.push(`modified: ${new Date(note.modified).toISOString()}`);
  if (note.pinned) lines.push(`pinned: true`);
  if (note.folderId) lines.push(`folderId: ${note.folderId}`);
  lines.push(`rawContent: ${JSON.stringify(note.rawContent ?? note.content)}`);
  if (typeof note.markdownPromptSystem === 'string') lines.push(`markdownPromptSystem: ${JSON.stringify(note.markdownPromptSystem)}`);
  if (typeof note.markdownPromptTemplate === 'string') lines.push(`markdownPromptTemplate: ${JSON.stringify(note.markdownPromptTemplate)}`);
  lines.push('---');
  lines.push('');
  lines.push(note.content);
  return lines.join('\n');
}

function parseFrontMatter(raw: string): {
  title: string; content: string; rawContent: string; markdownPromptSystem?: string; markdownPromptTemplate?: string; tags: string[]; folderId: number | null;
  created: number; modified: number; pinned: boolean;
} {
  const fmRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = raw.match(fmRegex);

  if (!match) {
    return {
      title: 'Imported Note',
      content: raw,
      rawContent: raw,
      markdownPromptSystem: undefined,
      markdownPromptTemplate: undefined,
      tags: [],
      folderId: null,
      created: Date.now(),
      modified: Date.now(),
      pinned: false,
    };
  }

  const fm = match[1];
  const content = match[2].trimStart();

  const titleMatch = fm.match(/^title:\s*"?(.*?)"?\s*$/m);
  const title = titleMatch ? titleMatch[1] : 'Imported Note';

  const tagsMatch = fm.match(/tags:\s*\[(.*?)\]/);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [];

  const createdMatch = fm.match(/^created:\s*(.+)$/m);
  const created = createdMatch ? new Date(createdMatch[1]).getTime() || Date.now() : Date.now();

  const modifiedMatch = fm.match(/^modified:\s*(.+)$/m);
  const modified = modifiedMatch ? new Date(modifiedMatch[1]).getTime() || Date.now() : Date.now();

  const pinned = /pinned:\s*true/i.test(fm);
  const rawContent = parseJsonFrontMatterString(fm, 'rawContent') || content;
  const markdownPromptSystem = parseJsonFrontMatterString(fm, 'markdownPromptSystem') ?? undefined;
  const markdownPromptTemplate = parseJsonFrontMatterString(fm, 'markdownPromptTemplate') ?? undefined;

  const folderIdMatch = fm.match(/^folderId:\s*(\d+)/m);
  const folderId = folderIdMatch ? parseInt(folderIdMatch[1], 10) : null;

  return { title, content, rawContent, markdownPromptSystem, markdownPromptTemplate, tags, folderId, created, modified, pinned };
}

function parseJsonFrontMatterString(frontMatter: string, key: string): string | null {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const match = frontMatter.match(regex);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as string;
  } catch {
    return null;
  }
}

function topologicalSort(
  folders: { id: number; name: string; parentId: number | null; order: number }[],
): typeof folders {
  const result: typeof folders = [];
  const added = new Set<number>();
  const map = new Map(folders.map(f => [f.id, f]));

  function visit(id: number) {
    if (added.has(id)) return;
    const f = map.get(id);
    if (!f) return;
    if (f.parentId && !added.has(f.parentId)) visit(f.parentId);
    added.add(id);
    result.push(f);
  }

  for (const f of folders) visit(f.id);
  return result;
}
