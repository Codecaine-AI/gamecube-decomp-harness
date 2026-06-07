# Anti-Patterns

Check every prompt against this list before delivery. Any pattern present = fix before proceeding.

---

## Structural

**Wall of Text** — One block, no structure. Fix: XML tags with semantic names, separate concerns into distinct sections.

**Polite Suggestion** — "Try to...", "Consider...", "You might want to..." Models read hedged language as optional. Fix: Imperative/absolute. "Always", "Never", "Do not."

**Instruction Dump** — 20+ constraints, no hierarchy. Equal weighting = no weighting. Fix: Separate into `<rules>` (non-negotiable, under 7) and `<preferences>` (nice-to-have).

**Echo Chamber** — Same instruction restated in different words across sections. Wastes tokens, doesn't increase compliance. Fix: State once, position at start + end.

**Franken-Prompt** — Sections from different prompts stitched together. Inconsistent terms, conflicting instructions. Fix: Audit terminology. Same concepts = same terms throughout.

**Contradictions** — Conflicting instructions with no resolution. "Be thorough but concise" without saying which wins. Fix: Resolve tensions explicitly. "Prioritize X over Y when they conflict."

---

## Thinking

**Default Delegation** — "Write me a marketing plan." Zero structure, zero scaffolding. Fix: Specify what good looks like, add constraints, provide output format.

**Over-Engineering** — Step-by-step micromanagement for tasks the model handles fine. Guardrails become handcuffs. Fix: Start with less instruction. Add scaffolding only if output quality demands it.

**Persona Theater** — "You are a world-class expert with 15 years of experience in..." Doesn't improve output on capable models. Named people produce caricatures. Fix: Cut the persona. Use constraints and examples to steer behavior.

**Assumption Blindness** — No acknowledgment the model might misunderstand key terms or context. Fix: State key assumptions explicitly, or add a Socratic step to surface them.

---

## Output

**Format Vacuum** — No output format specified, or vague ("present clearly"). Different runs produce different structures. Fix: Provide a literal template/skeleton.

**The Everything Prompt** — "Be comprehensive", "Cover all aspects." Model interprets this as "be long." Fix: Specify priorities. "Cover the top 3 factors. Ignore everything else."

**Naked Task** — Task with no context, examples, or constraints. Fix: Add at minimum: who it's for, what "good" looks like, one hard constraint.

---

## Context Engineering Failures

**Context Rot** — Loading too much context without curation. Model performance degrades as irrelevant information dilutes attention on relevant parts. Fix: Every piece of context must earn its token cost. Summarize and compress, don't just append.

**Mode Collapse** — Over-constrained prompts that produce identical outputs regardless of input variation. Fix: Use negative space definition (what NOT to do) alongside positive constraints. Add contrastive examples showing what generic looks like.

**Context Injection Vulnerability** — User-provided data in the prompt that could be interpreted as instructions. Fix: Wrap user data in clearly labeled sub-tags (`<user_data>`, `<document>`). Never mix user data with instructions in the same XML block.

**Stale Context** — Restating information the model already has from training. Wastes tokens and can create contradictions with the model's knowledge. Fix: Only include context the model wouldn't have or might get wrong.

---

## Model-Specific

**Redundant Chain-of-Thought** — "Think step by step" when extended thinking is already enabled (Claude, o1). Creates redundancy. Fix: Skip explicit CoT, or use "Use your thinking to plan" to direct it.

**Ignoring XML (Claude)** — Using markdown headers or plain text when XML would be cleaner. Claude is trained on XML prompts — use it.

**Missing Prefill (Claude API)** — Hoping Claude starts its response correctly. Fix: Use assistant prefill to lock the first tokens of the response.

**Generic System Message (GPT)** — Default "You are a helpful assistant" with no behavioral steering. Fix: Replace with specific purpose + constraints.

---

## Verification Checklist

Before delivery, confirm:

- [ ] No hedged language — absolute constraints throughout
- [ ] No persona backstory — behavior steered through constraints/examples
- [ ] No redundancy — each instruction appears once
- [ ] No format vacuum — output structure explicitly specified
- [ ] No contradictions — tensions resolved with stated priority
- [ ] No named people in behavioral instructions
- [ ] XML-structured with semantic tag names
- [ ] Critical rules at start AND end (primacy-recency)
- [ ] Every section earns its token cost
- [ ] User data separated from instructions
- [ ] No context rot — all included context is relevant and curated

## Connects To
- 01: Context engineering principles that prevent context-level anti-patterns
- 03: Techniques that counter specific anti-patterns
- 06: Evaluation protocol catches anti-patterns that slip through
