import { Document } from 'flexsearch';
import { db, type Note } from './db';

/* ─── FlexSearch Document Index ─── */
const index = new Document<{ id: number; title: string; content: string; tags: string }>({
  document: {
    id: 'id',
    index: [
      { field: 'title', tokenize: 'forward' },
      { field: 'content', tokenize: 'forward' },
      { field: 'tags', tokenize: 'forward' },
    ],
  },
  tokenize: 'forward',
});

let initialized = false;

/** Build the full-text index from all notes in the DB */
export async function buildSearchIndex(): Promise<void> {
  const notes = await db.notes.toArray();
  for (const note of notes) {
    if (note.id != null) {
      index.add({
        id: note.id,
        title: note.title,
        content: note.content,
        tags: note.tags.join(' '),
      });
    }
  }
  initialized = true;
}

/** Update a single note in the index (call after save) */
export function indexNote(note: Note): void {
  if (note.id == null) return;
  // Remove old entry first, then add updated
  index.remove(note.id);
  index.add({
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags.join(' '),
  });
}

/** Remove a note from the index */
export function removeFromIndex(noteId: number): void {
  index.remove(noteId);
}

/** Search notes — returns matching note IDs */
export function searchNotes(query: string): Set<number> {
  if (!initialized || !query.trim()) return new Set();
  const results = index.search(query, { limit: 100 });
  const ids = new Set<number>();
  for (const fieldResult of results) {
    for (const id of (fieldResult as { field: string; result: number[] }).result) {
      ids.add(id);
    }
  }
  return ids;
}
