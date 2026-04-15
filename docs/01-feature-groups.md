# Feature Groups — F1 through F18

## F1: Core Markdown Editor

| # | Sub-feature | Description |
|---|-------------|-------------|
| F1.1 | Rich markdown editing | CodeMirror 6 with syntax highlighting, line numbers, active-line highlight |
| F1.2 | Live preview | Split/edit/preview modes with debounced markdown-it rendering |
| F1.3 | Formatting toolbar | Bold, italic, strikethrough, headings (H1–H3), lists (bullet, numbered, task), code, blockquote, horizontal rule |
| F1.4 | Code blocks | Fenced code blocks with highlight.js syntax highlighting (190+ languages) |
| F1.5 | Mermaid diagrams | Fenced `mermaid` blocks rendered as SVG — flowchart, sequence, gantt, mindmap, ER, state, pie, class |
| F1.6 | Image embedding | Insert images via URL; future: paste/upload with IndexedDB blob storage |
| F1.7 | Table insertion | Insert markdown tables from toolbar; GFM table rendering |
| F1.8 | Hyperlinks | Insert/edit links via Ctrl+K dialog; clickable URLs in editor via MatchDecorator |
| F1.9 | Wiki-links | `[[Note Title]]` syntax auto-linked to matching notes |
| F1.10 | Backlinks | Panel showing all notes that link to the current note |
| F1.11 | Table of Contents | Auto-generated TOC from headings with click-to-scroll navigation |
| F1.12 | KaTeX math | Inline `$...$` and block `$$...$$` LaTeX math rendering |
| F1.13 | Keyboard shortcuts | Ctrl+S save, Ctrl+N new note, Ctrl+B bold, Ctrl+I italic, Ctrl+K link |
| F1.14 | Auto-save | 2-second debounce auto-save to IndexedDB on content change |
| F1.15 | Word/character count | Real-time word count, character count, and reading time in status bar |
| F1.16 | Undo/redo | Full undo/redo history via CodeMirror history extension |

## F2: Offline-First Storage

| # | Sub-feature | Description |
|---|-------------|-------------|
| F2.1 | IndexedDB via Dexie.js | All notes, folders, attachments, settings stored locally |
| F2.2 | Structured schema | Tables: notes, folders, attachments, settings, prompts, snippets |
| F2.3 | Full CRUD | Create, read, update, delete notes with timestamps |
| F2.4 | Sync status tracking | Each note: `local`, `synced`, `pending`, `conflict` status |
| F2.5 | Pin/favorite notes | Toggle pin state for quick access |
| F2.6 | Tags | Comma-separated tags per note; filter by tag in sidebar |
| F2.7 | Folder hierarchy | Nested folders; move notes between folders |

## F3: Cloud Storage Integration

| # | Sub-feature | Description |
|---|-------------|-------------|
| F3.1 | Google Drive sync | OAuth 2.0 PKCE flow; store notes as `.md` files in app folder |
| F3.2 | OneDrive sync | Microsoft Graph API; same `.md` file approach |
| F3.3 | Dropbox sync | Dropbox API v2; content-hash based change detection |
| F3.4 | Sync engine | Background sync with exponential backoff; offline queue |
| F3.5 | Conflict resolution | Three-way merge with manual conflict UI for unresolvable conflicts |
| F3.6 | Multi-device | Last-writer-wins for metadata; content merges for body text |
| F3.7 | Selective sync | Choose which folders/notes sync to which provider |
| F3.8 | Version history | Store last N revisions per note; diff viewer; restore any version |
| F3.9 | Backup/restore | Full export (JSON + attachments ZIP) and import |

## F4: In-Browser LLM

| # | Sub-feature | Description |
|---|-------------|-------------|
| F4.1 | WebLLM integration | @mlc-ai/web-llm for 100% in-browser inference |
| F4.2 | Model catalog | Curated list of small models (Phi-3-mini, Llama-3.2-1B, Gemma-2B, etc.) |
| F4.3 | One-click download | Download model weights to IndexedDB/Cache Storage with progress indicator |
| F4.4 | Streaming output | Token-by-token streaming rendered in preview pane |
| F4.5 | WebGPU acceleration | Prefer WebGPU, fall back to WASM on unsupported browsers |
| F4.6 | Model management | View downloaded models, delete to free space, check compatibility |

## F5: External LLM Providers

