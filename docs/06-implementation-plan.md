# Implementation Plan — 10 Phases

## Phase 0: Project Scaffolding ✅
# Implementation Plan — 12 Phases

---

## Phase 0.5: Firebase Project Setup

**Goal:** Configure Firebase project, SDK, and hosting infrastructure.

| Step | Task | Status |
|------|------|--------|
| 0.5.1 | Create Firebase project at console.firebase.google.com | ⬜ Manual |
| 0.5.2 | Enable Firebase Hosting (free Spark plan) | ⬜ Manual |
| 0.5.3 | Enable Firebase Authentication → Google provider | ⬜ Manual |
| 0.5.4 | Install Firebase CLI on build machine (`npm install -g firebase-tools`) | ⬜ Manual |
| 0.5.5 | `firebase init` — set `dist/` as public, SPA rewrite to `index.html` | ⬜ Manual |
| 0.5.6 | `firebase.json` — hosting rewrites, security headers, CSP | ✅ |
| 0.5.7 | `.firebaserc` — project alias placeholder | ✅ |
| 0.5.8 | Install Firebase SDK (`npm install firebase`) | ✅ |
| 0.5.9 | `src/lib/firebase.ts` — init app, auth, Firestore with offline persistence | ✅ |
| 0.5.10 | `.env.example` — Firebase config vars template | ✅ |
| 0.5.11 | `vite.config.ts` — `base: '/'`, no production sourcemaps, Firebase network-only workbox rules | ✅ |
| 0.5.12 | `firestore.rules` + `firestore.indexes.json` — strict per-UID security rules | ✅ |

**Verify:** Copy `.env.example` → `.env`, fill in Firebase config. `firebase deploy` succeeds. App loads from `*.web.app`.

---

## Phase 0: Project Scaffolding ✅

**Goal:** Bootable PWA shell with design system

| Step | Task | Status |
|------|------|--------|
| 0.1 | Init Vite + vanilla-ts template | ✅ |
| 0.2 | Install dependencies (17 packages) | ✅ |
| 0.3 | PWA manifest + placeholder icons | ✅ |
| 0.4 | Vite config with VitePWA plugin | ✅ |
| 0.5 | Theme CSS — 8 themes, 6 accents, ~40 tokens | ✅ |
| 0.6 | Layout CSS — all component styles + responsive | ✅ |
| 0.7 | Dexie.js database schema (6 tables) | ✅ |
| 0.8 | Theme manager module | ✅ |
| 0.9 | Tips system module (30 tips, 7 categories) | ✅ |
| 0.10 | Snippets module (25+ built-in) | ✅ |
| 0.11 | Editor module (CodeMirror 6 setup) | ✅ |
| 0.12 | Preview module (markdown-it + mermaid + KaTeX) | ✅ |
| 0.13 | Main app entry point (app shell + CRUD + wiring) | ✅ |

**Verify:** `npm run build` succeeds, dev server starts, app shell renders

---

## Phase 1: Core Editor & Offline Storage

**Goal:** Fully functional markdown editor with offline persistence

| Step | Task |
|------|------|
| 1.1 | Wire editor ↔ preview scroll sync |
| 1.2 | Implement note save/load lifecycle |
| 1.3 | Title rename with auto-update in file list |
| 1.4 | Backlinks panel — query notes containing `[[current title]]` |
| 1.5 | Auto-generated Table of Contents from headings |
| 1.6 | Word count, character count, reading time in statusbar |
| 1.7 | Editor line/column cursor position tracking |
| 1.8 | Drag-to-reorder notes in file list |

**Verify:** Create 10 notes, edit, reload — all data persists. Backlinks and TOC work.

---

## Phase 2: Folder Tree, Search & Tags

**Goal:** Organize and find notes efficiently

| Step | Task |
|------|------|
| 2.1 | FlexSearch index — build on app start, update on note save |
| 2.2 | Search syntax: `tag:name`, `date:YYYY-MM-DD`, free text |
| 2.3 | Fuzzy matching with ranked results |
| 2.4 | Hierarchical folder CRUD (create, rename, delete, move) |
| 2.5 | Drag notes between folders |
| 2.6 | Sort options: modified, created, title, size |
| 2.7 | Recent notes list (last 10 opened) |
| 2.8 | Context menu (right-click) for notes and folders |

**Verify:** 100 notes with diverse tags — search returns <50ms. Folders nest 3 levels deep.

---

## Phase 3: Cloud Storage Integration

**Goal:** Sync notes across devices via cloud providers

