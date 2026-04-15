# Gap Analysis & Recommendations

## Original Recommendations

15 recommendations were identified during the initial gap analysis. Recommendations marked **[PROMOTED]** are now required features in the specification.

| # | Recommendation | Status | Feature Group |
|---|---------------|--------|---------------|
| 1 | **Note version history with diff viewer** | **[PROMOTED]** | F3.8 |
| 2 | **Full export/import backup (ZIP)** | **[PROMOTED]** | F3.9 |
| 3 | Real-time collaboration / sharing | Excluded — low priority for single-user app | — |
| 4 | **Keyboard shortcuts for all major actions** | **[PROMOTED]** | F1.13 |
| 5 | **Table of Contents auto-generation** | **[PROMOTED]** | F1.11 |
| 6 | Rate limiting for external LLM API calls | Excluded — low priority | — |
| 7 | **Note templates (meeting, journal, project, etc.)** | **[PROMOTED]** | F6.8 |
| 8 | **Internationalization — 20 languages with RTL** | **[PROMOTED]** | F16 |
| 9 | **Full accessibility (WCAG 2.1 AA)** | **[PROMOTED]** | F15 |
| 10 | **Pinned/favorited notes** | **[PROMOTED]** | F8.7 |
| 11 | **Onboarding flow for new users** | **[PROMOTED]** | Phase 10.3 |
| 12 | **Error boundaries and graceful degradation** | **[PROMOTED]** | Phase 10.7 |
| 13 | **Performance optimization for large notes** | **[PROMOTED]** | F13 |
| 14 | **Biometric lock on mobile** | **[PROMOTED]** | F10.5 |
| 15 | **CSP headers and security hardening** | **[PROMOTED]** | F12.3 |

### Summary
- **13 of 15** recommendations promoted to required features
- **2 excluded**: collaboration/sharing (#3) and rate limiting (#6)

---

## V2 Additions (User-Requested Expansions)

These additions were requested after the initial specification and have been integrated:

### 1. Super Fast Responsiveness for 10,000-Line Notes
- Added **F13: Large Note Performance** with viewport rendering, Web Worker preview, incremental parsing, lazy mermaid, and minimap
- Target: 60fps scrolling, <50ms re-highlight on 10K-line documents

### 2. Tips Bar
- Added **F14: Tips Bar** with 30+ rotating tips, 7 categories, collapsible UI, contextual tips, all-tips drawer
- Tips bar integrated into the topbar area as a collapsible strip

### 3. Hyperlink Entry and Navigation
- Added **F1.8–F1.12** to Core Editor: hyperlinks, wiki-links, backlinks, TOC, KaTeX math
- Links are clickable in both editor (via MatchDecorator) and preview
- Wiki-links `[[Note Title]]` cross-reference between notes

### 4. Promoted Recommendations
- 13 of 15 original recommendations promoted to required features (see table above)
- Only collaboration/sharing and rate limiting excluded

### 5. Dark, Light, and Additional Visual Themes
- Added **F17: Visual Themes** with 8 built-in themes
- Each theme defines ~40 CSS custom property tokens
- 6 accent colors with live preview
- System preference detection for auto dark/light

### 6. Quick Snippets with Intelligent Inline Context Menu
- Added **F18: Quick Snippets** with 25+ built-in snippets across 6 categories
- `/trigger` activation via CodeMirror autocomplete
- Smart placeholders (`{{date}}`, `{{time}}`) resolved on insertion
- Categories: Diagrams (8), Meeting (4), Project (5), Personal (4), Tables (3), Code (2)

---

## Gaps Remaining (Future Considerations)

These are potential future features not currently in scope:

| Gap | Description | Priority |
|-----|-------------|----------|
| Collaboration | Real-time multi-user editing (CRDTs) | Low |
| Plugin system | Third-party extensions / marketplace | Medium |
| Custom CSS | User-authored theme customization | Low |
| Spaced repetition | Flashcard generation from notes | Low |
| Graph view | Visual knowledge graph of linked notes | Medium |
| API rate limiting | Throttle external LLM calls | Low |
| E2E encryption | Full note encryption at rest | Medium |
| Web clipper | Browser extension to clip web pages | Medium |

---

## UX Review — Design Improvements

The following items were identified during a UX review and have been added to the implementation plan:

| # | Improvement | Phase | Rationale |
|---|------------|-------|-----------|
| UX-1 | **Minimize Sidebar Clutter** — Move TOC and pinned notes into a swipeable bottom drawer on mobile | Phase 9 (9.9) | Maximizes vertical editing space on small screens |
| UX-2 | **Enhance Visual Hierarchy** — Subtle background gradients or mesh textures in the dark theme | Phase 10 (10.11) | Reduces eye strain during long-form technical writing sessions |
| UX-3 | **Contextual Performance Feedback** — Real-time "saving" / frame-rate indicator in the status bar | Phase 10 (10.12) | Gives users confidence in the app's high-speed responsiveness |
