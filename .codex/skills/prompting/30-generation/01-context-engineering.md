# Context Engineering

The mindset that underlies every choice in this skill. Read this before drafting.

## The Frame

Prompt engineering is writing good instructions. Context engineering is architecting the full information environment the model operates in.

The analogy: the LLM is a CPU. The context window is RAM. Your job is loading working memory with the right code and data for each task — not just writing a clever instruction at the top.

## Context Assembly

Every prompt is a context assembly problem. The pieces:

1. **Instructions** — What to do and how to think about it.
2. **Knowledge** — Domain facts, reference material, constraints the model doesn't have.
3. **Examples** — Demonstrations of desired behavior. Contrastive beats positive-only.
4. **User data** — The specific input for this run.
5. **State** — Previous outputs, conversation history, tool results.

The engineering question isn't "what instruction should I write?" It's "what does the model need in its working memory to produce this output correctly?"

In this skill, instructions live in the system prompt and user data + state come through the input formatter. The split is intentional: it lets each piece be edited, cached, and tested independently.

## Context Window Management

**Token budget thinking.** Every token in the context window competes for attention weight. Loading irrelevant context degrades performance on the relevant parts. Less is more when the less is more relevant.

**Positioning matters.** Models attend most strongly to the beginning and end of context (primacy-recency effect). Critical instructions go at START and END. Supporting data goes in the MIDDLE.

**Semantic separation.** XML tags don't just look clean — they create parseable boundaries the model uses to determine what information applies where. `<customer_complaint>` tells the model more than `Input:`.

## Context Rot

Context rot degrades model performance as context grows with poorly curated information. Symptoms:

- Instructions from early in the context get ignored.
- The model starts contradicting its own prior outputs.
- Output quality degrades despite good individual instructions.
- The model "forgets" constraints from earlier in the conversation.

Prevention:

- Curate aggressively. Every piece of context must earn its place.
- Restate critical constraints periodically — rephrase, do not repeat verbatim.
- Use structured context (XML) so the model can parse boundaries.
- For long conversations: summarize and compress, do not just append.

## Mode Collapse

Mode collapse reduces output diversity through over-alignment. The model produces "safe" but generic responses because it has been trained to avoid risk.

Symptoms:

- Every output sounds the same regardless of input variation.
- The model hedges instead of committing to positions.
- Outputs are technically correct but lack insight.
- Creative tasks produce formulaic results.

Prevention:

- Constraint-driven prompts (what NOT to do) beat positive prompts (what to do).
- Contrastive examples showing explicitly what "generic" looks like.
- Negative space definition: "This output must NOT sound like default AI advice."
- Specific, concrete output formats that force structure.

## Context Engineering Checklist

When building any prompt, ask:

- What does the model need to know to do this correctly?
- What does it already know that might be wrong for this use case?
- What information would degrade output if included?
- Is every piece of context earning its token cost?
- Are critical instructions positioned at start AND end?
- Is the context structured so the model can parse what applies where?

## Connects To

- `10-system-prompts/00-overview.md` — the three system-prompt types that implement context assembly patterns.
- `20-inputs/00-overview.md` — the formatter mental model that controls what runtime context reaches the model.
- `03-techniques-library.md` — techniques for efficient context loading.
- `05-anti-patterns.md` — patterns that cause context rot and mode collapse.
