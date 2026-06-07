---
covers: Template for the L1 Implementation Overview navigation hub.
concepts: [L1, implementation, architecture, overview, navigation]
---

# L1 Implementation Overview Template

Template for `docs/20-implementation/00-overview.md`. This is the navigation hub for understanding how the system is built — the "shape" of the implementation.

---

**Purpose:**
- Explains how major systems interact (Architecture)
- Acts as the central router to all L2 sections within Implementation
- Provides the "shape" of the implementation

**Note:** Purpose, principles, and boundaries live in Foundation. This template focuses on *how* the system is built, not *why*.

## Template

<template>

    ---
    covers: High-level architecture, system structure, and navigation index for the implementation documentation.
    type: overview
    ---

    # {Project Name}: System Architecture (L1)

    [1-2 sentences: "How to think about this system." Is it a modular monolith? Event-driven microservices? CLI with functional core? Give the agent the "shape" of the application.]

    ---

    ## System Metaphor / Mental Model
    {1-2 paragraphs expanding on the opening. Help the reader build a mental model before diving into details.}

    ## High-Level Architecture

    ### The Big Picture
    {Explain the primary data flow. e.g., "Requests enter via API Gateway -> Processed by Workflow Engine -> State persisted in Postgres."}

    ```mermaid
    graph TD
        A[{Component A}] --> B[{Component B}]
        B --> C[{Component C}]
    ```

    ### Key Architectural Decisions
    {Brief notes on major technical choices. For the "why" behind these decisions, see [Foundation/principles](../00-foundation/20-principles.md).}

    - **{Decision 1}**: {e.g., "PostgreSQL for persistence"}
    - **{Decision 2}**: {e.g., "Event sourcing for audit trail"}

    ## File Tree

    ```
    docs/20-implementation/
    ├── 00-overview.md                 (this file)
    ├── {10-section-a}/                {Brief description}
    ├── {20-section-b}/                {Brief description}
    ├── {30-section-c}/                {Brief description}
    └── ...
    ```

    ## Section Index

    ### [{10-section-a}/]({10-section-a}/00-overview.md)
    **{Role Metaphor}.** {What this section contains and why it exists.}

    ### [{20-section-b}/]({20-section-b}/00-overview.md)
    **{Role Metaphor}.** {What this section contains and why it exists.}

    ### [{30-section-c}/]({30-section-c}/00-overview.md)
    **{Role Metaphor}.** {What this section contains and why it exists.}

    ## Cross-Cutting Concerns
    {Briefly mention where to find things that touch everything}
    - **{Concern 1}**: See [{path-to-doc}]({path-to-doc})
    - **{Concern 2}**: See [{path-to-doc}]({path-to-doc})

    ## Related
    - [Foundation](../00-foundation/00-overview.md) - Purpose, principles, and boundaries
    - [System Design](../10-system-design/00-overview.md) - Architecture and design rationale
    - [Appendix](./99-appendix/00-overview.md) - Setup guides and operational docs

</template>

## Usage Guidelines

### The Opening Paragraph
This is the SKIM layer. An agent reading just the opening should understand the system's architecture style without reading further.

### The "Mental Model" Section
This is critical for AI. If your app uses a specific pattern (e.g., Redux-style state management, Hexagonal Architecture), explicitly state it here. This prevents the AI from hallucinating standard MVC patterns where they don't exist.

### Key Architectural Decisions vs Foundation/Principles
- **Here**: *What* technical decisions were made (PostgreSQL, event sourcing, etc.)
- **Foundation/principles.md**: *Why* those decisions align with project values

### Section Index
Unlike L2 overviews, the L1 index should describe the **Role** of the section, not just its contents.
- *Bad:* "Contains data files."
- *Good:* "The Memory. Handles persistence and defines data shape."
