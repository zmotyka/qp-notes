# Technology Stack & Non-Functional Requirements

## Technology Stack

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| **Build Tool** | Vite | 7.x | Fast HMR, native ES modules, tree-shaking, PWA plugin ecosystem |
| **Language** | TypeScript | ~6.0 | Type safety, IDE tooling, refactoring confidence |
| **PWA** | vite-plugin-pwa + Workbox | Latest | Auto service worker generation, precaching, runtime caching strategies |
| **Editor** | CodeMirror 6 | Latest | Modular, extensible, virtual scrolling for large docs, mobile support, accessibility |
| **Markdown Rendering** | markdown-it | Latest | Pluggable, fast, CommonMark compliant, extensible with custom rules |
| **Syntax Highlighting** | highlight.js | Latest | 190+ languages, small bundle with selective loading |
| **Diagrams** | Mermaid.js | Latest | Flowcharts, sequence, gantt, mindmap, ER, state, pie, class diagrams |
| **Math** | KaTeX | Latest | Fast LaTeX rendering, smaller and faster than MathJax |
| **Offline Database** | Dexie.js | Latest | Promise-based IndexedDB wrapper, simple API, good TypeScript support |
| **Full-Text Search** | FlexSearch | Latest | Fast in-memory search, fuzzy matching, tokenization, zero dependencies |
| **Local LLM** | @mlc-ai/web-llm | Latest | 100% in-browser inference via WebGPU/WASM, no server needed |
| **PDF Parsing** | PDF.js | Latest | Mozilla's battle-tested PDF renderer, works in browser |
| **DOCX Import** | Mammoth.js | Latest | Semantic HTML from DOCX, preserves structure not formatting |
| **OCR** | Tesseract.js | Latest | In-browser OCR, 100+ languages, WASM-based |
| **Speech** | Web Speech API + Transformers.js | Latest | Browser-native STT + Whisper model for offline high-quality transcription |
| **Encryption** | Web Crypto API | Native | Browser-native AES-GCM for API key encryption, no external deps |
| **Mobile** | Capacitor | 6.x | Web-to-native bridge; Android + iOS from same codebase |
| **Icons** | SVG inline | — | Zero-dependency icons; small, colored via CSS currentColor |
| **Fonts** | DM Sans + DM Mono | Google | Clean UI font + monospace for code; loaded via Google Fonts |

## Non-Functional Requirements

| NFR | Target | Measurement |
|-----|--------|-------------|
| **First Contentful Paint** | < 1.0s | Lighthouse on 4G throttle |
| **Time to Interactive** | < 2.0s | Lighthouse on 4G throttle |
| **Largest Contentful Paint** | < 2.5s | Core Web Vitals |
| **Cumulative Layout Shift** | < 0.1 | Core Web Vitals |
| **Editor Keystroke Latency** | < 16ms | requestAnimationFrame measurement |
| **10,000-line note** | No jank | 60fps scrolling, < 50ms re-highlight |
| **Preview Render** | < 300ms | For a 5,000-word document |
| **Search Latency** | < 50ms | FlexSearch query on 1,000 notes |
| **Auto-save Debounce** | 2 seconds | Time from last keystroke to IndexedDB write |
| **Preview Debounce** | 300ms | Time from last keystroke to preview re-render |
| **Service Worker Cache** | < 5 MB | App shell + critical assets |
| **Offline Startup** | < 1.5s | From service worker cache |
| **Bundle Size (app shell)** | < 500 KB gzipped | Excluding fonts and LLM model weights |
| **LLM Model Download** | Show progress | With cancel option and space estimate |
| **Accessibility** | WCAG 2.1 AA | Axe audit, keyboard-only testing |
| **i18n Coverage** | 20 languages | All UI strings translated |
| **Theme Switch** | < 50ms | No page reload, CSS custom property swap |
| **Sync Conflict** | User-resolved | Never silently overwrite; three-way merge |
| **Encryption** | AES-256-GCM | For API keys at rest via Web Crypto |
| **CSP** | Strict policy | No eval, no inline scripts, nonce-based |
| **Browser Support** | Chrome 110+, Firefox 115+, Safari 16+, Edge 110+ | Progressive enhancement for WebGPU |

## Bundle Strategy

```
dist/
├── index.html                    # App shell (< 1 KB)
├── assets/
│   ├── index-[hash].js           # Main app bundle (ES modules)
│   ├── index-[hash].css          # Combined styles
│   ├── vendor-codemirror-[hash].js  # CodeMirror chunk
│   ├── vendor-markdown-[hash].js    # markdown-it + hljs chunk
│   ├── vendor-mermaid-[hash].js     # Mermaid (lazy-loaded)
│   ├── vendor-katex-[hash].js       # KaTeX (lazy-loaded)
│   └── KaTeX_*.woff2              # Math fonts
├── registerSW.js                 # Service worker registration
├── sw.js                         # Workbox service worker
├── manifest.json                 # PWA manifest
└── icons/                        # PWA icons
```

### Chunk Strategy
- **Main bundle**: App shell, editor, preview, DB, theme, tips, snippets
- **Mermaid**: Lazy-loaded on first diagram render
- **KaTeX fonts**: Loaded on demand when math expressions exist
- **AI modules**: Code-split; loaded only when user opens AI panel
- **Import modules**: PDF.js, Mammoth.js, Tesseract.js each lazy-loaded on file drop
