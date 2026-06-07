---
covers: Template for documenting bounded contexts with business rules.
concepts: [L2, domain, module, business-logic, rules, state]
---

# Domain/Module Overview Template

Template for documenting bounded contexts — cohesive areas of business logic like Authentication, Payments, Orders, or Inventory. Emphasizes concepts, rules, and state transitions.

---

## When to Use

- Bounded contexts with complex business rules
- Modules with significant domain logic
- Areas with state machines or workflows
- Code that enforces business invariants

## Template

<template>

    ---
    covers: [Domain name] — [one sentence describing its responsibility in business terms]
    type: overview
    concepts: [domain-name, business-term-1, business-term-2]
    ---

    # [Domain Name]

    [One sentence describing what this domain handles and why it exists. Use business language, not technical jargon.]

    ---

    ## Domain Context

    [1-2 paragraphs explaining the business context. What real-world problem does this solve? What would happen if this domain didn't exist?]

    ## Core Concepts

    | Concept | Definition | Example |
    |---------|------------|---------|
    | [Term 1] | [What it means in this domain] | [Concrete example] |
    | [Term 2] | [What it means in this domain] | [Concrete example] |
    | [Term 3] | [What it means in this domain] | [Concrete example] |

    ## State Lifecycle

    [If this domain manages stateful entities, show the state machine]

    ```
    ┌─────────┐    [action]    ┌─────────┐    [action]    ┌─────────┐
    │ STATE_A │ ─────────────► │ STATE_B │ ─────────────► │ STATE_C │
    └─────────┘                └─────────┘                └─────────┘
         │                          │
         │ [action]                 │ [action]
         ▼                          ▼
    ┌─────────┐                ┌─────────┐
    │ STATE_X │                │ STATE_Y │
    └─────────┘                └─────────┘
    ```

    **State Definitions:**
    - **STATE_A**: [When an entity is in this state, what does it mean?]
    - **STATE_B**: [When an entity is in this state, what does it mean?]

    ## Business Rules

    These invariants are enforced throughout the domain:

    1. **[Rule Name]**: [Statement of the rule]
       - *Rationale*: [Why this rule exists]
       - *Enforcement*: [Where/how it's enforced in code]

    2. **[Rule Name]**: [Statement of the rule]
       - *Rationale*: [Why this rule exists]
       - *Enforcement*: [Where/how it's enforced in code]

    ## Key Types

    [The main data structures that flow through this domain]

    ```python
    @dataclass
    class [EntityName]:
        id: UUID
        status: [StatusEnum]
        # ... key fields with brief comments
    ```

    ## Domain Boundaries

    What this domain **owns**:
    - [Responsibility 1]
    - [Responsibility 2]

    What this domain **does NOT own** (handled elsewhere):
    - [Responsibility] → See [Other Domain]
    - [Responsibility] → See [Other Domain]

    ## File Tree

    ```
    docs/20-implementation/XX-domain/
    ├── 00-overview.md          (this file)
    ├── 10-[concept].md         [Description]
    ├── 20-[workflow].md        [Description]
    └── 30-[rules].md           [Description]
    ```

    ## Contents

    ### [10-concept.md](10-concept.md)
    [What this document covers]

</template>

## Usage Guidelines

### Core Concepts
Use a table to define domain vocabulary. Include concrete examples — they clarify meaning better than abstract definitions.

### State Lifecycle
Show state transitions with ASCII diagrams. Define what each state means in business terms, not just technical terms.

### Business Rules
These are invariants that must always be true. Include:
- The rule statement
- Why it exists (rationale)
- Where it's enforced in code

### Domain Boundaries
Explicitly state what this domain owns and what it doesn't. This prevents scope creep and clarifies integration points.
