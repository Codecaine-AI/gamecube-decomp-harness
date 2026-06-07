---
covers: Three-layer organization (Foundation/System Design/Implementation) and six-layer hierarchy (L1-L6) within Implementation.
concepts: [zones, layers, L1, L2, L3, L4, L5, L6, foundation, system-design, implementation]
---

# The Hierarchy: Layers and Depth

The framework uses two complementary organization schemes: **Layers** (horizontal) organize by kind of knowledge, **Depth levels** (vertical, L1-L6) organize by detail within the Implementation layer. Together they create navigable documentation from project intent to implementation.

---

## Two Dimensions of Organization

This framework uses two complementary organization schemes:

- **Layers** (horizontal): Organize by kind of knowledge — Foundation, System Design, Implementation
- **Depth levels** (vertical): Organize by depth of detail — L1 through L6 within Implementation

```
docs/
├── 00-foundation/           # Manifesto. North star. Why and what.
│   ├── 00-overview.md
│   └── ...                  # Freeform structure
├── 10-system-design/        # Architect's blueprints. System-agnostic.
│   ├── 00-overview.md       # Organized by concept
│   └── ...
└── 20-implementation/       # Current codebase. Language/framework specific.
    ├── 00-overview.md       # L1: Navigation hub
    ├── 10-[section]/        # L2: Domain overviews
    │   ├── 00-overview.md
    │   └── [L3 nodes]
    ├── ...
    └── 99-appendix/         # Operational (setup, tooling, infra)
        └── ...
```

---

## The Three Layers

### Foundation (`00-foundation/`)

Captures understanding before implementation—the thinking layer where you work through what you're building and why.

This is NOT a PRD or formal requirements document. It's exploratory: capturing how you understand the problem, the shape of the solution, and the direction you're heading. Think of it as the artifact of your thinking process.

**Required**:
- `00-overview.md`: Entry point explaining what this section contains

**Structure is freeform**. Use numbered files (10-, 20-, etc.) organized however captures your understanding. Example patterns:

| Pattern | Example Files | Captures |
|---------|---------------|----------|
| Problem-focused | `10-problem.md`, `20-landscape.md`, `30-approach.md` | What's broken, what exists, how we'll tackle it |
| Vision-focused | `10-vision.md`, `20-constraints.md`, `30-direction.md` | Where we're going, what shapes the path, how we'll move |
| Thinking-focused | `10-context.md`, `20-ideas.md`, `30-decisions.md` | Background, explorations, choices made |
| Narrative | `10-story.md` | Single document walking through the whole understanding |

The goal: someone reading Foundation should understand *what you're trying to do* and *how you're thinking about it*—before they ever look at how it's implemented.

**Update frequency**: Rarely — only when the north star, project identity, or fundamental approach shifts.

### System Design (`10-system-design/`)

Architect's blueprints. Describes system behaviors, data flow, and architectural decisions independent of code structure.

**Organized by concept** — session flow, agent architecture, data models — not by code location. This is the layer you read before making changes to understand the *intended* behavior of a system.

**Contains**:
- System-agnostic descriptions of how things work and why
- Data models, state machines, interaction flows
- Architectural decisions and trade-offs
- Cross-cutting concerns (auth, logging, error handling patterns)

**Structure**: Numbered files organized by concept. No strict hierarchy — flat or shallow nesting, whatever fits the concepts being documented.

**Update frequency**: Less frequently — when system behaviors or architecture change, not on every code change.

### Implementation (`20-implementation/`)

Documents what was built and how it works. Mirrors the source code structure.

**Contains**: The L1-L6 hierarchy (detailed below), plus an appendix sub-zone:
- `99-appendix/`: Operational guidance — setup guides, deployment instructions, tooling configuration, infrastructure conventions

**Organized by code structure** — backend, frontend, database — matching the source tree.

**Update frequency**: Most sessions — even small changes may update L4-L5 headers/docstrings.

---

## The Six Depth Levels (Within Implementation Layer)

The L1-L6 hierarchy lives within the Implementation layer and creates a depth-based structure:

```
Repository Root              → README.md (Human entry point)
L1: Implementation Overview  → docs/20-implementation/00-overview.md
L2: Section Overviews        → Major domains with file trees
L3: Atomic Nodes             → Single concepts, rules, patterns (with code references)
L4: File Headers             → What a file is responsible for
L5: Function Docstrings      → What a function does
L6: Implementation           → How it actually works
```

---

## Repository Root: The Human Entry Point

### File
`README.md` at repository root

### Purpose
- Human-friendly landing page for developers who just cloned the repo
- Allows for easy reading in a GitHub repo as ReadMe's are rendered on the page

### Contains
- Quick explanation of what the application does
- Direct links to practical tasks (setup, deployment, getting started)
- Link to formal documentation entry (docs/00-overview.md)
- Feature highlights and project status

---

## L1: Implementation Overview

### File
`docs/20-implementation/00-overview.md`

### Purpose
Formal documentation entry point for understanding how the system is built.

### Contains
- System's high-level architecture
- Major architectural decisions
- Section index with descriptions of each section
- Links to all L2 section overviews

---

## L2: Section/Domain Overviews

### Files
`docs/20-implementation/XX-section/00-overview.md`

### Purpose
Scoped overviews for major areas (Core, Data Layer, API, Auth, etc.)

### Contains
- File tree showing immediate children (not exhaustive)
- Coverage of the section
- Descriptions for each child node
- Links to L3 nodes with descriptive anchor text

### Template
See [30-section-overview-template.md](../40-templates/30-section-overview-template.md) for structure and examples.

---

## L3: Atomic Nodes (Concepts, Rules, Patterns)

### Files
Individual markdown files in section directories

### Purpose
One coherent idea per file

### Contains
- Single concept, pattern, or architectural decision
- Links to related L3 nodes
- May include diagrams or examples
- Inline references to code files as concepts are discussed
- Optional "Related Files" summary for complex topics

### Characteristics
- **Atomic**: Cannot be split further without losing coherence
- **Link-rich**: Dense cross-referencing
- **Declarative**: States what exists now and why it matters, not how it changed
- **Code-connected**: References implementation files naturally in prose

---

## L4: Top-of-Code-File Headers

### Location
First 30-50 lines of code files (as comments)

### Purpose
Bridge between documentation and code - explains "What" without "How"

### Contains
- File path and summary
- Responsibilities (2-3 bullet points)
- Inputs/Outputs and key dependencies
- Contracts, invariants, and error semantics
- Public API exports

### Template
See [50-code-header-template.md](../40-templates/50-code-header-template.md) for structure and examples.

### Critical Rule
Must be ≤50 lines to maintain scannability

---

## L5: Function/Method Docstrings

### Location
Above each major function in code

### Purpose
Concise contract for individual functions

### Contains
- Purpose statement (starts with "Do:")
- Inputs with constraints
- Outputs and side effects
- Pre/post conditions
- Error cases
- Complexity notes if relevant

### Template
See [60-docstring-template.md](../40-templates/60-docstring-template.md) for structure and examples.

---

## L6: Implementation (Code)

### Location
The actual code following headers and docstrings

### Purpose
The "How" - actual implementation details

### Key Point
This is the final layer - read only after L4/L5 indicate this is the right file/function
