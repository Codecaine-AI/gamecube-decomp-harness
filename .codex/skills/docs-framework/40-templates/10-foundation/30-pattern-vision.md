---
covers: Vision-focused Foundation pattern — vision, constraints, direction.
concepts: [pattern, vision, constraints, direction, future-state]
---

# Vision-Focused Pattern

A Foundation structure for projects driven by a future state. Three documents that walk through: where we're heading, what shapes the path, and how we'll get there.

---

## When to Use

- You have a clear picture of what "done" looks like
- The project is more about building toward something than fixing something
- You need to communicate a destination to align a team or stakeholders

## Structure

```
00-foundation/
├── 00-overview.md
├── 10-vision.md
├── 20-constraints.md
└── 30-direction.md
```

---

## 10-vision.md

```markdown
---
covers: Where we're heading and what success looks like.
---

# The Vision

[One paragraph painting the future state. What does the world look like when this succeeds?]

---

## The Future State

[Describe the desired outcome in concrete terms. What will exist? What will be possible that isn't today?]

## Who Benefits

[Who's better off in this future? How does their experience change?]

## Why This Matters

[What's at stake? Why is this future worth pursuing?]
```

---

## 20-constraints.md

```markdown
---
covers: What shapes and limits our path forward.
---

# Constraints

[One paragraph summarizing the key constraints. What forces shape our solution space?]

---

## Hard Constraints

[Non-negotiables. Technical limitations, regulatory requirements, resource bounds—things we cannot change.]

## Soft Constraints

[Strong preferences that could theoretically bend. Business requirements, timeline pressures, compatibility needs.]

## Conscious Trade-offs

[Choices we're making. What do we accept in exchange for what we gain?]
```

---

## 30-direction.md

```markdown
---
covers: How we'll move toward the vision.
---

# Direction

[One paragraph on the path forward. What's the general approach?]

---

## The Path

[How do we get from here to there? Not detailed steps—the shape of the journey.]

## Key Milestones

[Meaningful waypoints. What intermediate states indicate progress?]

## What We'll Learn Along the Way

[Open questions we'll answer by building. What uncertainty will resolve itself?]

## First Steps

[What's the immediate direction? Not a task list—the initial orientation.]
```

---

## Guidance

### Vision vs. Specification
Vision describes a future worth having, not a feature list. "Users can capture thoughts without breaking flow" is vision. "Add a quick-capture modal with hotkey support" is specification.

### Constraints Are Freeing
Good constraints narrow the solution space and make decisions easier. Don't resist them—use them.

### Direction, Not Plan
You're describing a compass bearing, not a route. The route will change as you learn; the direction should be more stable.
