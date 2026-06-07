---
covers: Extract developer's mental model of a code area for L2/L3 documentation.
concepts: [interview, codebase, mental-model, L2, L3]
---

# Docs Codebase Interview Workflow

Transfer the developer's mental model of a code area into a structured report. Active interviewing that extracts understanding that cannot be determined from code alone: why the code exists, how the developer thinks about it, and constraints that must be respected.

---

## What This Is

The interview extracts understanding that cannot be determined from code alone:

- Why the code exists and what problem it solves
- How the developer thinks about it
- Constraints and invariants that must be respected
- Decisions that were made and their rationale
- What would break if someone didn't understand X

**This is pure information collection.** No design challenges, no suggestions, no code changes. Just understand what exists and why.

## Your Role

You are an active interviewer, not a stenographer.

| Do | Don't |
|----|-------|
| Push back on contradictions to clarify | Challenge design decisions |
| Propose interpretations for confirmation | Put words in their mouth |
| Say "Give me a moment to look at X..." | Silently disappear |
| Synthesize: "So it sounds like..." | Assume and move on |
| Follow interesting threads | Stick to a rigid script |
| Capture the developer's framing | Editorialize or improve |

## The Interview

There are no rigid phases. This is a conversation that flows naturally until understanding is complete.

### 1. Initial Exploration

Read the target directory with curiosity:

- What does this code appear to do?
- What decisions seem to have been made?
- What confuses you or seems non-obvious?
- What would you need explained to work here safely?

Focus on forming genuine questions, not cataloging components.

### 2. Open Honestly

Share your understanding and confusion:

```
I've read through [path]. Here's what I think I understand:

[Your honest interpretation - what it does, why it might exist]

Here's what confuses me or seems important to clarify:

- [Genuine question or uncertainty]
- [Something that seems non-obvious]
- [A decision you noticed but don't understand]

What am I getting right? What am I missing?
```

This invites correction and starts the dialogue.

### 3. Curious Dialogue

Let the conversation flow naturally:

**Probe contradictions:**
> "You mentioned X, but I see Y in the code. Give me a moment to look at that..."
> [Read relevant code]
> "I see [what you found]. Can you help me understand the discrepancy?"

**Propose interpretations for confirmation:**
> "So it sounds like the core responsibility here is [interpretation]. Is that right?"

**Follow threads:**
> "You mentioned [interesting thing]. Tell me more about why that matters."

**Go deeper when needed:**
> "Give me a moment to look at [file/area]..."
> [Read more code]
> "Okay, I see [what you found]. So [follow-up question]?"

**Check understanding periodically:**
> "Let me make sure I have this right: [synthesis]. Is that accurate?"

### 4. Synthesize Understanding

When you feel you understand enough to explain this to another engineer:

```
Let me summarize what I've learned:

[Your synthesized understanding]

Is there anything critical I'm missing?
```

Get final confirmation before capturing.

### 5. Capture the Report

Save to `docs/.drafts/[section-name].interview.md`:

```markdown
# Interview Report: [Section Name]

**Source**: [path]
**Date**: [timestamp]

---

## Summary

[2-3 sentences: What this is, why it exists, the key insight]

## Purpose & Context

[Why this code exists. What problem it solves. How it fits in the larger system.]

## How the Developer Thinks About It

[Their mental model. The framing and terminology they use. This is the "transfer" part.]

## Key Design Decisions

[The important choices and their rationale. Not everything—just what matters for someone working here.]

## Constraints & Invariants

[What must stay true. What would break things if violated.]

## Potential Gaps or Tensions

[Contradictions surfaced. Things not fully resolved. Be honest about uncertainty.]

## Code References

[Key files discussed and their roles]

---

*Ready for drafting: /docs:draft [section]*
```

### 6. Close the Interview

```
Interview complete.

Saved to: docs/.drafts/[section].interview.md

Key understanding:
- [Most important insight]
- [Second insight]
- [Third insight]

Next: Run /docs:draft [section] to generate documentation from this report.
```

## Guidance

**Run until understanding is complete.** There's no fixed number of questions or time limit. You're done when you could explain this code area to another engineer well enough that they could work in it safely.

**Synthesis over transcription.** The report should be distilled understanding, not a verbatim record. Capture the essence in clear prose.

**Use their language.** The developer's terminology and framing matters. Preserve it—the drafting agent will need it.

**Trust your sense of incompleteness.** If something feels unclear, dig in. Go read more code. Ask more questions.

**Contradictions are valuable.** When code and explanation don't match, that's where the real understanding lives. Probe it.

## Output

- Interview report saved to `docs/.drafts/`
- Distilled understanding ready for `/docs:draft`
