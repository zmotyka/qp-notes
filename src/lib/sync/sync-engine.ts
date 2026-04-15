/* ═══════════════════════════════════════════════════════════
   Sync Engine — Bi-directional sync with conflict detection
   ═══════════════════════════════════════════════════════════ */

import { db, type Note, getSetting, setSetting } from '../db';
import type { CloudProvider, CloudFile } from './provider';

export type SyncState = 'idle' | 'syncing' | 'error';
export type SyncStateListener = (state: SyncState, message?: string) => void;

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface ConflictRecord {
  noteId: number;
  localContent: string;
  remoteContent: string;
  remoteRevision: string;
  remoteModified: number;
}

export class SyncEngine {
  private provider: CloudProvider | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private syncState: SyncState = 'idle';
  private listeners: SyncStateListener[] = [];
  private consecutiveErrors = 0;
  private baseInterval = 5 * 60_000; // 5 minutes
  private maxInterval = 60 * 60_000; // 1 hour
  private appFolderId: string | null = null;
  private conflicts: ConflictRecord[] = [];

  onStateChange(listener: SyncStateListener): void {
    this.listeners.push(listener);
  }

  private setState(state: SyncState, message?: string): void {
    this.syncState = state;
    this.listeners.forEach(fn => fn(state, message));
  }

  getState(): SyncState {
    return this.syncState;
  }

  getConflicts(): ConflictRecord[] {
    return [...this.conflicts];
  }

  clearConflict(noteId: number): void {
    this.conflicts = this.conflicts.filter(c => c.noteId !== noteId);
  }

  async setProvider(provider: CloudProvider): Promise<void> {
    this.provider = provider;
    this.appFolderId = null;
    this.consecutiveErrors = 0;
  }

  getProvider(): CloudProvider | null {
    return this.provider;
  }

  start(): void {
    if (this.intervalId) return;
    this.scheduleNext();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.setState('idle');
  }

  private scheduleNext(): void {
    const delay = Math.min(
      this.baseInterval * Math.pow(2, this.consecutiveErrors),
      this.maxInterval,
    );
    this.intervalId = setTimeout(() => {
      this.sync().then(() => this.scheduleNext());
    }, delay) as unknown as ReturnType<typeof setInterval>;
  }

  async sync(): Promise<SyncResult> {
    if (!this.provider || !this.provider.isAuthenticated()) {
      return { pushed: 0, pulled: 0, conflicts: 0, errors: ['Not authenticated'] };
    }

    if (this.syncState === 'syncing') {
      return { pushed: 0, pulled: 0, conflicts: 0, errors: ['Sync already in progress'] };
    }

    this.setState('syncing');
    const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, errors: [] };

    try {
      // Ensure app folder exists
      if (!this.appFolderId) {
        this.appFolderId = await this.provider.ensureAppFolder();
      }

      // Sync folders first
      await this.syncFolders();

      // Push local changes
      const pushed = await this.pushPendingNotes();
      result.pushed = pushed;

      // Pull remote changes
      const pullResult = await this.pullRemoteChanges();
      result.pulled = pullResult.pulled;
      result.conflicts = pullResult.conflicts;

      // Update last sync time
      await setSetting('lastSyncTime', Date.now().toString());

      this.consecutiveErrors = 0;
      this.setState('idle');
    } catch (err) {
      this.consecutiveErrors++;
      const msg = err instanceof Error ? err.message : 'Sync failed';
      result.errors.push(msg);
      this.setState('error', msg);
    }

