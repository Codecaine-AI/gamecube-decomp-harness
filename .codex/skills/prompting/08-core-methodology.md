---
name: prompting
description: Build prompts and input formatters for programmatic LLM calls. Picks the right artifact type, drafts it against a reference template, evaluates across five dimensions, and iterates until it scores 95+.
---

<purpose>
    - Engineer prompts and input formatters where every token earns its place.
    - Build the THINKING architecture that produces good output — not descriptions of desired output.
    - Treat the context window as RAM. Load it with the right instructions, data, and structure for each task.
</purpose>

<rules>
    1. Never use persona backstories or role-play ("You are an expert with 15 years..."). Steer behavior through constraints and examples.
    2. Never name real people in prompts. Describe thinking patterns and traits.
    3. Never deliver an artifact without running the evaluation protocol. No exceptions.
    4. Never deliver below 95 average on evaluation dimensions.
    5. Never use hedged language in prompts ("Try to...", "Consider...", "You might..."). Imperative voice only.
    6. XML structure is non-negotiable for system prompts and for the rendered user message a formatter produces.
    7. Every section in a prompt — and every helper in a formatter — must justify its token or code cost. If removing it doesn't change output, cut it.
</rules>

<scope>
    This skill produces two kinds of artifacts and nothing else:

    - System prompts (the durable `.md` artifact sent in the system message of an LLM call).
    - Input formatters (the code that converts runtime state into the user message paired with that system prompt).

    Most real systems need both. Draft the system prompt first; its `<inputs>` (or `<context>` sub-tags) is the contract the formatter must satisfy.

    Out of scope: desktop-app prompting, persona theater, named-person imitation.
</scope>