| Step | Task |
|------|------|
| 3.0 | Enable Firestore in Firebase project (Firebase console) |
| 3.0.1 | `src/lib/sync/firestore.ts` — Firestore push/pull/subscribe per UID ✅ |
| 3.0.2 | Firestore collection path: `users/{uid}/notes/{noteId}` ✅ |
| 3.0.3 | `onSnapshot` real-time listener for live cross-device sync ✅ |
| 3.0.4 | Offline persistence via `persistentLocalCache` (Firestore SDK) ✅ |
| 3.1 | Google Drive OAuth 2.0 PKCE flow |
| 3.2 | Google Drive sync engine: upload, download, delta |
| 3.3 | OneDrive Microsoft Graph integration |
| 3.4 | Dropbox API v2 integration |
| 3.5 | Conflict detection via revision/etag comparison |
| 3.6 | Three-way merge conflict resolution UI |
| 3.7 | Background sync with exponential backoff |
| 3.8 | Version history: store last 20 revisions, diff viewer |
| 3.9 | Full export (ZIP: .md files + attachments + metadata.json) |
| 3.10 | Import from backup ZIP |

**Verify:** Edit on two devices, trigger conflict, resolve. Export/import roundtrip.

---

## Phase 4: In-Browser LLM

**Goal:** Private AI inference with zero server dependency

| Step | Task |
|------|------|
| 4.1 | WebLLM engine initialization |
| 4.2 | Model catalog UI with size/capability info |
| 4.3 | Model download with progress bar + cancel |
| 4.4 | Chat completions API wrapper |
| 4.5 | Streaming token renderer |
| 4.6 | WebGPU detection with WASM fallback |
| 4.7 | Model management: list downloaded, delete, check space |

**Verify:** Download Phi-3-mini, run "summarize this" prompt, see streaming output offline.

---

## Phase 5: External LLM Providers

**Goal:** Connect to cloud AI services with encrypted credentials

| Step | Task |
|------|------|
| 5.1 | Provider abstraction layer (common interface) |
| 5.2 | OpenAI adapter: GPT-4o, GPT-4o-mini |
| 5.3 | Anthropic adapter: Claude 3.5 Sonnet, Claude 3 Haiku |
| 5.4 | Google adapter: Gemini 1.5 Flash, Gemini 1.5 Pro |
| 5.5 | AES-GCM API key encryption/decryption |
| 5.6 | Provider settings UI (key entry, model selection) |
| 5.7 | Fallback chain: primary → secondary → local |

**Verify:** Configure OpenAI key, run prompt, see streaming response. Delete key, verify encrypted storage.

---

## Phase 6: Prompt System & Analysis Tools

**Goal:** Reusable AI prompts with context-aware execution

| Step | Task |
|------|------|
| 6.1 | Built-in prompt templates (summarize, expand, translate, fix grammar, explain, simplify) |
| 6.2 | Custom prompt editor with `{{selection}}`, `{{note}}`, `{{title}}` variables |
| 6.3 | AI panel slide-out UI |
| 6.4 | Context injection: selection, full note, or multiple notes |
| 6.5 | Response actions: insert at cursor, replace selection, copy, append |
| 6.6 | Batch execution across selected notes |
| 6.7 | Prompt library: save, categorize, import/export |
| 6.8 | Note templates: 6 built-in + user-created template CRUD |

**Verify:** Run "translate to Spanish" on selection, insert result. Batch-summarize 5 notes.

---

## Phase 7: Document Upload & Text Extraction

**Goal:** Import content from PDFs, Word docs, images, and audio

| Step | Task |
|------|------|
| 7.1 | Drop zone overlay with file type detection |
| 7.2 | PDF.js text extraction → markdown |
| 7.3 | Mammoth.js DOCX → HTML → markdown conversion |
| 7.4 | Tesseract.js OCR for images |
| 7.5 | Progress bar with cancel button |
| 7.6 | Clipboard paste handler (image → OCR, text → insert) |
| 7.7 | Attachment storage in IndexedDB blobs |

**Verify:** Drop a 20-page PDF → text extracted as new note. Paste screenshot → OCR text.

---

## Phase 8: Speech Input & Transcription

**Goal:** Voice-to-text for hands-free note taking

| Step | Task |
|------|------|
| 8.1 | Web Speech API real-time recognition |
| 8.2 | Microphone button in toolbar with recording indicator |
| 8.3 | Whisper model download (Transformers.js) |
| 8.4 | Offline audio transcription via Whisper |
| 8.5 | Audio recording → attachment + transcription |
| 8.6 | Language selection for recognition |

**Verify:** Record 60s of speech → accurate transcription inserted. Works offline with Whisper.

---

## Phase 9: Mobile Packaging & Responsive Design

**Goal:** Native mobile app experience

