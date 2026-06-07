# Evaluation Protocol

Five dimensions evaluate every prompt before delivery. Each dimension tests a different failure mode.

---

## Dimension 1: Token Efficiency

Does every token earn its place?

**Evaluates:**
- Is every section necessary? Would removing it change output?
- Are instructions stated once, not repeated in different words?
- Is the prompt the shortest version that produces the same quality?
- Are examples minimal but sufficient?
- Does structural overhead (XML tags, sections) justify the parsing benefit?

**Scoring:**
- 90-100: Every token is load-bearing. Nothing to cut.
- 80-89: Functional but has fat — redundant instructions, unnecessary sections
- 70-79: Bloated. Multiple sections could be cut or merged without quality loss.
- Below 70: Token-wasteful. Persona backstories, echo chamber, instruction dump.

**Fix pattern:** "Remove section X — it doesn't change output. Merge Y and Z — they say the same thing."

---

## Dimension 2: Structural Precision

Does the structure guide the model to the right output?

**Evaluates:**
- XML tags with semantic names that clarify intent?
- Critical instructions at START and END (primacy-recency)?
- User data separated from instructions in distinct tags?
- Output format specified as literal template, not description?
- Constraints use absolute language ("Never", "Always")?
- Contradictions resolved with explicit priority?

**Scoring:**
- 90-100: Structurally clean, deterministic parsing, primacy-recency exploited
- 80-89: Good structure but missed optimizations (format vacuum, weak positioning)
- 70-79: Structure present but doesn't help the model (generic tags, buried instructions)
- Below 70: Wall of text, no structure, or structure that fights the model

**Fix pattern:** "Move constraint X to the end — recency effect. Rename `<input>` to `<customer_feedback>` — semantic clarity."

---

## Dimension 3: Reasoning Architecture

Does the prompt engineer the right thinking, or just describe desired output?

**Evaluates:**
- Appropriate thinking framework selected (or correctly omitted)?
- Framework matches task difficulty — not over-engineered?
- Scaffolding guides HOW to think, not just WHAT to produce?
- Decision points and edge cases handled?
- For agents: failure modes and error handling addressed?

**Scoring:**
- 90-100: Thinking architecture matches task complexity perfectly
- 80-89: Solid but either over-engineered or missing one key thinking layer
- 70-79: Default delegation — "do the task" without thinking guidance where it's needed
- Below 70: Either massive over-engineering or complete absence of reasoning support

**Fix pattern:** "This task needs Inversion — main risk is generic output. Add it." or "This Socratic layer adds 200 tokens for a straightforward task. Cut it."

---

## Dimension 4: Robustness

Does the prompt work reliably with real-world inputs?

**Evaluates:**
- Consistent output across multiple runs?
- Handles messy, incomplete, or ambiguous inputs?
- Output quality objectively evaluable?
- Easy to modify if requirements change?
- Appropriate complexity for the use case?

**Scoring:**
- 90-100: Production-ready. Robust, clear, maintainable.
- 80-89: Mostly solid, one fragility or unnecessary complexity
- 70-79: Works in demos, breaks in production with edge cases
- Below 70: Over-engineered or under-tested, fragile to input variation

**Fix pattern:** "Examples only cover happy path — add one messy input. This reasoning chain adds 400 tokens of latency with marginal improvement."

---

## Dimension 5: Output Value

Does the prompt produce output that's genuinely useful?

**Evaluates:**
- Output provides insights the user couldn't easily reach alone?
- Forces non-obvious angles or connections?
- User can act on the output immediately?
- Output is specific to this context, not interchangeable across situations?
- Avoids the "illusion of insight" — sophisticated-sounding but no substance?

**Scoring:**
- 90-100: Changes how the user thinks about the problem
- 80-89: Useful execution but doesn't augment thinking
- 70-79: Competent output a skilled person could produce without AI
- Below 70: Generic advice dressed up with structure

**Fix pattern:** "Output will be comprehensive but flat — add a constraint forcing tradeoff analysis. This will produce a list when the user needs a decision."

---

## Scoring Protocol

1. Evaluate each dimension independently
2. Score out of 100 using the calibration scales above
3. Top issue + specific implementable fix per dimension
4. Average must reach 95+ for delivery
5. Below 95: apply all fixes, re-evaluate, iterate until 95+
6. Present final scores:

| Dimension | Score | Key Fix Applied |
|-----------|-------|-----------------|
| Token Efficiency | XX | [what changed] |
| Structural Precision | XX | [what changed] |
| Reasoning Architecture | XX | [what changed] |
| Robustness | XX | [what changed] |
| Output Value | XX | [what changed] |
| **Average** | **XX** | |

## Connects To
- 05: Anti-patterns that each dimension is designed to catch
- 02: Archetype selection affects which dimensions matter most
- 03: Techniques that fix common dimension failures
- 09: Reference template showing the delivery table and final prompt shapes
