---
covers: Templates for the Foundation zone — freeform structure with example patterns.
type: overview
concepts: [templates, foundation, patterns, understanding]
---

# Foundation Templates

Templates for the Foundation zone. Foundation is manifesto-style — fluid, narrative, more like explaining what you're building to someone than filling out a structured document. File boundaries are organic: driven by what naturally groups together, not by a prescribed schema. Only the entry point (`00-overview.md`) is required. Everything else depends on how you want to capture your understanding. Fewer, more fluid files are often better than many rigid ones.

---

## Required

| Template | Use When |
|----------|----------|
| **10-entry-point.md** | Creating Foundation's `00-overview.md` (always required) |

## Example Patterns

These are optional starting points, not defaults. Most Foundation docs won't follow any of these exactly — the structure should emerge from the content. Use these as inspiration if you're stuck, or ignore them entirely and let your own structure take shape.

| Pattern | Files | Best For |
|---------|-------|----------|
| **20-pattern-problem.md** | problem, landscape, approach | Projects solving a clear pain point |
| **30-pattern-vision.md** | vision, constraints, direction | Projects driven by a future state |
| **40-pattern-thinking.md** | context, ideas, decisions | Projects that emerged through exploration |
| **50-pattern-decisions.md** | purpose, principles, boundaries | Projects needing clear decision frameworks |

## File Tree

```
10-foundation/
├── 00-overview.md              (this file)
├── 10-entry-point.md           Template for Foundation's 00-overview.md
├── 20-pattern-problem.md       Problem-focused pattern example
├── 30-pattern-vision.md        Vision-focused pattern example
├── 40-pattern-thinking.md      Thinking-focused pattern example
└── 50-pattern-decisions.md     Decision-focused pattern example
```

## Contents

### [10-entry-point.md](10-entry-point.md)
Template for `docs/00-foundation/00-overview.md`. The only required file—introduces whatever structure you've chosen.

### [20-pattern-problem.md](20-pattern-problem.md)
Pattern: `10-problem.md`, `20-landscape.md`, `30-approach.md`. Works well when you're solving a clear, articulable problem.

### [30-pattern-vision.md](30-pattern-vision.md)
Pattern: `10-vision.md`, `20-constraints.md`, `30-direction.md`. Works well when you're building toward a specific future state.

### [40-pattern-thinking.md](40-pattern-thinking.md)
Pattern: `10-context.md`, `20-ideas.md`, `30-decisions.md`. Works well when the project emerged through exploration and iteration.

### [50-pattern-decisions.md](50-pattern-decisions.md)
Pattern: `10-purpose.md`, `20-principles.md`, `30-boundaries.md`. Works well when you need clear frameworks for ongoing decision-making.