| Step | Task |
|------|------|
| 9.1 | Capacitor 6 init (Android + iOS) |
| 9.2 | Responsive breakpoints polish (1024/768) |
| 9.3 | Touch gesture support (swipe sidebar, long-press context) |
| 9.4 | Mobile-optimized formatting toolbar |
| 9.9 | Move TOC and pinned notes into a swipeable bottom drawer on mobile to maximize vertical editing space |
| 9.5 | Biometric lock (Capacitor plugin) |
| 9.6 | Status bar and safe-area insets |
| 9.7 | Android APK build + test |
| 9.8 | iOS IPA build + test |

**Verify:** Install on Android device, create note, edit offline, sync when online.

---

## Phase 10: Polish, Security & Production Readiness

**Goal:** Production-quality PWA ready for public use

| Step | Task |
|------|------|
| 10.1 | Accessibility audit: ARIA, keyboard nav, screen reader testing |
| 10.2 | i18n: 20 language JSON files, RTL support, language selector |
| 10.3 | Onboarding flow for first-time users |
| 10.4 | Settings panel: all preferences in one place |
| 10.5 | CSP headers configuration |
| 10.6 | Performance audit: Lighthouse 90+ |
| 10.7 | Error boundary and graceful degradation |
| 10.8 | Keyboard shortcuts help dialog |
| 10.9 | Changelog and version display |
| 10.10 | Final theme QA across all 8 themes |
| 10.11 | Dark theme visual refinement: subtle background gradients/mesh textures to reduce eye strain during long-form writing |
| 10.12 | Contextual performance feedback: real-time "saving" / frame-rate indicator in status bar |

**Verify:** Lighthouse ≥90 all categories. All 20 languages load. Axe audit passes. All 8 themes render correctly.
| 10.13 | `firebase.json` SPA rewrite — all routes → `index.html` ✅ |
| 10.14 | CSP header: allow `accounts.google.com`, `apis.google.com`, `firestore.googleapis.com`, `*.firebaseapp.com` ✅ |
| 10.15 | Security headers: HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` ✅ |
| 10.16 | Vite build: `base: '/'`, no production sourcemaps ✅ |
| 10.17 | Firebase Hosting preview channels for staging |
| 10.18 | Deploy script / CI: `npm run build && firebase deploy` |
| 10.19 | (Optional) Firebase App Check — protect Firestore/Auth from abuse |
| 10.20 | Custom domain via Firebase Hosting if desired |

**Verify:** `firebase deploy` succeeds. Lighthouse ≥90. CSP headers pass DevTools audit. Auth gate blocks unauthenticated access.

---

## Phase 11: Firebase Auth + Security Gate

**Goal:** Google sign-in with strict security-first + offline-first session handling.

### Architecture
- **First visit (online):** Login screen shown — no app content accessible before auth.
- **Return visit (offline):** Firebase `browserLocalPersistence` restores cached token — app loads from service worker without network.
- **First visit (offline):** Blocked — "Please sign in at least once online" message shown.

| Step | Task | Status |
|------|------|--------|
| 11.1 | `src/lib/auth.ts` — `signInWithGoogle()`, `signOut()`, `onAuthStateChanged()`, popup + redirect fallback | ✅ |
| 11.2 | `browserLocalPersistence` — tokens cached locally for offline re-auth | ✅ |
| 11.3 | Auth gate in `main.ts` — entire app init wrapped in `onAuthStateChanged` | ✅ |
| 11.4 | Login screen — Google button, branding, offline-no-session notice | ✅ |
| 11.5 | Auth spinner — shown while Firebase resolves cached auth state | ✅ |
| 11.6 | Online/offline detection on load — routes to the correct screen | ✅ |
| 11.7 | `db.ts` UID namespacing — Dexie DB per user (`qp-notes-{uid}`) | ✅ |
| 11.8 | `initDb(uid)` called in `bootApp()` before any data access | ✅ |
| 11.9 | User badge in topbar (avatar/initials + sign-out button) | ✅ |
| 11.10 | Sign-out handler — clears session, `onAuthStateChanged` shows login | ✅ |
| 11.11 | `src/styles/auth.css` — login screen, spinner, user badge styles | ✅ |
| 11.12 | Firestore Security Rules — `allow read, write: if request.auth.uid == uid` | ✅ |
| 11.13 | CSP in `firebase.json` — allows all required Google/Firebase domains | ✅ |
| 11.14 | Wire Firestore real-time sync (`subscribeToNotes`) into app after auth | ⬜ |

**Verify:** Fresh visit → login screen only. Sign in → app loads with UID-scoped DB. DevTools offline mode → reload → app loads from service worker cache. Sign out → login shown.
