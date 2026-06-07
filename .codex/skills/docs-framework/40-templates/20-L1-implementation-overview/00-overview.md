---
covers: Templates for L1 Implementation Overview — the top-level system architecture document.
type: overview
concepts: [templates, L1, implementation, architecture, overview]
---

# L1 Implementation Overview Templates

Templates for the L1 Implementation Overview — the single document at `docs/20-implementation/00-overview.md` that describes the system's architecture and serves as the navigation hub for all implementation documentation.

---

## Archetypes

| Template | Description |
|----------|-------------|
| **10-generic.md** | Standard implementation overview with architecture, mental model, and section index |
| **20-readme.md** | Repository root README with setup links and documentation navigation |

L1 typically has one implementation overview template since there's only one per project. The README template is included here as it's the human-friendly companion to the L1 overview.

## File Tree

```
20-L1-implementation-overview/
├── 00-overview.md      (this file)
├── 10-generic.md       Standard implementation overview template
└── 20-readme.md        Repository README template
```

## Contents

### [10-generic.md](10-generic.md)
The standard L1 template. Includes system metaphor, high-level architecture diagram, key architectural decisions, file tree, section index, and cross-cutting concerns. Works for most project types.

### [20-readme.md](20-readme.md)
Template for the repository root README.md. Human-friendly project introduction with links to setup and documentation.
