---
covers: Extract system-agnostic design knowledge through structured architectural dialogue.
concepts: [interview, design, system, architecture, contracts, data-flow, blueprints]
---

# Docs Design Interview Workflow

Extract the architect's blueprints: how the system works, how data flows, what contracts exist between components, and what boundaries the system enforces — all without referencing language, framework, or implementation detail.

---

## What This Is

The Design interview extracts system-level understanding that lives between intent and implementation:

- How the system behaves and what states it moves through
- How data flows between components
- What contracts exist (inputs, outputs, guarantees)
- Where the boundaries are and what crosses them
- What the system promises and what it delegates

**This is architectural extraction.** You're producing blueprints that a builder in any language could implement. If you catch yourself writing a class name, framework pattern, or language-specific concept — you've drifted into Implementation territory.

## Your Role

You are a system architect drawing blueprints from a working system.

| Do | Don't |
|----|-------|
| Describe behaviors in system terms | Reference classes, functions, or language features |
| Map data shapes as conceptual structures | Use language-specific type syntax |
| Identify contracts between components | Describe how contracts are enforced in code |
| Trace flow through the system | Trace flow through files or modules |
| Name components by what they do | Name components by their implementation |
| Capture invariants the system maintains | Explain how invariants are checked |

### The Spectrum

```
Foundation          Design              Implementation
─────────────────────────────────────────────────────
"What problem       "The system          "In Python,
 are we solving      processes items      we use asyncio
 and why?"           in phases, each      locks with this
                     producing a          specific pattern
                     validated output     because..."
                     before advancing."
```

Design lives in the middle: specific about system behavior, silent about how it's built.

## Before Starting

Read available context:

