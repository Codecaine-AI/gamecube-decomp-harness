---
covers: The structural model — three documentation layers (Foundation, System Design, Implementation) with progressive disclosure enabled by vertical slices, clear boundaries, and layered depth.
concepts: [architecture, progressive-disclosure, vertical-slices, boundaries, zones, layers, L1-L6, shared-understanding]
---

# Architecture

The philosophy establishes why documentation matters. Now the question becomes: how do we build it?

The challenge is twofold:

1. **Capture human intent** 
   - The thoughts, decisions, and understanding that exist in your head need to be externalized in a structured way.

2. **Enable agent self-navigation** 
   - Once captured, agents must be able to find what they need on their own, without you pointing them to the right files every time.

The result is a **shared communication bridge**.

Documentation structured this way isn't just *for* agents—it benefits both parties equally:
- For you: 
  - A way to expand your own knowledge, thinking, and understanding. 
  - The discipline of structuring thoughts clarifies them.
- For agents: 
  - Efficient navigation and comprehension. 
  - They can find context autonomously.
- Together: 
  - A shared medium where both parties speak the same language and understand the same structure.

You can provide intent, but the agent can also navigate, create, and update it. 

This creates a living system that grows with your project.

---

# The Core Principle: Progressive Disclosure

The central organizing principle is **progressive disclosure**
- The ability to navigate from high-level intent down to specific implementation, loading only what's needed for the task at hand.

Engineers build understanding progressively, not randomly:

1. What is this system? → L1 (the index)
2. What are the major parts? → L2 (domain overviews)
3. How does this concept work? → L3 (specific topics)
4. What does this file do? → L4 (file headers)
5. What does this function promise? → L5 (docstrings)
6. How is it implemented? → L6 (code)

This mirrors the repair manual model from the philosophy: 
- index → system chapter → subsystem → component → procedure → the actual bolts.

You don't read the entire engine chapter to replace a spark plug. 

You navigate to the right spot, get the context you need, and work. 

Agents do the same, loading only what's relevant to their current task.

---

# What Makes Progressive Disclosure Work

Progressive disclosure only works if the documentation structure supports it. 

Three properties enable this:

## Vertical Slices

Each domain owns its operation completely.

- Each major system handles its functionality end-to-end
- You can understand one system without understanding the internals of another
- Systems connect at well-defined interfaces, not tangled dependencies

The transmission and engine are connected (power flows from one to the other) but they are completely different domains. 

You can rebuild the transmission without understanding combustion dynamics. 
- You only need to know: "torque comes in here, gear ratio happens, power goes out there."

This is why you can skip sections. 

If you're working on Service A, you don't need to read Service B's detailed documentation—because Service A is self-contained.

## Clear Boundaries

When systems connect, document the interface, not the internals.

If the Auth system produces a token that the API system consumes:
- Auth documents: "I produce tokens with this shape"
- API documents: "I consume tokens with this shape"
- Neither documents the other's implementation

This contains the blast radius of change. 

When Auth's internals change, only Auth's docs update—as long as the interface stays stable.

