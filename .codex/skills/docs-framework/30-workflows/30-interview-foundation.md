---
covers: Extract developer's understanding through curious, exploratory dialogue.
concepts: [interview, foundation, understanding, mental-model, socratic, exploration]
---

# Docs Foundation Interview Workflow

Manifesto-style exploration of what a project is trying to BE. The Foundation layer is the intent anchor — the north star you check against to make sure you haven't drifted from what you originally set out to do. This interview extracts that through curious dialogue, helping the developer articulate understanding they may not have explicitly stated before. Structure emerges from the conversation — not forced into categories.

---

## What This Is

The Foundation interview explores understanding that doesn't live in code — the intent anchor that everything else is built against:

- What this thing is trying to BE
- What it should do extremely well
- How the developer thinks about the problem
- The shape of the solution in their head
- What would feel right vs. wrong

**This is curious exploration, not a spec.** You're helping the developer externalize their mental model into a manifesto — fluid, narrative, more like how you'd explain what you're building to someone than a structured document. Follow threads that reveal understanding. Let the structure emerge from what matters to them — don't force categories.

## Your Role

You are a curious explorer helping crystallize understanding.

| Do | Don't |
|----|-------|
| Follow threads that reveal how they think | Force answers into predefined boxes |
| Ask "tell me more about..." when something sparks | Rush through a checklist |
| Probe what "feels right" vs. "feels wrong" | Accept surface-level answers |
| Explore the shape of the idea in their head | Put words in their mouth |
| Let silence happen—they're thinking | Fill every pause |
| Notice what they're excited about | Treat all topics as equally important |

## Before Starting

Read available context (if it exists):

- `README.md` — existing articulation
- `docs/00-foundation/` — existing Foundation docs
- Project metadata (`package.json`, `pyproject.toml`, etc.)

This gives you something to react to, but expect understanding to emerge from conversation.

---

## The Interview

No rigid phases. No required categories. Follow the understanding.

### 1. Open with Curiosity

Start from what you've read, then invite them to correct/expand:

```
I've looked at [what you read]. Here's what I think I understand:

[Your interpretation—what this seems to be trying to do]

But I want to understand how YOU think about this.

What is this thing trying to be? Not features—what's the core idea?
```

### 2. Explore the Mental Space

Follow threads. Go where the energy is. Some starting points:

**The Core Idea:**
> "If you had to explain what this does in one breath, what would you say?"
> "What's the one thing this should do extremely well?"
> "When you imagine this working perfectly, what does that look like?"

**How They Think About It:**
> "Walk me through how you think about this problem..."
> "What's the mental model you have for how this works?"
> "When you're making decisions about this, what guides you?"

**What Feels Right/Wrong:**
> "What would feel 'off' even if it technically worked?"
> "What would make you proud of this? What would make you cringe?"
> "If someone used this wrong, what would that look like?"

**The Shape of the Solution:**
> "You could have built this many ways. Why this shape?"
> "What did you give up? What did you protect?"
> "What's the experience you're trying to create?"

**Who This Is For:**
> "Paint me a picture of someone using this well."
> "Who would love this? Who would hate it?"
> "What problem are they having right before they reach for this?"

**What This Isn't:**
> "What might someone expect that would be wrong?"
> "What's adjacent but explicitly not this?"
> "What would be scope creep vs. core mission?"

### 3. Follow the Energy

When they light up about something, dig deeper:

> "You seem really clear about that. Tell me more..."
> "Why does that matter so much?"
> "What would violating that feel like?"

When they hesitate or seem uncertain:

> "It sounds like you're still figuring that out?"
> "What are the options you're weighing?"
> "What would help you decide?"

When they say something that seems important:

> "Let me make sure I understand: [reflect back]. Is that right?"
> "That sounds like it might be central. Is it?"

### 4. Let Structure Emerge

As you talk, notice what patterns emerge:

- Are they problem-focused? Vision-focused? Thinking through trade-offs?
- What do they keep coming back to?
- What seems foundational vs. tactical?

Don't force it into Purpose/Principles/Boundaries. Let their natural way of thinking shape the structure.

### 5. Synthesize Understanding

When you feel you have a picture of their mental space:

```
Let me try to capture what I'm hearing:

[Reflect back their understanding in whatever structure emerged]

- The core idea seems to be: [...]
- What matters most: [...]
- What this isn't: [...]
- The experience you're going for: [...]

What am I missing? What did I get wrong?
```

Get confirmation. Iterate if needed.

### 6. Capture the Report

Save to `docs/.drafts/foundation.interview.md`:

```markdown
# Foundation Interview: [Project Name]

**Date**: [timestamp]

---

## The Core Understanding

[2-4 paragraphs capturing their mental model. What is this trying to be? What should it do extremely well? How do they think about it?]

## Key Threads

### [Thread that emerged - use their language]
[What you learned about this aspect]

### [Another thread]
[What you learned]

### [Another thread]
[What you learned]

## What This Isn't
[Boundaries and non-goals that emerged naturally]

## Open Questions
[Things not fully resolved. Tensions to explore. Uncertainties they named.]

## Suggested Foundation Structure

File boundaries should be organic — driven by what naturally groups together, not by a prescribed schema like "purpose / principles / boundaries." Suggest a structure that fits what emerged:

- [Suggested file 1]: [What it would capture]
- [Suggested file 2]: [What it would capture]
- [Suggested file 3]: [What it would capture]

Or: This might work best as a single narrative document. Foundation docs are manifesto-style — fewer, more fluid files are often better than many rigid ones.

---

*Ready for drafting: /docs:write foundation*
```

### 7. Close the Interview

```
Interview complete.

Saved to: docs/.drafts/foundation.interview.md

What I learned:
- Core idea: [one line]
- What matters most: [one line]
- Suggested structure: [pattern name or "single narrative"]

Next: Run /docs:write foundation to generate Foundation documentation.
```

---

## Guidance

**Be genuinely curious.** You're not checking boxes—you're trying to understand how they think about what they're building.

**Follow the energy.** When they're excited or clear about something, that's signal. Dig there.

**Use their language.** The words they choose matter. Preserve them for the drafting phase.

**Don't force structure.** There is no default pattern. Purpose/Principles/Boundaries, Problem/Vision/Approach, single narrative — these are all valid shapes. Let what matters to them determine the shape. File boundaries should be organic: what naturally groups together, not what a template prescribes.

**Foundation is manifesto, not spec.** The output should read like a clear-eyed explanation of what you're building and why — the intent anchor everything else is built against. Fluid, narrative, opinionated. Not a requirements document.

**Silence is productive.** When they pause, they're thinking. Don't rush to fill it.

**This is for focused projects.** The assumption is microservice-scale projects with a core idea they want to nail — not million-line monoliths. The Foundation should capture what this thing does extremely well.

**Run until you understand.** You're done when you could explain to another developer what this project is trying to BE and what would feel right vs. wrong when building it.

## Output

- Foundation interview report saved to `docs/.drafts/foundation.interview.md`
- Suggested structure based on what emerged
- Ready for `/docs:write foundation`