    return result;
  }

  /* ─── Folder sync ─── */

  private async syncFolders(): Promise<void> {
    if (!this.provider || !this.appFolderId) return;

    const localFolders = await db.folders.toArray();
    const remoteFolders = await this.provider.listFolders(this.appFolderId);

    // Push local folders that don't have a provider ID
    for (const folder of localFolders) {
      if (!folder.providerFolderId) {
        try {
          const remote = await this.provider.createFolder(this.appFolderId, folder.name);
          await db.folders.update(folder.id!, { providerFolderId: remote.id });
        } catch (err) {
          // Folder may already exist — try to match by name
          const match = remoteFolders.find(rf => rf.name === folder.name);
          if (match) {
            await db.folders.update(folder.id!, { providerFolderId: match.id });
          }
        }
      }
    }
  }

  /* ─── Push local changes ─── */

  private async pushPendingNotes(): Promise<number> {
    if (!this.provider || !this.appFolderId) return 0;

    const pending = await db.notes.where('syncStatus').equals('pending').toArray();
    let pushed = 0;

    for (const note of pending) {
      try {
        const filename = this.noteToFilename(note);
        const folderId = await this.getRemoteFolderId(note.folderId);
        const content = this.serializeNote(note);

        if (note.providerFileId) {
          // Update existing remote file
          const cloudFile = await this.provider.updateFile(
            note.providerFileId, content, note.revision,
          );
          await db.notes.update(note.id!, {
            syncStatus: 'synced',
            revision: cloudFile.revision,
            providerFileId: cloudFile.id,
          });
        } else {
          // Upload new file
          const cloudFile = await this.provider.uploadFile(folderId, filename, content);
          await db.notes.update(note.id!, {
            syncStatus: 'synced',
            revision: cloudFile.revision,
            providerFileId: cloudFile.id,
          });
        }

        pushed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('conflict') || msg.includes('412') || msg.includes('409')) {
          await this.handlePushConflict(note);
        }
        // Otherwise skip this note, will retry next sync
      }
    }

    return pushed;
  }

  private async handlePushConflict(note: Note): Promise<void> {
    if (!this.provider || !note.providerFileId) return;

    try {
      const remote = await this.provider.downloadFile(note.providerFileId);
      this.conflicts.push({
        noteId: note.id!,
        localContent: note.content,
        remoteContent: remote.content,
        remoteRevision: remote.revision,
        remoteModified: Date.now(),
      });
      await db.notes.update(note.id!, { syncStatus: 'conflict' });
    } catch {
      // If we can't fetch remote, mark as conflict with empty remote
      await db.notes.update(note.id!, { syncStatus: 'conflict' });
    }
  }

  /* ─── Pull remote changes ─── */

  private async pullRemoteChanges(): Promise<{ pulled: number; conflicts: number }> {
    if (!this.provider || !this.appFolderId) return { pulled: 0, conflicts: 0 };

    const remoteFiles = await this.provider.listFiles(this.appFolderId);
    // Also list files from remote sub-folders
    const remoteFolders = await this.provider.listFolders(this.appFolderId);
    for (const rf of remoteFolders) {
      const subFiles = await this.provider.listFiles(rf.id);
      remoteFiles.push(...subFiles);
    }

    const lastSync = parseInt(await getSetting('lastSyncTime') || '0', 10);
    let pulled = 0;
    let conflicts = 0;

    for (const file of remoteFiles) {
      if (!file.name.endsWith('.md')) continue;
      if (file.modified <= lastSync) continue;

      try {
        const result = await this.pullFile(file);
        if (result === 'pulled') pulled++;
        else if (result === 'conflict') conflicts++;
      } catch {
        // Skip this file, will retry next sync
      }
    }

    return { pulled, conflicts };
  }

  private async pullFile(file: CloudFile): Promise<'pulled' | 'conflict' | 'skipped'> {
    if (!this.provider) return 'skipped';

    // Check if we already have this file locally
    const localNote = await db.notes.where('providerFileId').equals(file.id).first();

    if (!localNote) {
      // New file from remote — import it
      const { content, revision } = await this.provider.downloadFile(file.id);
      const parsed = this.deserializeNote(content, file.name);
      await db.notes.add({
        ...parsed,
        rawContent: parsed.content,
        markdownContent: parsed.content,
        markdownDirty: false,
        suggestedActions: [],
        lastRawSuggestionHash: null,
        providerFileId: file.id,
        revision,
        syncStatus: 'synced',
      });
      return 'pulled';
    }

    // File exists locally — check for conflicts
    if (localNote.syncStatus === 'pending') {
      // Local has unsaved changes AND remote changed — conflict
      const { content, revision } = await this.provider.downloadFile(file.id);
      this.conflicts.push({
        noteId: localNote.id!,
        localContent: localNote.content,
        remoteContent: content,
        remoteRevision: revision,
        remoteModified: file.modified,
      });
      await db.notes.update(localNote.id!, { syncStatus: 'conflict' });
      return 'conflict';
    }

    // Local is synced — check if remote has newer content
    if (file.revision !== localNote.revision) {
      const { content, revision } = await this.provider.downloadFile(file.id);
      const parsed = this.deserializeNote(content, file.name);
      await db.notes.update(localNote.id!, {
        title: parsed.title,
        content: parsed.content,
        rawContent: parsed.content,
        markdownContent: parsed.content,
        markdownDirty: false,
        tags: parsed.tags,
        modified: file.modified,
        revision,
        syncStatus: 'synced',
      });
      return 'pulled';
    }

    return 'skipped';
  }

  /* ─── Conflict resolution ─── */

  async resolveConflict(noteId: number, choice: 'local' | 'remote'): Promise<void> {
    const conflict = this.conflicts.find(c => c.noteId === noteId);
    if (!conflict) return;

    if (choice === 'local') {
      // Keep local content, force push
      await db.notes.update(noteId, { syncStatus: 'pending', revision: conflict.remoteRevision });
    } else {
      // Accept remote content
      const note = await db.notes.get(noteId);
      if (note) {
        const parsed = this.deserializeNote(conflict.remoteContent, note.title + '.md');
        await db.notes.update(noteId, {
          title: parsed.title,
          content: parsed.content,
          rawContent: parsed.content,
          markdownContent: parsed.content,
          markdownDirty: false,
          tags: parsed.tags,
          modified: conflict.remoteModified,
          revision: conflict.remoteRevision,
          syncStatus: 'synced',
        });
      }
    }

    this.clearConflict(noteId);
  }

  /* ─── Helpers ─── */

  private async getRemoteFolderId(localFolderId: number | null): Promise<string> {
    if (!localFolderId || !this.appFolderId) return this.appFolderId!;
    const folder = await db.folders.get(localFolderId);
    return folder?.providerFolderId || this.appFolderId!;
  }

  private noteToFilename(note: Note): string {
    // Sanitize title for filesystem
    const safe = note.title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    return `${safe || 'Untitled'}.md`;
  }

  /** Serializes a note to markdown with YAML front matter. */
  private serializeNote(note: Note): string {
    const lines: string[] = ['---'];
    lines.push(`title: "${note.title.replace(/"/g, '\\"')}"`);
    if (note.tags.length) lines.push(`tags: [${note.tags.map(t => `"${t}"`).join(', ')}]`);
    lines.push(`created: ${new Date(note.created).toISOString()}`);
    lines.push(`modified: ${new Date(note.modified).toISOString()}`);
    if (note.pinned) lines.push(`pinned: true`);
    if (note.id) lines.push(`localId: ${note.id}`);
    lines.push('---');
    lines.push('');
    lines.push(note.content);
    return lines.join('\n');
  }

  /** Deserializes markdown with YAML front matter into note fields. */
  private deserializeNote(
    raw: string,
    filename: string,
  ): Pick<Note, 'title' | 'content' | 'tags' | 'folderId' | 'created' | 'modified' | 'pinned'> {
    const fmRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = raw.match(fmRegex);

    if (!match) {
      return {
        title: filename.replace(/\.md$/i, ''),
        content: raw,
        tags: [],
        folderId: null,
        created: Date.now(),
        modified: Date.now(),
        pinned: false,
      };
    }

    const frontMatter = match[1];
    const content = match[2].trimStart();

    // Simple YAML parser for known fields
    const title = this.yamlValue(frontMatter, 'title') || filename.replace(/\.md$/i, '');
    const tagsMatch = frontMatter.match(/tags:\s*\[(.*?)\]/);
    const tags = tagsMatch
      ? tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      : [];
    const created = this.yamlDate(frontMatter, 'created') || Date.now();
    const modified = this.yamlDate(frontMatter, 'modified') || Date.now();
    const pinned = /pinned:\s*true/i.test(frontMatter);

    return { title, content, tags, folderId: null, created, modified, pinned };
  }

  private yamlValue(yaml: string, key: string): string | null {
    const regex = new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, 'm');
    const m = yaml.match(regex);
    return m ? m[1] : null;
  }

  private yamlDate(yaml: string, key: string): number | null {
    const val = this.yamlValue(yaml, key);
    if (!val) return null;
    const ts = new Date(val).getTime();
    return isNaN(ts) ? null : ts;
  }
}

export const syncEngine = new SyncEngine();
