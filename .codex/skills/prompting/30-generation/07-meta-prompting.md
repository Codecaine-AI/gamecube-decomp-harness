# Meta-Prompting

Using an LLM to generate, refine, and improve the prompts you use to get work done. The prompt-engineering multiplier — instead of iterating manually, make the model iterate on its own instructions.

---

## Three Patterns

### 1. Prompt Generation

Use an LLM to create prompts for specific tasks.

```xml
<task>
    Generate a prompt for: [task description]

    The generated prompt must:
    - Use XML tags for all structure
    - Include a literal output template
    - Contain at least one contrastive example (good + bad)
    - Use imperative voice, no hedging
    - Be under [N] tokens
</task>

<constraints>
    The prompt you generate is for [model name].
    The end user will paste it as a [system prompt / task prompt / workflow].
    It must work without modification — ready to copy-paste.
</constraints>

<output_format>
    Return the prompt in a code block. After the code block, explain in 2-3 sentences why you structured it this way.
</output_format>
```

### 2. Prompt Diagnosis

Feed an underperforming prompt + its bad output to the LLM.

```xml
<task>
    Diagnose why this prompt produces suboptimal output.
</task>

<prompt_under_review>
    [paste the prompt]
</prompt_under_review>

<bad_output>
    [paste the output that's not working]
</bad_output>

<constraints>
    Identify:
    1. Which specific instructions the model is misinterpreting and why
    2. What's missing that would fix the output
    3. What's present that's degrading quality (wasted tokens, contradictions)

    Then rewrite the prompt with fixes applied.
</constraints>
```

### 3. Self-Improving Loop

Iterate a prompt against its own output until quality stabilizes.

```text
Cycle 1: Generate prompt → test on 3 inputs → collect outputs
Cycle 2: Feed outputs back as evidence → "What's wrong with these outputs? Rewrite the prompt to fix it."
Cycle 3: Test rewritten prompt on same 3 inputs → compare
Cycle 4: Repeat until output quality stops improving
```

Typically converges in 3-4 cycles. If it doesn't converge, the task specification is ambiguous — clarify requirements before iterating further.

---

## Pre-Prompting

Before writing the actual prompt, use the LLM to help you think:

**Task analysis:** "I need to build a prompt for [task]. What are the 3 most likely failure modes? What would make the output useless?"

**Requirement extraction:** "Here's a vague request from a user: [request]. Extract the specific requirements, constraints, and success criteria hidden in this request."

**Technique selection:** "Given this task: [task], which prompting techniques would provide the highest ROI? Rank by impact and explain."

Pre-prompting turns the LLM into a collaborator on prompt design before you commit to a structure.

---

## When to Use Meta-Prompting

**High value:**

- Creating prompt libraries for recurring task types.
- Diagnosing prompts that produce inconsistent output.
- Scaling prompt creation across a team.
- Improving prompts you can't diagnose manually.

**Low value:**

- Simple one-off tasks — just write the prompt directly.
- Tasks where you already know the optimal structure.
- When the problem is data quality, not prompt quality.

---

## Common Mistakes

**Infinite recursion** — Using meta-prompting to generate a meta-prompt to generate a meta-prompt. One level of meta is almost always enough. Two is occasionally justified. Three is never useful.

**Optimizing the wrong thing** — The meta-prompt improves structure, but the real problem is missing context or wrong task specification. Fix the inputs before optimizing the prompt.

**Ignoring evaluation** — Generating new prompts without testing against the original. Always compare outputs side-by-side on the same inputs.

## Connects To

- `03-techniques-library.md` — techniques that meta-prompts should incorporate.
- `05-anti-patterns.md` — patterns meta-prompting can surface automatically.
- `06-evaluation-protocol.md` — applied to meta-prompt outputs before delivery.
