import Dexie, { type EntityTable } from 'dexie';

/* ─── Types ─── */
export interface Note {
  id?: number;
  title: string;
  content: string;
  rawContent?: string;
  markdownContent?: string;
  markdownPromptSystem?: string;
  markdownPromptTemplate?: string;
  markdownDirty?: boolean;
  suggestedActions?: string[];
  lastRawSuggestionHash?: string | null;
  tags: string[];
  folderId: number | null;
  created: number;  // timestamp ms
  modified: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'local';
  revision: string | null;       // cloud provider revision/etag
  providerFileId: string | null; // remote file id
  pinned: boolean;
}

export interface Folder {
  id?: number;
  name: string;
  parentId: number | null;
  providerFolderId: string | null;
  order: number;
}

export interface Attachment {
  id?: number;
  noteId: number;
  filename: string;
  mimeType: string;
  size: number;
  data: Blob | null;
  providerFileId: string | null;
  extractedText: string | null;
  created: number;
}

export interface AppSettings {
  id?: number;
  key: string;
  value: string;
}

export interface PromptTemplate {
  id?: number;
  name: string;
  systemInstruction: string;
  userTemplate: string;
  defaultProvider: string;
  created: number;
  modified: number;
}

export interface Snippet {
  id?: number;
  trigger: string;
  title: string;
  category: string;
  body: string;
  builtin: boolean;
}

/* ─── Database ─── */
class QpNotesDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  folders!: EntityTable<Folder, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  prompts!: EntityTable<PromptTemplate, 'id'>;
  snippets!: EntityTable<Snippet, 'id'>;

  constructor(uid: string) {
    // Database name is scoped to the user UID to prevent data bleed
    // between accounts on a shared device/browser.
    super(`qp-notes-${uid}`);

    this.version(1).stores({
      notes: '++id, title, *tags, folderId, created, modified, syncStatus, pinned',
      folders: '++id, parentId, name',
      attachments: '++id, noteId, filename',
      settings: '++id, &key',
      prompts: '++id, name',
      snippets: '++id, &trigger, category',
    });

    // v2: add order index to folders so orderBy('order') works
    this.version(2).stores({
      folders: '++id, parentId, name, order',
    });
  }
}

let _db: QpNotesDB | null = null;
let _currentUid: string | null = null;

/**
 * Initialise (or re-initialise) the database for a given user UID.
 * Must be called after successful authentication before any DB access.
 */
export function initDb(uid: string): QpNotesDB {
  if (_db && _currentUid === uid) return _db;
  _db = new QpNotesDB(uid);
  _currentUid = uid;
  return _db;
}

/**
 * Returns the current user-scoped database instance.
 * Throws if initDb() has not been called yet (i.e. user not authenticated).
 */
export function getDb(): QpNotesDB {
  if (!_db) throw new Error('Database not initialised. User must be authenticated first.');
  return _db;
}

/** Convenience proxy — used by legacy code that imports `db` directly. */
export const db = new Proxy({} as QpNotesDB, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

/* ─── Settings helpers ─── */
export async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.settings.where('key').equals(key).first();
  return row?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.settings.where('key').equals(key).first();
  if (existing) {
    await db.settings.update(existing.id!, { value });
  } else {
    await db.settings.add({ key, value });
  }
}