| # | Sub-feature | Description |
|---|-------------|-------------|
| F5.1 | OpenAI API | GPT-4o, GPT-4o-mini; configurable model, temperature, max tokens |
| F5.2 | Anthropic Claude | Claude 3.5 Sonnet, Claude 3 Haiku |
| F5.3 | Google Gemini | Gemini 1.5 Flash, Gemini 1.5 Pro |
| F5.4 | Encrypted API keys | AES-GCM encryption via Web Crypto API; keys never leave device |
| F5.5 | Provider settings | Per-provider: model selection, temperature, max tokens, system prompt |
| F5.6 | Fallback chain | If primary provider fails, try next configured provider |

## F6: Prompt System & Analysis

| # | Sub-feature | Description |
|---|-------------|-------------|
| F6.1 | Prompt templates | Pre-built templates: summarize, expand, translate, fix grammar, explain, simplify |
| F6.2 | Custom prompts | User-created prompt templates with `{{selection}}` and `{{note}}` variables |
| F6.3 | Batch execution | Run a prompt against multiple selected notes |
| F6.4 | Context injection | Auto-inject current note content, selection, or note metadata as context |
| F6.5 | Response insertion | Insert LLM response at cursor, replace selection, or append to note |
| F6.6 | Prompt library | Organize saved prompts by category; import/export |
| F6.7 | Smart summary | Auto-generate one-line summary for note list preview |
| F6.8 | Note templates | 6 built-in templates (blank, meeting, journal, project, cornell, weekly review) + user-created |

## F7: Document Upload & Extraction

| # | Sub-feature | Description |
|---|-------------|-------------|
| F7.1 | PDF text extraction | PDF.js for client-side PDF parsing; output as markdown |
| F7.2 | DOCX import | Mammoth.js for Word document → HTML → markdown conversion |
| F7.3 | OCR for images | Tesseract.js for image-to-text; extract text from screenshots/photos |
| F7.4 | Drag & drop | Drop files anywhere on the editor to trigger import |
| F7.5 | Clipboard paste | Paste images from clipboard; auto-OCR or embed as attachment |
| F7.6 | Progress indicator | Extraction progress bar with cancel option |

## F8: Search & Organization

| # | Sub-feature | Description |
|---|-------------|-------------|
| F8.1 | Full-text search | FlexSearch index with tokenization and fuzzy matching |
| F8.2 | Search syntax | `tag:name`, `date:YYYY-MM-DD`, plain text; combinable |
| F8.3 | Folder tree | Hierarchical folder navigation in left sidebar |
| F8.4 | Sort options | Sort by modified date, created date, title, size |
| F8.5 | Quick filter | Filter sidebar by All Notes, Favorites, specific tag |
| F8.6 | Recent notes | Quick access to last 10 opened notes |
| F8.7 | Pinned notes | Pin notes to top of any list; persistent across sessions |

## F9: Speech Input & Transcription

| # | Sub-feature | Description |
|---|-------------|-------------|
| F9.1 | Web Speech API | Real-time speech-to-text using browser's built-in recognition |
| F9.2 | Whisper transcription | In-browser Whisper (via Transformers.js) for higher-quality offline transcription |
| F9.3 | Audio recording | Record audio clips; store as attachments; transcribe on demand |
| F9.4 | Language selection | Select transcription language; support for 100+ languages via Whisper |
| F9.5 | Insert at cursor | Transcribed text inserted at current cursor position |

## F10: Mobile & Responsive Design

| # | Sub-feature | Description |
|---|-------------|-------------|
| F10.1 | Responsive layout | Breakpoints at 1024px (tablet) and 768px (phone) |
| F10.2 | Capacitor packaging | Android APK + iOS IPA via Capacitor 6 |
| F10.3 | Touch gestures | Swipe sidebar open/close; long-press for context menu |
| F10.4 | Mobile toolbar | Compact formatting bar optimized for touch |
| F10.5 | Biometric lock | Fingerprint/Face ID lock via Capacitor biometrics plugin |

## F11: PWA & Service Worker

| # | Sub-feature | Description |
|---|-------------|-------------|
| F11.1 | Install prompt | Custom install banner with "Add to Home Screen" |
| F11.2 | Offline support | Full app functionality offline via Workbox service worker |
| F11.3 | Background sync | Queue changes while offline; sync when connectivity returns |
| F11.4 | Cache strategy | Cache-first for app shell; stale-while-revalidate for fonts/icons |
| F11.5 | Auto-update | Service worker update detection with refresh prompt |

## F12: Security & Privacy

