---
covers: Problem-focused Foundation pattern — problem, landscape, approach.
concepts: [pattern, problem, landscape, approach, pain-point]
---

# Problem-Focused Pattern

A Foundation structure for projects solving a clear, articulable problem. Three documents that walk through: what's broken, what exists, and how we'll fix it.

---

## When to Use

- You started with a pain point ("X is frustrating/slow/broken")
- You can name specific people who experience the problem
- The value proposition is clear: "If we solve X, then Y improves"

## Structure

```
00-foundation/
├── 00-overview.md
├── 10-problem.md
├── 20-landscape.md
└── 30-approach.md
```

---

## 10-problem.md

```markdown
---
covers: The problem we're solving and who experiences it.
---

# The Problem

[One paragraph stating the core problem. Be specific—who experiences this, when, and why it matters.]

---

## Who Experiences This

[Describe the people affected. What are they trying to do? What gets in their way?]

## The Pain

[What does this problem cost? Time, money, frustration, missed opportunities?]

## Why It Persists

[Why hasn't this been solved? What makes it hard?]
```

---

## 20-landscape.md

```markdown
---
covers: What exists today and why it falls short.
---

# The Landscape

[One paragraph summarizing the current state. What solutions exist? Why are they insufficient?]

---

## What Exists

[Survey of current approaches, tools, or workarounds. No need to be exhaustive—capture the main categories.]

## Where They Fall Short

[Why don't existing solutions fully address the problem? What gaps remain?]

## What We Learned

[Insights from studying the landscape. What patterns emerged? What mistakes should we avoid?]
```

---

## 30-approach.md

```markdown
---
covers: How we're tackling this problem differently.
---

# Our Approach

[One paragraph stating how we'll address the problem. What's the core insight or angle?]

---

## The Key Insight

[What do we understand that enables a better solution? What's our "unfair advantage"?]

## How It Works

[High-level description of the solution shape. Not implementation details—the conceptual approach.]

## What We're Trading Off

[What do we give up to gain what we gain? Be honest about limitations.]

## How We'll Know It's Working

[Observable outcomes that indicate success. Not metrics—what does success look like?]
```

---

## Guidance

### Stay at the Understanding Level
This isn't a specification. You're not defining features or requirements—you're capturing how you understand the problem space.

### Be Specific About People
"Users" is too vague. "Solo developers who context-switch between multiple small projects" gives you something to anchor decisions against.

### Don't Hide Uncertainty
If you're not sure about something, say so. "We believe X, but need to validate Y" is more useful than false confidence.
