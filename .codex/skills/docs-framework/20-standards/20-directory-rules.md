---
covers: Physical organization of docs/ — three layers, mirroring source code, overview requirements, and folder vs file decisions.
concepts: [directory, layers, mirroring, overview, file-tree, foundation, system-design, implementation]
---

# Directory Organization

The physical organization of `docs/`. Three layers by kind of knowledge (Foundation/System Design/Implementation), path mirroring between Implementation layer and `src/`, the `00-overview.md` requirement for every directory, and guidelines for when to use folders vs files.

---

## Top-Level Structure: Three Layers

Every project using this framework organizes `docs/` into three layers:

```
docs/
├── 00-foundation/           # Manifesto. North star. Why and what. (freeform)
│   ├── 00-overview.md       # Required: entry point
│   └── [your structure]     # Numbered files capturing your understanding
├── 10-system-design/        # Architect's blueprints. System-agnostic.
│   ├── 00-overview.md       # Organized by concept
│   └── [concepts...]        # Session flow, data models, etc.
└── 20-implementation/       # Current codebase. Language/framework specific.
    ├── 00-overview.md       # L1
    ├── [sections...]        # L2-L3 (mirrors src/)
    └── 99-appendix/         # Operational (setup, tooling, infra)
```

- **Foundation** (`00-foundation/`): Freeform structure. Captures understanding of what you're building and why. Only `00-overview.md` is required.
- **System Design** (`10-system-design/`): Organized by concept, not code structure. Describes system behaviors, data flow, and architectural decisions independent of implementation.
- **Implementation** (`20-implementation/`): Mirrors your source code structure. Contains L1-L6 documentation. Includes `99-appendix/` for operational guidance.

---

## Implementation Layer: Mirror Your Code

Within the **Implementation layer**, documentation structure mirrors your application structure:

```
src/                          docs/20-implementation/
├── core/                     ├── 10-core/
│   ├── workflow/             │   ├── 10-workflow/
│   └── validation/           │   └── 20-validation/
├── data/                     ├── 20-data/
└── auth/                     └── 30-auth/
```

If you're working in `src/core/workflow/`, the documentation is in `docs/20-implementation/10-core/10-workflow/`.

**Exception**: Cross-cutting concerns (logging, caching, error handling) go in the most logical primary location rather than being scattered.

---

## The 00-overview.md Requirement

Every folder in docs/ MUST contain a `00-overview.md` file.

**Foundation Overview** — `docs/00-foundation/00-overview.md`:
- Entry point explaining what understanding is captured here
- Links to whatever documents comprise your Foundation
- Guidance on when to read Foundation (before diving into implementation)

**System Design Overview** — `docs/10-system-design/00-overview.md`:
- Index of documented systems/concepts
- Links to individual design documents

**Implementation Overview (L1)** — `docs/20-implementation/00-overview.md`:
- System architecture
- Section index with descriptions

**Section Overviews (L2)** — `docs/20-implementation/XX-section/00-overview.md`:
- Section scope and boundaries
- File tree of immediate children
- Brief description for each child

**Subsection Overviews** — Same structure, narrower scope.

---

## File Tree Format

Every 00-overview.md includes a file tree of immediate children:

```markdown
## File Tree

20-data/
├── 00-overview.md              (this file)
├── 10-models/
│   └── 00-overview.md
├── 20-repository-pattern.md
└── 30-migrations.md
```

Rules:
- Show only immediate children (one level deep)
- Include brief description after each item
- Mark "(this file)" for the overview

---

## Folders vs Files

**Create a folder when:**
- Topic needs 3+ related files
- Clear subcategory exists
- Content will grow over time

**Keep it as a file when:**
- Single concept, fully covered in one doc
- Unlikely to expand
- Creating a folder adds bureaucratic overhead

**The smell test**: If you're creating `XX-topic/00-overview.md` with only one other file in it, just use `XX-topic.md`.

---

## Reserved Layers and Sections

```
docs/
├── 00-foundation/           # Reserved: Intent layer (freeform)
├── 10-system-design/        # Reserved: Design layer (organized by concept)
└── 20-implementation/       # Reserved: Code documentation layer
    ├── 10-80 range          # Your application sections
    └── 99-appendix/         # Reserved: Operational sub-zone
```

- `00-foundation/` has freeform structure (only `00-overview.md` is required)
- `10-system-design/` is organized by concept, not by code structure
- `20-implementation/` uses 10-80 range for your application sections
- `20-implementation/99-appendix/` is for operational guidance (setup, tooling, infra)

---

## Anti-Patterns

### ❌ Flat Structure
```
docs/
├── user-model.md
├── auth-flow.md
└── api-endpoints.md
```
No hierarchy = hard to navigate.

### ❌ Over-Nesting
```
docs/10-app/10-backend/10-services/10-user/user-service.md
```
Too many levels = tedious traversal.

### ❌ Missing Overviews
```
20-data/
├── models.md        # No 00-overview.md!
└── queries.md
```
No entry point = no navigation aid.

---

## Complete Example

```
my-project/
├── README.md
├── docs/
│   ├── 00-foundation/                     # Intent layer (freeform)
│   │   ├── 00-overview.md
│   │   ├── 10-problem.md                  # Example: what we're solving
│   │   ├── 20-vision.md                   # Example: where we're heading
│   │   └── 30-approach.md                 # Example: how we'll get there
│   ├── 10-system-design/                  # Design layer (by concept)
│   │   ├── 00-overview.md
│   │   ├── 10-session-flow.md             # Example: system behavior
│   │   ├── 20-data-models.md              # Example: data architecture
│   │   └── 30-agent-architecture.md       # Example: agent design
│   └── 20-implementation/                 # Implementation layer
│       ├── 00-overview.md                 # L1
│       ├── 10-core/
│       │   ├── 00-overview.md             # L2
│       │   ├── 10-workflow-engine.md      # L3
│       │   └── 20-validation-rules.md
│       ├── 20-data/
│       │   ├── 00-overview.md
│       │   ├── 10-models/                 # Subsection
│       │   │   ├── 00-overview.md
│       │   │   ├── 10-user-model.md
│       │   │   └── 20-organization-model.md
│       │   └── 20-repository-pattern.md
│       ├── 30-auth/
│       │   ├── 00-overview.md
│       │   └── 10-jwt-strategy.md
│       └── 99-appendix/                   # Operational (setup, tooling)
│           ├── 00-overview.md
│           └── 10-setup-guide.md
└── src/                                   # Mirrors 20-implementation/
    ├── core/
    ├── data/
    └── auth/
```
