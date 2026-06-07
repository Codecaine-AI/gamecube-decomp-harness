---
covers: Reusable templates for every layer of the documentation hierarchy.
type: overview
concepts: [templates, foundation, implementation, L1, L2, L3, L4, L5, archetypes]
---

# Templates

Reusable templates organized by documentation layer. Each layer folder contains archetypes — different template patterns suited to different types of content.

---

## Principles Over Prescriptions

Templates are examples, not mandates.

This framework teaches principles:

- Overviews must give working understanding at that level
- Sections must have clear boundaries and interfaces
- Progressive revelation from general to specific
- Domain language throughout

How you achieve these principles varies by what you're documenting:

- A real-time event system looks different from a CRUD API
- A data pipeline looks different from a UI component library

Templates provide starting points ("here's how a service section might look"). Use them as guides, blend elements, or write something entirely custom.

The principle is what matters: can someone understand this system well enough to work on it?

L2 Section Overviews get multiple archetypes because sections vary widely (services vs. domains vs. infrastructure). Other layers are more uniform.

## File Tree

```
40-templates/
├── 00-overview.md                    (this file)
├── 10-foundation/                    Foundation zone templates
│   ├── 00-overview.md
│   ├── 10-foundation-overview.md
│   ├── 20-purpose.md
│   ├── 30-principles.md
│   └── 40-boundaries.md
├── 20-L1-implementation-overview/    L1: Implementation overview + README
│   ├── 00-overview.md
│   ├── 10-generic.md
│   └── 20-readme.md
├── 30-L2-section-overview/           L2: Section overviews (6 archetypes)
│   ├── 00-overview.md
│   ├── 10-generic.md
│   ├── 20-service-system.md
│   ├── 30-domain-module.md
│   ├── 40-library-package.md
│   ├── 50-data-layer.md
│   ├── 60-infrastructure.md
│   └── 70-pipeline-workflow.md
├── 40-L3-concept/                    L3: Atomic concept documentation
│   ├── 00-overview.md
│   └── 10-generic.md
├── 50-L4-file-header/                L4: Code file headers
│   ├── 00-overview.md
│   └── 10-generic.md
└── 60-L5-docstring/                  L5: Function docstrings
    ├── 00-overview.md
    └── 10-generic.md
```

## Layer Overview

### [10-foundation/](10-foundation/00-overview.md)
**Fixed-structure templates** for the Foundation zone. Purpose, principles, and boundaries — these documents have a standard structure that doesn't vary by project type.

### [20-L1-implementation-overview/](20-L1-implementation-overview/00-overview.md)
**System architecture template** for the L1 implementation overview (`docs/20-implementation/00-overview.md`). Includes mental model, architecture diagram, and section index. Also contains the README template.

### [30-L2-section-overview/](30-L2-section-overview/00-overview.md)
**Multiple archetypes** for L2 section overviews. Different sections need different structures:

| Archetype | Use When |
|-----------|----------|
| Generic | Default starting point |
| Service/System | Backend services with APIs |
| Domain/Module | Business logic with rules |
| Library/Package | Reusable code with public API |
| Data Layer | Models and persistence |
| Infrastructure | Deployment and DevOps |
| Pipeline/Workflow | ETL and processing flows |

### [40-L3-concept/](40-L3-concept/00-overview.md)
**Atomic documentation** for individual concepts. One complete topic per file with context, flow, data models, and code references.

### [50-L4-file-header/](50-L4-file-header/00-overview.md)
**Code file headers** in two modes: Component (for service classes) and Process (for scripts/routers).

### [60-L5-docstring/](60-L5-docstring/00-overview.md)
**Function docstrings** that scale by complexity — from one-liners to full documentation with flows and side effects.

---

## Using Templates

1. **Navigate to the layer folder** matching what you're documenting
2. **Read the overview** to understand available archetypes
3. **Pick the archetype** that best fits your content
4. **Copy and adapt** — templates are starting points, not rigid forms
