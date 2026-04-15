/* ═══════════════════════════════════════════════════════════
   Firebase Authentication
   Google sign-in · offline-first session persistence
   ═══════════════════════════════════════════════════════════ */

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

export type { User };

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' }
  | { status: 'offline-no-session' };

const provider = new GoogleAuthProvider();
provider.addScope('email');
provider.addScope('profile');

/* ─── Initialise persistence ─── */

let _persistenceSet = false;

async function ensurePersistence(): Promise<void> {
  if (_persistenceSet) return;
  const auth = getFirebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  _persistenceSet = true;
}

/* ─── Sign in ─── */

/**
 * Sign in with Google popup. Falls back to redirect on mobile/restricted
 * environments where popups are blocked.
 */
export async function signInWithGoogle(): Promise<User> {
  await ensurePersistence();
  const auth = getFirebaseAuth();

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err: any) {
    // popup-blocked or unsupported environment → use redirect instead
    if (
      err?.code === 'auth/popup-blocked' ||
      err?.code === 'auth/popup-closed-by-user' ||
      err?.code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, provider);
      // Page will reload; result handled in handleRedirectResult()
      // Return a never-resolving promise so callers wait for navigation
      return new Promise(() => {});
    }
    throw err;
  }
}

/**
 * Sign in with a Firebase custom token issued by trusted backend logic
 * (used by passkey/WebAuthn authentication).
 */
export async function signInWithAuthToken(token: string): Promise<User> {
  await ensurePersistence();
  const auth = getFirebaseAuth();
  const result = await signInWithCustomToken(auth, token);
  return result.user;
}

/**
 * Call once early in app init to handle redirect result from mobile OAuth flow.
 * Returns the signed-in user if coming back from a redirect, or null otherwise.
 */
export async function handleRedirectResult(): Promise<User | null> {
  await ensurePersistence();
  const auth = getFirebaseAuth();
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch {
    return null;
  }
}

/* ─── Sign out ─── */

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}

/* ─── Auth state observer ─── */

/**
 * Subscribe to auth state changes. Calls `callback` with the current User
 * or null when a change occurs. Returns an unsubscribe function.
 */
export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  return firebaseOnAuthStateChanged(auth, callback);
}

/** Synchronously return the current user, or null if not signed in. */
export function getCurrentUser(): User | null {
  const auth = getFirebaseAuth();
  return auth.currentUser;
}

/* ─── Offline detection helper ─── */

/**
 * Returns true if the browser is offline (navigator.onLine === false).
 * Note: onLine is not 100% reliable but is sufficient for a first-load gate.
 */
export function isOffline(): boolean {
  return !navigator.onLine;
}