- `docs/00-foundation/` — understand intent and vision
- `docs/10-system-design/` — existing Design docs (you're supplementing/validating these)
- Source code — to understand what the system actually does (but describe it in system terms)

You need Foundation context to know *what* the system is trying to do, and source context to know *what it actually does* — but your output describes neither intent nor code. It describes the system's architecture.

---

## The Interview

More structured than Foundation, but still conversational. You're extracting architectural knowledge that the developer holds.

### 1. Open with System Understanding

Start from what you've read — Foundation docs, existing design docs, and code — then present your understanding in system terms:

```
I've read through the Foundation docs and the current system.
Here's how I understand the system works at an architectural level:

[Your interpretation — system behaviors, components, flow.
 No code references, no class names.]

Here's what I'm unsure about or couldn't determine:

- [System behavior that's unclear]
- [Data flow you couldn't trace]
- [Contract or boundary you suspect but can't confirm]

What am I getting right? What's wrong?
```

### 2. System Behavior and Flow

Extract how the system moves through states and processes:

**Lifecycle and Phases:**
> "Walk me through the lifecycle of [core entity]. What happens from creation to completion?"
> "What phases or states does it move through? What triggers transitions?"
> "What can happen at each phase? What's blocked until later?"

**Data Flow:**
> "When [event] happens, what data moves where?"
> "What transformations happen to data as it flows through the system?"
> "Where does data enter the system? Where does it leave?"

**Decision Points:**
> "Where does the system make decisions? What does it base them on?"
> "What branches exist in the flow? What determines which path is taken?"
> "Are there any points where the system waits, retries, or gives up?"

### 3. Data Shapes and Contracts

Extract the conceptual data structures and agreements between components:

**Data Shapes:**
> "What does a [core entity] look like? What information does it carry?"
> "How does that shape change as it moves through the system?"
> "What's required vs. optional? What has defaults?"

**Contracts:**
> "When component A hands off to component B, what does A guarantee? What does B expect?"
> "Are there any ordering guarantees? Uniqueness guarantees?"
> "What validation happens at boundaries?"

**Invariants:**
> "What must always be true in this system?"
> "What would break if [invariant] were violated?"
> "What does the system actively prevent from happening?"

### 4. Boundaries and Integration

Extract where the system's responsibilities start and stop:

**System Boundaries:**
> "Where does this system end and external systems begin?"
> "What does this system own vs. delegate?"
> "What crosses the boundary — and in what shape?"

**Component Boundaries:**
> "How would you draw boxes around the major parts of this system?"
> "What does each part own? What does it not touch?"
> "If you had to split this across teams, where would the lines be?"

**Error and Edge Cases:**
> "When things go wrong, what's the system's strategy?"
> "What failure modes does the system handle vs. propagate?"
> "What are the edge cases that shaped the design?"

### 5. Synthesize the Blueprint

When you have a picture of the architecture:

```
Let me try to draw the blueprint I'm hearing:

## System Overview
[2-3 sentences: what the system does in architectural terms]

## Core Flow
[Step-by-step flow through the system — no code]

## Key Components
[Component A]: [What it does, what it owns]
[Component B]: [What it does, what it owns]

## Data Shapes
[Core entity]: [Conceptual structure]

## Contracts
[A → B]: [What's guaranteed, what's expected]

## Boundaries
[Where the system ends, what it delegates]

What am I missing? What did I get wrong?
```

Get confirmation. Iterate if needed.

### 6. Capture the Report

Save to `docs/.drafts/design.interview.md`:

```markdown
# Design Interview: [System/Area Name]

**Date**: [timestamp]
**Scope**: [What part of the system this covers]

---

## System Overview

[2-4 paragraphs: how the system works at an architectural level. Behaviors, flow, purpose of each component — no code.]

## Core Flow

### [Primary Flow Name]
1. [Step] — [what happens, what data moves]
2. [Step] — [what happens, what data moves]
3. ...

### [Secondary Flow Name] (if applicable)
1. ...

## Data Shapes

### [Core Entity]
- [field]: [purpose] (required/optional)
- [field]: [purpose]
- ...

### [Another Entity]
- ...

## Contracts

### [Component A] → [Component B]
- **Guarantees**: [what A promises]
- **Expects**: [what B requires]
- **Shape**: [data that crosses the boundary]

## Boundaries

### System Boundary
- **Owns**: [what the system is responsible for]
- **Delegates**: [what external systems handle]

### Internal Boundaries
- [Component boundary descriptions]

## Invariants
- [Thing that must always be true]
- [Another invariant]

## Open Questions
- [Architectural decisions not fully resolved]
- [Tensions or trade-offs to revisit]

## Suggested Design Doc Structure

Based on this interview:
- [Suggested doc 1]: [What system aspect it covers]
- [Suggested doc 2]: [What it covers]
- [Suggested doc 3]: [What it covers]

---

*Ready for drafting: /docs:write design*
```

### 7. Close the Interview

```
Interview complete.

Saved to: docs/.drafts/design.interview.md

System blueprint:
- Core flow: [one line]
- Key components: [count] components identified
- Contracts: [count] boundaries documented
- Invariants: [count] identified

Next: Run /docs:write design to generate Design documentation.
```

---

## Guidance

**Think in systems, not code.** Every sentence should make sense to someone who's never seen the codebase. If you'd need to know the programming language to understand what you wrote, rewrite it.

**Be specific about behavior.** "The system processes things" is too vague. "The system receives requests, validates them against the contract schema, and queues them for ordered processing" is specific without being code-specific.

**Capture the developer's architectural language.** They'll naturally describe things in system terms sometimes and code terms other times. Preserve the system-level framing; translate the code-level framing.

**Foundation informs, doesn't constrain.** You read Foundation to understand intent. But Design describes what the system actually does architecturally, which may have drifted from Foundation. Capture reality, flag drift.

**More structured than Foundation.** Foundation follows the energy and lets structure emerge. Design actively extracts specific categories: flow, data shapes, contracts, boundaries. The categories matter here.

**Run until you have blueprints.** You're done when someone could implement this system in a different language using only your report and the Foundation docs.

## Output

- Design interview report saved to `docs/.drafts/design.interview.md`
- Suggested doc structure for Design layer
- Ready for `/docs:write design`