| # | Sub-feature | Description |
|---|-------------|-------------|
| F12.1 | No server dependency | All data stored locally; zero mandatory network calls |
| F12.2 | AES-GCM encryption | API keys encrypted at rest using Web Crypto API |
| F12.3 | CSP headers | Strict Content-Security-Policy; no eval, no inline scripts in production |
| F12.4 | Sanitized preview | markdown-it with `html: false`; no raw HTML injection |
| F12.5 | Secure mermaid | Mermaid `securityLevel: 'strict'` to prevent diagram-based XSS |

## F13: Large Note Performance

| # | Sub-feature | Description |
|---|-------------|-------------|
| F13.1 | Viewport rendering | CodeMirror 6 virtual scrolling for 10,000+ line documents |
| F13.2 | Web Worker preview | Offload markdown-it rendering to Web Worker for non-blocking UI |
| F13.3 | Incremental parsing | Lezer incremental parser via CodeMirror for fast re-highlights |
| F13.4 | Lazy mermaid | Only render mermaid diagrams when scrolled into viewport (IntersectionObserver) |
| F13.5 | Minimap | Optional minimap scrollbar for large documents |
| F13.6 | Debounced updates | Preview and auto-save use separate debounce timers (300ms / 2000ms) |

## F14: Tips Bar

| # | Sub-feature | Description |
|---|-------------|-------------|
| F14.1 | Rotating tips | 30+ tips cycling every 30 seconds |
| F14.2 | Categories | Editor, AI, Search, Markdown, Mermaid, Snippets, Shortcuts |
| F14.3 | Collapsible | Click to collapse/expand; state persisted in localStorage |
| F14.4 | Dismiss/reset | Dismiss individual tips; reset all from settings |
| F14.5 | Contextual | Show relevant tip when user first uses a feature |
| F14.6 | All-tips drawer | "All tips" button opens full tip directory |

## F15: Accessibility

| # | Sub-feature | Description |
|---|-------------|-------------|
| F15.1 | ARIA landmarks | Proper roles on header, nav, main, aside, footer |
| F15.2 | Keyboard navigation | Full keyboard-only operation; focus management; skip links |
| F15.3 | Screen reader support | Meaningful labels, live regions for status updates |
| F15.4 | High contrast | Automatic high-contrast mode detection; forced-colors support |
| F15.5 | Reduced motion | Respect `prefers-reduced-motion`; disable animations |
| F15.6 | Focus indicators | Visible focus rings on all interactive elements |

## F16: Internationalization (i18n)

| # | Sub-feature | Description |
|---|-------------|-------------|
| F16.1 | 20 languages | English, Spanish, French, German, Portuguese, Italian, Dutch, Polish, Russian, Ukrainian, Chinese (Simplified), Chinese (Traditional), Japanese, Korean, Arabic, Hindi, Turkish, Vietnamese, Thai, Indonesian |
| F16.2 | JSON locale files | One JSON file per language; lazy-loaded on demand |
| F16.3 | RTL support | Arabic and Hebrew right-to-left layout |
| F16.4 | Language selector | Settings dropdown with flag icons |
| F16.5 | Date/number formatting | Locale-aware date, time, and number display via Intl API |

## F17: Visual Themes

| # | Sub-feature | Description |
|---|-------------|-------------|
| F17.1 | 8 built-in themes | Dark, Light, Nord, Dracula, Solarized Dark, Solarized Light, Monokai, GitHub |
| F17.2 | CSS custom properties | ~40 tokens per theme (backgrounds, text, borders, accents, syntax colors) |
| F17.3 | Accent color picker | 6 accent colors: Blue, Purple, Green, Orange, Pink, Teal |
| F17.4 | System preference | Auto switch dark/light based on OS `prefers-color-scheme` |
| F17.5 | Live preview | Theme changes apply instantly without page reload |
| F17.6 | Persisted | Selected theme/accent saved to IndexedDB settings |

## F18: Quick Snippets

| # | Sub-feature | Description |
|---|-------------|-------------|
| F18.1 | 25+ built-in snippets | Diagrams (8), Meeting (4), Project (5), Personal (4), Tables (3), Code (2) |
| F18.2 | `/trigger` activation | Type `/flowchart`, `/meeting`, `/journal` etc. in editor to trigger |
| F18.3 | Context-aware menu | CodeMirror autocomplete popup with category labels |
| F18.4 | Smart placeholders | `{{date}}` and `{{time}}` auto-replaced on insertion |
| F18.5 | Custom snippets | User-created snippets stored in IndexedDB; CRUD management |
| F18.6 | Import/export | Share snippet libraries as JSON |
