# Wireframes

## W1: Desktop — Main View (Split Mode)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [Q] QP Notes          │  🔍 Search notes... (tag:, date:)      │ [+ New] [⚙]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│  💡 Tip: Use /flowchart to insert a Mermaid diagram instantly      [All] [▴]    │
├────────────┬──────────────┬──────────────────────────────────────────────────────┤
│  Explorer  │  All Notes   │  Meeting Notes 2026-04-14                           │
│            │  3 notes     │  ─────────────────────────────────────────────────── │
│  📁 All    │              │  Tags: [meeting] [project-alpha]          [💾][⭐][🗑]│
│     Notes 3│  ■ Meeting   │  ─────────────────────────────────────────────────── │
│  ⭐ Fav.  1│    Apr 14 ⭐ │  [✏️ Edit] [👁 Preview] [⟷ Split]                     │
│            │    Meeting a │  ─────────────────────────────────────────────────── │
│  Tags      │    genda...  │  [B][I][S] | [H1][H2][H3] | [•][1.][☑] | ...       │
│  # meeting │              │  ═══════════════════════╦═══════════════════════════ │
│  # project │  ○ Project   │  ## Meeting Agenda      ║  Meeting Agenda           │
│  # journal │    Apr 13    │                         ║                           │
│            │    Project p │  - [ ] Review Q1 goals  ║  ☐ Review Q1 goals        │
│            │    lan and.. │  - [x] Budget approval  ║  ☑ Budget approval        │
│            │              │  - [ ] Team assignments  ║  ☐ Team assignments       │
│            │  ○ Journal   │                         ║                           │
│            │    Apr 12    │  ```mermaid              ║  ┌───────┐  ┌──────────┐  │
│            │    Today I.. │  flowchart LR            ║  │ Plan  │→│ Execute  │  │
│            │              │    A[Plan] --> B[Exec]   ║  └───────┘  └──────────┘  │
│            │              │  ```                     ║                           │
│            │              │                         ║  $E = mc^2$               │
│            │              │  $E = mc^2$             ║   (rendered KaTeX)        │
├────────────┴──────────────┴──────────────────────────────────────────────────────┤
│  ● Online — Ready                                         Ln 8, Col 12 │ v0.1.0│
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Layout Zones
- **Topbar** (48px): Logo, search bar with syntax hints, action buttons
- **Tips bar** (32px): Collapsible rotating tip with category icon
- **Sidebar Tree** (200px): Explorer with library sections + dynamic tag list
- **Sidebar File List** (260px): Scrollable note cards with sync badges, dates, tags, snippets
- **Editor Panel** (flex): Title input, tags input, view mode tabs, formatting toolbar, editor+preview

## W2: Settings Panel

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [Q] QP Notes                  Settings                              [✕ Close]  │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Appearance                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐         │
│  │  Theme:       [▼ Dark / Light / Nord / Dracula / Sol-D / Sol-L / ] │         │
│  │  Accent:      ● Blue  ○ Purple  ○ Green  ○ Orange  ○ Pink  ○ Teal │         │
│  │  Font size:   [13px ▼]                                             │         │
│  │  Auto theme:  [✓] Follow system dark/light preference              │         │
│  └─────────────────────────────────────────────────────────────────────┘         │
│                                                                                  │
│  Language                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐         │
│  │  Display:     [▼ English]  (20 languages available)                │         │
│  └─────────────────────────────────────────────────────────────────────┘         │
│                                                                                  │
│  AI / LLM                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐         │
│  │  Local Model: [▼ Phi-3-mini-4k]  Status: Downloaded (2.3 GB)      │         │
│  │  OpenAI Key:  [••••••••••••]  Model: [▼ gpt-4o-mini]              │         │
│  │  Claude Key:  [••••••••••••]  Model: [▼ claude-3.5-sonnet]        │         │
│  │  Gemini Key:  [••••••••••••]  Model: [▼ gemini-1.5-flash]         │         │
│  └─────────────────────────────────────────────────────────────────────┘         │
│                                                                                  │
│  Cloud Sync                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐         │
│  │  Google Drive:  [Connect]     OneDrive:  [Connect]                 │         │
│  │  Dropbox:       [Connect]     Auto-sync: [✓] Every 5 min          │         │
│  └─────────────────────────────────────────────────────────────────────┘         │
│                                                                                  │
│  Data                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐         │
│  │  [Export All Notes]  [Import Backup]  [Reset Tips]  [Clear Data]   │         │
│  └─────────────────────────────────────────────────────────────────────┘         │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## W3: Mobile View (< 768px)