Each documented section should answer:
- What does this system receive? (inputs, dependencies)
- What does this system produce? (outputs, side effects)
- Where are the boundaries? (what's inside vs outside)

## Overviews at Every Level

You always know what exists without reading the details.

- L1 tells you what domains exist in the system
- L2 tells you what concepts exist within a domain
- Each overview provides enough context to decide: "Is this relevant to my task?"

This enables the mechanic's workflow: 

"I'm working on the transmission. I can see the engine exists and generally what it does, but I don't need to read its docs. I just need to know what comes in on the input shaft."

---

# The Implementation

The principles above are implemented through a specific structure: three layers organized by kind of knowledge, and six depth levels within the Implementation layer.

## The Three Layers

The framework organizes `docs/` into three top-level layers, each capturing a fundamentally different kind of knowledge:

```
docs/
├── 00-foundation/       # Manifesto. North star. Why and what.
├── 10-system-design/    # Architect's blueprints. System-agnostic.
└── 20-implementation/   # Current codebase. Language/framework specific.
    └── 99-appendix/     # Operational (setup, tooling, infra)
```

### Foundation (`00-foundation/`)
**The north star and intent anchor.**

Manifesto-style. Defines what you're trying to solve, why it matters, how it should work conceptually. Not a spec — it's the intent anchor you check against to make sure you haven't drifted from what you originally set out to do.

More fluid and narrative than the other layers. Multiple files, but the file boundaries are organic rather than following a rigid schema. The structure emerges from the content — what naturally groups together — rather than being prescribed by a template.

Rarely changes once established. Informs everything that follows.

### System Design (`10-system-design/`)
**The architect's blueprints.**

System-agnostic, code-agnostic. Describes how the system should work: behaviors, contracts, data shapes, flow, phases, system structure. Doesn't mention classes, frameworks, or language-specific patterns. Enough that a builder in any language could implement it.

Organized by **concept** — session flow, agent architecture, data models — not by code structure.

Think architect vs builder: the architect draws up the house layout and flow; the builder figures out the type of wood and wall materials.

Changes less frequently — when system behaviors or architecture change, not when code changes.

### Implementation (`20-implementation/`)
**The current codebase, as it is.**

Code-specific, language-specific documentation about the current system. Written in present tense about "what we are doing here." Captures idiosyncrasies, edge cases, language-specific patterns. Things that wouldn't belong in Design because they're implementation-specific, but are valuable for understanding the current codebase.

Organized by **code structure** — backend, frontend, database — mirroring the source tree. Contains the L1-L6 progressive disclosure hierarchy.

Includes `99-appendix/` for operational concerns (setup guides, tooling, infra config) — these are inherently implementation-specific.

Changes most often, evolving with the code.

### The Key Insight

Foundation and Design are stable across implementations. You could generate 10 different codebases from the same Foundation + Design docs. Implementation docs capture the specifics of *this* particular attempt.

The litmus test: if the *product's behavior or architecture* changed, it's Design. If it's about *how you're handling that in code*, it's Implementation. If the *north star itself shifted*, it's Foundation.

Example: "Plans now support parallel task groups" → Design. "We use Promise.all with a concurrency limiter for parallel tasks" → Implementation.

---

## Two Levels of Progressive Disclosure

The three-layer split provides **macro-level** progressive disclosure — different *kinds* of knowledge (intent vs design vs implementation). Within the Implementation layer, the L1-L6 hierarchy provides **micro-level** progressive disclosure — different *depths* of the same kind of knowledge.

These aren't redundant. They serve different purposes:
- **Three layers** = navigate to the right *kind* of knowledge
- **L1-L6 within Implementation** = navigate to the right *depth* of implementation knowledge

### The Six-Layer Hierarchy (Implementation)

Within `20-implementation/`, documentation follows a six-layer depth hierarchy:

| Layer | Location | Purpose | Changes |
|-------|----------|---------|---------|
| **L1** | `20-implementation/00-overview.md` | Navigation hub and section index | Rarely |
| **L2** | Section `00-overview.md` files | Domain overviews with file trees | Sometimes |
| **L3** | Individual concept files | One idea per file (with code refs) | Often |
| **L4** | Top of source files | File contracts (header comments) | With code |
| **L5** | Function docstrings | Function contracts | With code |
| **L6** | Implementation | The code itself | Constantly |

### Each Layer Answers a Different Question

| Layer | Question | Example |
|-------|----------|---------|
| Foundation | "What are we building and why?" | "Here's the problem, our vision, and how we're approaching it" |
| System Design | "How should the system behave?" | "The plan phase validates before execution" |
| L1-L3 | "How is this built in practice?" | "We use Zod schemas for plan validation" |
| L4 | "What does this file do?" | "Handles user session lifecycle" |
| L5 | "What does this function promise?" | "Returns validated token or throws" |
| L6 | "How is it implemented?" | The code |

---

## The Navigation Pattern

The path through documentation is **not** linear top-to-bottom. It's a multi-pass pattern:

```
Pass 1: Foundation (always — small token footprint, essential context)
    ↓
Pass 2: Implementation (find relevant area of the codebase)
    ↓
Pass 3: System Design (linked from Implementation — understand intended behavior before changing)
    ↓
Implementation L1-L6 (drill to the depth the task requires)
```

The path is **Foundation → Implementation → Design (as needed)**, not Foundation → Design → Implementation. You start with the code you're about to touch, then pull in design context before changing anything.

Given a task, an agent can:
1. Read Foundation to understand project intent
2. Use Implementation L1 to find which domain is relevant
3. Use L2 to understand that domain's current structure
4. Before making changes, follow cross-links to relevant Design docs to understand intended behavior
5. Drill into L3-L6 only as deep as the task requires

### Cross-Linking Between Layers

Two complementary mechanisms connect layers:

1. **Frontmatter refs** — Implementation docs can include `design_refs` in frontmatter pointing to relevant Design docs. Provides a structural guarantee. Keep it lightweight — not every Implementation doc needs Design links.

2. **Multi-pass navigation** — The agent's workflow handles the connection by reasoning about which system concepts relate to the code it's looking at. This works even when explicit links are incomplete.

Both approaches coexist. Frontmatter links help where they exist; multi-pass navigation is the fallback.

No human guidance needed. The documentation structure itself provides the map.
