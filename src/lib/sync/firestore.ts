/* ═══════════════════════════════════════════════════════════
   Firestore Sync Provider
   Primary cross-device sync backend — scoped per UID
   Collection path: users/{uid}/notes/{noteId}
   ═══════════════════════════════════════════════════════════ */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { getFirestoreDb } from '../firebase';
import type { Note } from '../db';

export interface FirestoreNote {
  id: number;
  title: string;
  content: string;
  tags: string[];
  folderId: number | null;
  created: number;
  modified: number;
  syncStatus: string;
  pinned: boolean;
  revision: string | null;
  providerFileId: string | null;
}

export type FirestoreNoteChangeHandler = (
  type: 'added' | 'modified' | 'removed',
  note: FirestoreNote,
) => void;

function notesCollection(uid: string) {
  return collection(getFirestoreDb(), 'users', uid, 'notes');
}

function noteDoc(uid: string, noteId: number) {
  return doc(getFirestoreDb(), 'users', uid, 'notes', String(noteId));
}

function toFirestoreNote(note: Note): FirestoreNote {
  return {
    id: note.id!,
    title: note.title,
    content: note.content,
    tags: note.tags,
    folderId: note.folderId,
    created: note.created,
    modified: note.modified,
    syncStatus: 'synced',
    pinned: note.pinned,
    revision: note.revision,
    providerFileId: note.providerFileId,
  };
}

function fromFirestoreDoc(data: DocumentData): FirestoreNote {
  return {
    id: data.id,
    title: data.title ?? '',
    content: data.content ?? '',
    tags: data.tags ?? [],
    folderId: data.folderId ?? null,
    created: data.created ?? Date.now(),
    modified: data.modified ?? Date.now(),
    syncStatus: 'synced',
    pinned: data.pinned ?? false,
    revision: data.revision ?? null,
    providerFileId: data.providerFileId ?? null,
  };
}

/* ─── CRUD ─── */

/** Push a single note to Firestore. Creates or overwrites. */
export async function pushNote(uid: string, note: Note): Promise<void> {
  const ref = noteDoc(uid, note.id!);
  await setDoc(ref, {
    ...toFirestoreNote(note),
    _updatedAt: serverTimestamp(),
  });
}

/** Pull a single note from Firestore by local id. Returns null if not found. */
export async function pullNote(uid: string, noteId: number): Promise<FirestoreNote | null> {
  const ref = noteDoc(uid, noteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return fromFirestoreDoc(snap.data());
}

/** Pull all notes for a user from Firestore. */
export async function pullAllNotes(uid: string): Promise<FirestoreNote[]> {
  const q = query(notesCollection(uid), orderBy('modified', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => fromFirestoreDoc(d.data()));
}

/** Delete a note from Firestore. */
export async function deleteNote(uid: string, noteId: number): Promise<void> {
  await deleteDoc(noteDoc(uid, noteId));
}

/** Update only the syncStatus field of a Firestore note doc. */
export async function updateSyncStatus(uid: string, noteId: number, status: string): Promise<void> {
  await updateDoc(noteDoc(uid, noteId), { syncStatus: status, _updatedAt: serverTimestamp() });
}

/* ─── Real-time listener ─── */

/**
 * Subscribe to real-time Firestore changes for all notes belonging to a user.
 * Calls `handler` for each add/modify/remove event.
 * Returns an unsubscribe function.
 */
export function subscribeToNotes(uid: string, handler: FirestoreNoteChangeHandler): Unsubscribe {
  const q = query(notesCollection(uid), orderBy('modified', 'desc'));
  return onSnapshot(q, snapshot => {
    snapshot.docChanges().forEach(change => {
      const note = fromFirestoreDoc(change.doc.data());
      if (change.type === 'added') handler('added', note);
      else if (change.type === 'modified') handler('modified', note);
      else if (change.type === 'removed') handler('removed', note);
    });
  });
}
