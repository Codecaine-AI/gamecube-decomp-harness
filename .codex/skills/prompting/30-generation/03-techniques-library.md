# Techniques Library

Practical techniques to embed in prompts. Grouped by function. Each: what it does, when to use it, implementation.

---

## Reasoning

**Atom of Thought (AoT)** — Break problems into independent "atoms" that can be solved separately, then synthesize. Unlike chain reasoning, atoms don't depend on each other — they're verified independently before assembly. 30-40% more accurate than Chain of Thought on complex reasoning tasks.
```xml
<approach>
1. Decompose this problem into independent sub-questions (atoms)
2. Solve each atom separately — do not let one solution influence another
3. Verify each atom independently
4. Synthesize atoms into a final answer, resolving any conflicts
</approach>
```
Use for: complex reasoning, multi-factor analysis, problems where sequential thinking creates confirmation bias.

**Chain of Verification (CoVe)** — Generate → extract every claim → verify each independently → correct. 94% more accurate than few-shot prompting on factual tasks.
```xml
<approach>
1. Generate your initial response
2. List every factual claim you made
3. For each claim, verify independently: is this accurate?
4. Correct any claim that fails verification. Mark uncertain claims.
5. Present only the verified version
</approach>
```
Use for: factual outputs, research, analysis where hallucination is costly.

**Socratic Prompting** — Convert missing information into explicit questions before generating answers. Question the question, question the assumptions, question the evidence, then answer.
```xml
<approach>
Before answering:
1. What is actually being asked? Restate the core question.
2. What assumptions does this question contain? List them.
3. What evidence would I need to answer well? Do I have it?
4. What would a skeptic ask about my planned answer?
5. Now answer, addressing all of the above.
</approach>
```
Use for: ambiguous requests, complex analysis, preventing premature conclusions.

**Chain of Draft** — Token-efficient reasoning. Think step by step but keep only a minimal draft per step (5 words max). Return the answer after ####.
Use for: math, logic, symbolic reasoning where full chain-of-thought is wasteful.

**Self-Consistency** — Solve 3 different ways, compare. If they agree, that's the answer. If not, analyze why and pick the most robust.
Use for: accuracy-critical tasks where you need confidence in the result.

**Step-Back Prompting** — "Before solving, what general principles govern this problem type?" Then apply to specifics.
Use for: STEM, knowledge-intensive tasks, applying general rules to specific cases.

---

## Structure

**XML Architecture** — Semantic tag names (`<customer_complaint>` not `<input>`). Nest for hierarchy. Reference tags in instructions. Works across all modern LLMs, optimized for Claude.

**Primacy-Recency Positioning** — Critical rules at START and END. Context/data in the MIDDLE.
```xml
<rules>[most important constraints]</rules>
<context>[background, data, examples]</context>
<task>[the instruction]</task>
<reminders>[repeat critical rules]</reminders>
```

**Output Priming** — End the prompt with the literal start of expected output to lock format. In API: use assistant prefill.

**Contrastive Examples** — Show good AND bad outputs with explanations. One contrastive pair beats three positive-only examples.
```xml
<examples>
<good_example>
[output]
Why this works: [explanation]
</good_example>
<bad_example>
[output]
Why this fails: [explanation]
</bad_example>
</examples>
```

**Prompt Duplication** — Repeating the core instruction twice in the prompt can boost accuracy significantly on certain tasks. Place the instruction at the start and rephrase at the end.
Use for: long prompts where the core instruction might get lost in context. Not for short, focused prompts.

**Contract-Style Prompts** — Frame the prompt as a detailed agreement between user and AI: task parameters, constraints, success criteria, and expected outputs. Models trained on RLHF respond well to explicit "contracts."
```xml
<contract>
You will: [specific deliverable]
You will NOT: [explicit exclusions]
Success criteria: [measurable outcomes]
Output format: [literal template]
</contract>
```

---

## Quality

**Inner Critic Loop** — Generate → critique ("What's weak? What would an expert push back on?") → rewrite. Present only the rewritten version.
Use for: any output where first-draft quality isn't sufficient.

**Negative Space Definition** — Define what the output must NOT be. "This output must NOT: sound like default AI advice, hedge without resolving, list when user needs a decision."
Use for: when "generic AI response" is the primary risk.

**Cascading Protocol** — Apply structured reasoning at every task level in an agent workflow, not just the top level. Each subtask gets its own verification step.
Use for: agentic workflows where errors in subtasks cascade to final output.

---

## Interaction

**Reverse Prompting** — "Before attempting output, ask me 2-3 targeted questions. Each round builds on previous answers. When you have enough context, tell me and summarize."
Use for: tasks where the user's initial request is likely underspecified.

**Decision Support** — "Do not recommend one option. Present each with its strongest case. State conditions under which each is BEST. Identify the key tradeoff."
Use for: decisions where the user needs to weigh tradeoffs, not receive a recommendation.

---

## Efficiency

**Compression techniques:**
- Semantic tag names that double as instructions
- Cut any instruction the model follows by default
- One contrastive example instead of three positive-only
- Merge overlapping instructions into one precise statement

**Token Budget:** "Response must not exceed [N] tokens. If you can't cover everything, prioritize: 1. [X] 2. [Y] 3. [Z]. Cut everything else."

**Embedded Stakes:** Place stakes naturally within the task, not as a separate section. "This analysis informs a $2M investment decision — precision over speed." One line, embedded in context.

---

## Meta-Prompting

**Prompt Generation** — Use an LLM to generate prompts for other tasks. Build a meta-prompt that specifies: task type, output format, constraints, and quality criteria for the generated prompt.

**Prompt Refinement** — Feed an underperforming prompt to the LLM with examples of bad output and ask: "What's wrong with this prompt? Rewrite it to fix [specific failure]."

**Self-Improving Loop** — Generate prompt → test output → feed output back as evidence → refine prompt. Iterate until output quality stabilizes.

Use for: scaling prompt creation, improving prompts you can't diagnose manually, creating prompt libraries.

## Connects To
- 01: Context engineering principles behind technique selection
- 02: How techniques embed within each archetype
- 04: Thinking frameworks (heavier-weight than techniques)
- 05: Anti-patterns that techniques should prevent