```
┌─────────────────────────────┐
│  [☰] QP Notes    [🔍] [+]  │
├─────────────────────────────┤
│  💡 Use Ctrl+B for bold [▴] │
├─────────────────────────────┤
│  All Notes (3)              │
│                             │
│  ┌─────────────────────────┐│
│  │ ■ Meeting Notes    ⭐   ││
│  │   Apr 14 · #meeting     ││
│  │   Meeting agenda and... ││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ ○ Project Plan          ││
│  │   Apr 13 · #project     ││
│  │   Project plan and...   ││
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ ○ Daily Journal         ││
│  │   Apr 12 · #journal     ││
│  │   Today I worked on...  ││
│  └─────────────────────────┘│
│                             │
├─────────────────────────────┤
│  ● Online          v0.1.0  │
└─────────────────────────────┘

  ← Tap note card to open →

┌─────────────────────────────┐
│  [←] Meeting Notes  [💾][⋮]│
├─────────────────────────────┤
│  [Edit] [Preview] [Split]   │
├─────────────────────────────┤
│  [B][I] [H1][H2] [•][☑] ▸ │
├─────────────────────────────┤
│                             │
│  ## Meeting Agenda          │
│                             │
│  - [ ] Review Q1 goals     │
│  - [x] Budget approval     │
│  - [ ] Team assignments    │
│                             │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│  Ln 4, Col 1      v0.1.0   │
└─────────────────────────────┘
```

### Mobile Behaviors
- Hamburger menu toggles sidebar overlay
- Swipe right to open sidebar, swipe left to close
- Compact formatting toolbar with horizontal scroll
- Single pane view (edit OR preview, not split)

## W4: AI Panel (Slide-Out)

```
┌──────────────────────────────────────────────────┬──────────────────────┐
│  ... (editor content) ...                        │  AI Assistant   [✕]  │
│                                                  ├──────────────────────┤
│                                                  │  Provider: [▼ Local] │
│                                                  │  Model: Phi-3-mini   │
│                                                  ├──────────────────────┤
│                                                  │  Quick Actions:      │
│                                                  │  [Summarize]         │
│                                                  │  [Expand]            │
│                                                  │  [Fix Grammar]       │
│                                                  │  [Translate]         │
│                                                  │  [Simplify]          │
│                                                  │  [Custom Prompt...]  │
│                                                  ├──────────────────────┤
│                                                  │  Context: Selection  │
│                                                  │  ┌────────────────┐  │
│                                                  │  │ The quarterly  │  │
│                                                  │  │ review showed  │  │
│                                                  │  │ growth in...   │  │
│                                                  │  └────────────────┘  │
│                                                  ├──────────────────────┤
│                                                  │  Response:           │
│                                                  │  The Q1 review       │
│                                                  │  indicates strong█   │
│                                                  │  (streaming...)      │
│                                                  ├──────────────────────┤
│                                                  │  [Insert] [Replace]  │
│                                                  │  [Copy]  [Retry]     │
└──────────────────────────────────────────────────┴──────────────────────┘
```

### AI Panel Behaviors
- Slides in from right (320px wide)
- Uses current selection or full note as context
- Streaming token-by-token display
- Insert/Replace/Copy actions for the response
- Provider dropdown switches between local and cloud LLMs
