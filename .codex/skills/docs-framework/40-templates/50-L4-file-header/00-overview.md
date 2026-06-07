---
covers: Templates for L4 File Headers — top-of-file documentation in source code.
type: overview
concepts: [templates, L4, file-header, code, documentation]
---

# L4 File Header Templates

Templates for L4 File Headers — the documentation block at the top of source code files that describes responsibilities, dependencies, and public API.

---

## Archetypes

| Template | Use When Documenting... |
|----------|-------------------------|
| **10-generic.md** | Contains two modes: Component (classes/modules) and Process (scripts/routers) |

The generic template includes two modes to handle different file types:
- **Mode A (Component)**: For classes/modules that provide multiple capabilities
- **Mode B (Process)**: For files that execute a specific linear task

## File Tree

```
50-L4-file-header/
├── 00-overview.md      (this file)
└── 10-generic.md       Component and Process modes
```

## Contents

### [10-generic.md](10-generic.md)
The standard L4 template with two modes. Component mode for service classes and utilities; Process mode for scripts, routers, and entry points.
