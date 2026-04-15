/* ─── Built-in snippets triggered by / at start of line ─── */

export interface SnippetDef {
  trigger: string;
  title: string;
  category: string;
  body: string;
}

const d = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

export const BUILTIN_SNIPPETS: SnippetDef[] = [
  // ─── Diagrams ───
  {
    trigger: '/mindmap',
    title: 'Mind Map',
    category: 'Diagrams',
    body: '```mermaid\nmindmap\n  root((Central Topic))\n    Branch A\n      Leaf A1\n      Leaf A2\n    Branch B\n      Leaf B1\n      Leaf B2\n    Branch C\n      Leaf C1\n    Branch D\n```\n',
  },
  {
    trigger: '/flowchart',
    title: 'Flowchart',
    category: 'Diagrams',
    body: '```mermaid\nflowchart LR\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]\n    C --> E[End]\n    D --> E\n```\n',
  },
  {
    trigger: '/sequence',
    title: 'Sequence Diagram',
    category: 'Diagrams',
    body: '```mermaid\nsequenceDiagram\n    participant A as Actor 1\n    participant B as Actor 2\n    A->>B: Request\n    B-->>A: Response\n    A->>B: Confirm\n```\n',
  },
  {
    trigger: '/gantt',
    title: 'Gantt Chart',
    category: 'Diagrams',
    body: `\`\`\`mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Task 1           :a1, ${d()}, 7d
    Task 2           :after a1, 5d
    section Phase 2
    Task 3           :2026-05-01, 10d
    Task 4           :after a1, 3d
\`\`\`
`,
  },
  {
    trigger: '/state',
    title: 'State Diagram',
    category: 'Diagrams',
    body: '```mermaid\nstateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing : Start\n    Processing --> Complete : Finish\n    Processing --> Error : Fail\n    Error --> Idle : Reset\n    Complete --> [*]\n```\n',
  },
  {
    trigger: '/erd',
    title: 'ER Diagram',
    category: 'Diagrams',
    body: '```mermaid\nerDiagram\n    USER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains\n    PRODUCT ||--o{ LINE_ITEM : "is in"\n    USER {\n        string name\n        string email\n    }\n    ORDER {\n        int id\n        date created\n    }\n```\n',
  },
  {
    trigger: '/pie',
    title: 'Pie Chart',
    category: 'Diagrams',
    body: '```mermaid\npie title Distribution\n    "Category A" : 40\n    "Category B" : 30\n    "Category C" : 20\n    "Category D" : 10\n```\n',
  },
  {
    trigger: '/class',
    title: 'Class Diagram',
    category: 'Diagrams',
    body: '```mermaid\nclassDiagram\n    class Animal {\n        +String name\n        +int age\n        +makeSound()\n    }\n    class Dog {\n        +fetch()\n    }\n    Animal <|-- Dog\n```\n',
  },

  // ─── Meeting ───
  {
    trigger: '/agenda',
    title: 'Meeting Agenda',
    category: 'Meeting',
    body: `# Meeting Agenda

**Date:** {{date}}
**Time:** 
**Location:** 
**Attendees:** 

---

## Agenda Items

1. **Welcome & Roll Call** (5 min)
2. **Review Previous Actions** (10 min)
3. **Topic 1** (15 min)
4. **Topic 2** (15 min)
5. **Open Discussion** (10 min)
6. **Next Steps & Action Items** (5 min)

---

## Action Items

| # | Action | Owner | Due Date |
|---|--------|-------|----------|
| 1 |        |       |          |
| 2 |        |       |          |

## Notes

`,
  },
  {
    trigger: '/minutes',
    title: 'Meeting Minutes',
    category: 'Meeting',
    body: `# Meeting Minutes

**Date:** {{date}}
**Attendees:** 

---

## Decisions Made

1. 
2. 

## Action Items

| # | Action | Owner | Due Date | Status |
|---|--------|-------|----------|--------|
| 1 |        |       |          | ⬜     |
| 2 |        |       |          | ⬜     |

## Key Discussion Points

### Topic 1


### Topic 2


## Next Meeting

**Date:** 
**Agenda:** 
`,
  },
  {
    trigger: '/standup',
    title: 'Standup Notes',
    category: 'Meeting',
    body: `# Daily Standup — {{date}}

## ✅ Yesterday
- 

## 📋 Today
- 

## 🚧 Blockers
- None
`,
  },
  {
    trigger: '/retro',
    title: 'Retrospective',
    category: 'Meeting',
    body: `# Retrospective — {{date}}

## 🟢 What Went Well
- 

## 🔴 What Didn't Go Well
- 

## 💡 Ideas / Improvements
- 

## 📋 Action Items

| # | Action | Owner |
|---|--------|-------|
| 1 |        |       |
`,
  },

  // ─── Project ───
  {
    trigger: '/project',
    title: 'Project Plan',
    category: 'Project',
    body: `# Project Plan

## Overview


## Goals
1. 
2. 
3. 

## Milestones

| Milestone | Target Date | Status |
|-----------|------------|--------|
|           |            | ⬜     |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
|      |        |            |

## Timeline

\`\`\`mermaid
gantt
    title Project Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1
    Planning      :a1, ${d()}, 7d
    Development   :after a1, 14d
\`\`\`
`,
  },
  {
    trigger: '/swot',
    title: 'SWOT Analysis',
    category: 'Project',
    body: `# SWOT Analysis

| **Strengths** 💪 | **Weaknesses** ⚠️ |
|---|---|
|   |   |
|   |   |

| **Opportunities** 🚀 | **Threats** 🔥 |
|---|---|
|   |   |
|   |   |
`,
  },
  {
    trigger: '/decision',
    title: 'Decision Log',
    category: 'Project',
    body: `# Decision Log

**Date:** {{date}}
**Decision:** 

## Context


## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| A      |      |      |
| B      |      |      |

## Outcome


## Follow-up Actions
- 
`,
  },
  {
    trigger: '/bug',
    title: 'Bug Report',
    category: 'Project',
    body: `# Bug Report

**Date:** {{date}}
**Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
**Reporter:** 

## Steps to Reproduce
1. 
2. 
3. 

## Expected Behavior


## Actual Behavior


## Environment
- OS: 
- Browser: 
- Version: 

## Screenshots / Logs

`,
  },
  {
    trigger: '/feature',
    title: 'Feature Request',
    category: 'Project',
    body: `# Feature Request

**Date:** {{date}}

## Problem Statement


## Proposed Solution


## Alternatives Considered


## Acceptance Criteria
- [ ] 
- [ ] 
- [ ] 

## Notes

`,
  },

  // ─── Personal ───
  {
    trigger: '/journal',
    title: 'Journal Entry',
    category: 'Personal',
    body: `# Journal — {{date}}

**Mood:** 😊 / 😐 / 😔

## Highlights
- 

## Reflections


## Gratitude
1. 
2. 
3. 
`,
  },
  {
    trigger: '/reading',
    title: 'Reading Notes',
    category: 'Personal',
    body: `# Reading Notes

**Title:** 
**Author:** 
**Date Started:** {{date}}

## Key Ideas
1. 
2. 
3. 

## Favorite Quotes
> 

## Takeaways


## Rating: ⭐⭐⭐⭐⭐
`,
  },
  {
    trigger: '/cornell',
    title: 'Cornell Notes',
    category: 'Personal',
    body: `# Cornell Notes — {{date}}

**Topic:** 

| Cues / Questions | Notes |
|---|---|
| | |
| | |
| | |
| | |

---

## Summary

`,
  },
  {
    trigger: '/weekly',
    title: 'Weekly Review',
    category: 'Personal',
    body: `# Weekly Review — {{date}}

## ✅ Accomplishments
- 

## 🚧 Challenges
- 

## 🎯 Next Week Goals
1. 
2. 
3. 

## 📝 Notes

`,
  },

  // ─── Tables ───
  {
    trigger: '/compare',
    title: 'Comparison Table',
    category: 'Tables',
    body: `## Comparison

| Criteria | Option A | Option B | Option C |
|----------|----------|----------|----------|
| Cost     |          |          |          |
| Quality  |          |          |          |
| Speed    |          |          |          |
| Support  |          |          |          |

**Winner:** 
`,
  },
  {
    trigger: '/proscons',
    title: 'Pros & Cons',
    category: 'Tables',
    body: `## Pros & Cons

| ✅ Pros | ❌ Cons |
|---------|---------|
|         |         |
|         |         |
|         |         |

**Conclusion:** 
`,
  },
  {
    trigger: '/checklist',
    title: 'Checklist',
    category: 'Tables',
    body: `## Checklist

- [ ] Item 1
- [ ] Item 2
- [ ] Item 3
- [ ] Item 4
- [ ] Item 5
`,
  },

  // ─── Code ───
  {
    trigger: '/codereview',
    title: 'Code Review',
    category: 'Code',
    body: `# Code Review

**File:** 
**Author:** 
**Date:** {{date}}

## Summary of Changes


## Issues Found

| # | Severity | Description | Line |
|---|----------|-------------|------|
| 1 |          |             |      |

## Suggestions
- 

## Approved: ⬜ Yes / ⬜ No
`,
  },
  {
    trigger: '/api',
    title: 'API Documentation',
    category: 'Code',
    body: `# API Endpoint

**Method:** \`GET\` / \`POST\` / \`PUT\` / \`DELETE\`
**URL:** \`/api/v1/\`
**Auth:** Bearer Token

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
|      |      |          |             |

## Request Body

\`\`\`json
{

}
\`\`\`

## Response

\`\`\`json
{

}
\`\`\`

## Example

\`\`\`bash
curl -X GET "https://api.example.com/v1/" -H "Authorization: Bearer TOKEN"
\`\`\`
`,
  },
];
