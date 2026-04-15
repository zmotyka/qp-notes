/* ═══════════════════════════════════════════════════════════
   Firebase — App, Auth & Firestore initialisation
   All config values come from Vite env vars (never hardcoded)
   ═══════════════════════════════════════════════════════════ */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

/** Initialise Firebase once. Safe to call multiple times. */
export function initFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (app!) return { app, auth, db };

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  // Use persistent multi-tab cache so Firestore works offline
  // and syncs across tabs automatically.
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Falls back to in-memory if IndexedDB is unavailable
    db = getFirestore(app);
  }

  return { app, auth, db };
}

export function getFirebaseAuth(): Auth {
  if (!auth) initFirebase();
  return auth;
}

export function getFirestoreDb(): Firestore {
  if (!db) initFirebase();
  return db;
}