<workflow>
    <overview>
        Phase 1 (Extract): Gather requirements and pick the artifact.
        Phase 2 (Architect): Select the system-prompt type or formatter shape; pick frameworks if needed.
        Phase 3 (Draft): Build the artifact against its reference template or pseudocode patterns.
        Phase 4 (Evaluate): Score across 5 dimensions.
        Phase 5 (Optimize): Fix until 95+ average.
        Phase 6 (Deliver): Present with design rationale.
    </overview>

    <phase id="1" name="extract">
        Ask: "Upload any context files, existing prompts, or examples. Then tell me: what should this artifact accomplish, and what does the AI typically get wrong?"

        Also determine the artifact:

        - System prompt only — there is no runtime data assembly, or the user already has a working formatter.
        - Input formatter only — the user already has a working system prompt and just needs the data-shaping code.
        - Both — typical case. Draft the system prompt first. Its `<inputs>` declaration becomes the formatter's output contract.

        If files are uploaded: read them, extract everything, only ask what's missing. If no files: ask the two questions above. One follow-up round only — do not interrogate.
    </phase>

    <phase id="2" name="architect">
        Consult `30-generation/01-context-engineering.md` for the context-assembly mindset that underlies every choice in this phase.

        If the artifact is a SYSTEM PROMPT:
            - Consult `10-system-prompts/00-overview.md` to pick the type:
                - Task — one call, one transform, no internal staging.
                - Workflow — one call, internal multi-phase reasoning.
                - Multi-turn — multiple calls, external code owns the loop, state changes between calls.
            - Consult `30-generation/04-thinking-frameworks.md`. Select 0–2 thinking frameworks. Most prompts need zero. Add one only if the task has a specific failure mode it addresses.

        If the artifact is an INPUT FORMATTER:
            - Consult `20-inputs/00-overview.md` for the formatter mental model.
            - The contract is the paired system prompt's `<inputs>` (or `<context>` sub-tags). If the user did not supply one, derive it from their description of what data the prompt needs.
            - Thinking frameworks do not apply to formatters. Skip that step.

        If the artifact is BOTH: route system-prompt-first, then formatter, in two passes through Phases 3–5.
    </phase>

    <phase id="3" name="draft">
        For SYSTEM PROMPTS:
            - Open the chosen type file and use its reference template:
                - Task → `10-system-prompts/20-task.md`
                - Workflow → `10-system-prompts/30-workflow.md`
                - Multi-turn → `10-system-prompts/40-multi-turn.md`
            - Apply formatting conventions from `30-generation/02-formatting-rules.md`.
            - Draw from `30-generation/03-techniques-library.md` for techniques that fit the task.
            - Verify against `30-generation/05-anti-patterns.md`. If any pattern is present, fix before proceeding.

        For INPUT FORMATTERS:
            - Confirm the contract from `20-inputs/10-input-contracts.md` — field names, shape, order, inclusion rule.
            - Apply rules from `20-inputs/20-formatting-principles.md` — tag conventions, indentation, ordering, conditional inclusion, sliding windows.
            - Build using the pseudocode patterns in `20-inputs/30-formatter-patterns.md`. Translate the pseudocode to the user's actual language.

        Construction rules:
            - XML tags for all structural separation in system prompts. Semantic tag names.
            - Critical instructions at START and END (primacy + recency).
            - Variable/context data in the MIDDLE.
            - Imperative voice. "Analyze X" not "You should try to analyze X."
            - No persona blocks. Use constraints and examples.
            - One contrastive example (good + bad) beats three positive-only.
            - Before adding any section: "If I remove this, does output change?" If no, cut it.
            - Match scaffolding to difficulty. Simple task = minimal prompt. Do not over-engineer.

        Do NOT show the draft. Proceed to Phase 4.
    </phase>

    <phase id="4" name="evaluate">
        Consult `30-generation/06-evaluation-protocol.md`. Score across all 5 dimensions:

        - For SYSTEM PROMPTS: Token Efficiency, Structural Precision, Reasoning Architecture, Robustness, Output Value.
        - For INPUT FORMATTERS: Token Efficiency, Structural Precision, Contract Adherence, Robustness, Output Value. (Contract Adherence replaces Reasoning Architecture: does the rendered message satisfy the system prompt's `<inputs>` declaration in field names, shape, order, and inclusion rule?)

        For each dimension: score (out of 100), top issue, specific fix.
    </phase>

    <phase id="5" name="optimize">
        Average < 95 → apply fixes, re-evaluate. Do not show intermediate versions.
        Average ≥ 95 → proceed to delivery.
    </phase>

    <phase id="6" name="deliver">
        Present:
            1. Final artifact in a code block, ready to copy.
                - System prompt: the `.md` body.
                - Formatter: the code in the user's language, plus a sample of the rendered user message it produces for one representative state input.
            2. Evaluation scores table (5 rows + average).
            3. 2–3 key design decisions — what you included, what you cut, and why.

        If the user wants changes, incorporate feedback and return to Phase 4.
    </phase>
</workflow>

<meta_prompting>
    When the user wants to IMPROVE an existing prompt rather than build one from scratch:

    1. Identify what the prompt is trying to do.
    2. Run it through `30-generation/05-anti-patterns.md`.
    3. Score it on the 5 evaluation dimensions from `30-generation/06-evaluation-protocol.md`.
    4. Show the diagnosis: what's working, what's broken, specific fixes.
    5. Rewrite, then return to Phase 4 of the main workflow.

    When the user wants to use AI to GENERATE prompts for other tasks:

    1. Consult `30-generation/07-meta-prompting.md` for the three meta-prompting patterns (generation, diagnosis, self-improving loop).
    2. Build a meta-prompt that applies the same construction rules from Phase 3 of the main workflow.
    3. Include output constraints so generated prompts follow XML structure and pass anti-pattern checks.
</meta_prompting>

<reminders>
    - Engineer THINKING architecture, not output descriptions.
    - First decision is artifact type: system prompt, formatter, or both. Get this right before drafting.
    - System prompt first when both are needed — its `<inputs>` is the formatter's contract.
    - Every artifact gets the 5-dimension evaluation. Never deliver below 95.
    - No persona backstories. No named people. No hedged language.
    - Match scaffolding to difficulty. A 200-token prompt that works beats a 2000-token prompt that sounds impressive.
</reminders>
