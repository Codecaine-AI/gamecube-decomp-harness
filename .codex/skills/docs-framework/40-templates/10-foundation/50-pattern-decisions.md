---
covers: Decision-focused Foundation pattern — purpose, principles, boundaries.
concepts: [pattern, purpose, principles, boundaries, decision-framework]
---

# Decision-Focused Pattern

A Foundation structure for projects needing clear decision frameworks. Three documents that establish: why we exist, how we decide, and what we won't do.

---

## When to Use

- Multiple people need to make consistent decisions
- You want to prevent scope creep or mission drift
- The project has clear values that should guide all choices

## Structure

```
00-foundation/
├── 00-overview.md
├── 10-purpose.md
├── 20-principles.md
└── 30-boundaries.md
```

---

## 10-purpose.md

```markdown
---
covers: Why this system exists and who it serves.
---

# Purpose

[One sentence stating why this exists. What problem does it solve and for whom?]

---

## The Problem We Solve

[What pain point does this address? Be specific about who experiences it.]

## Who We Serve

[Primary users. What do they need? What are their constraints?]

## Why This Approach

[Why build it this way instead of alternatives? What trade-offs did we make?]

## Success Looks Like

[Observable outcomes that indicate we're achieving our purpose.]
```

---

## 20-principles.md

```markdown
---
covers: Decision-making heuristics that apply everywhere.
---

# Principles

These principles guide decisions across the project. When two valid approaches exist, principles tell you which to pick.

---

## [Principle Name]

**Statement**: [One-line principle]

**Rationale**: [Why this matters]

**In Practice**: [Concrete example]

---

## [Another Principle]

**Statement**: [One-line principle]

**Rationale**: [Why this matters]

**In Practice**: [Concrete example]
```

---

## 30-boundaries.md

```markdown
---
covers: What this system explicitly will not do.
---

# Boundaries

Knowing what we won't do is as important as knowing what we will.

---

## What This Is NOT

[Explicit non-goals. What might someone expect that we deliberately don't do?]

- We are not [X]
- We do not [Y]
- This is not intended for [Z use case]

## Constraints We Accept

[Trade-offs we've made. What do we give up for what we gain?]

- We accept [limitation] in exchange for [benefit]

## Out of Scope

[Features we explicitly won't support, even if requested.]

- [Feature X] — [why]
- [Use case Y] — [why]
```

---

## Guidance

### Principles Should Be Actionable
"Quality matters" isn't a principle—everyone agrees. "We ship working software over comprehensive documentation" is a principle—it rules out an alternative someone might choose.

### Aim for 3-7 Principles
Fewer than 3 means you haven't articulated your values. More than 7 suggests some belong in domain-specific guidance.

### Boundaries Prevent Relitigating
Without explicit "no," every feature request seems reasonable. "We do not support team collaboration" immediately clarifies hundreds of potential asks.

### Purpose Anchors Everything
When principles conflict or boundaries seem too restrictive, return to purpose. Does this change serve who we're building for?
