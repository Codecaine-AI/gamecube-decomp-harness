---
covers: Workflow type — single call with internal staging across multiple reasoning phases
type: prompt-type
concepts: [workflow, single-completion, phases, reasoning-architecture]
depends-on: [10-system-prompts/00-overview.md]
---

# Workflow Prompt Archetype

## Shape

```text
Workflow System Prompt
├─ <overview>            phase map: one line per phase
├─ <phases>
│   └─ <phase id name>
│       ├─ <objective>
│       ├─ <inputs>
│       ├─ <process>
│       ├─ <output>
│       └─ <gate>
├─ <global_constraints>
├─ <error_handling>
├─ <success_criteria>
└─ <output_format>
```

The model needs the full map (`<overview>`) before walking the phases. Each phase is self-contained — objective, inputs, process, output, gate — and the output of one phase becomes input for the next.

## Writing `<phases>`

Each phase is one bounded sub-process the model completes before moving on. The model walks the phases in order, and the gate prevents bad output from cascading.

```xml
<phase id="1" name="[phase_name]">
    <objective>
        [What this phase accomplishes — one or two sentences]
    </objective>
    <inputs>
        - [What this phase receives — workflow inputs, prior-phase output, or both]
    </inputs>
    <process>
        - [Imperative action]
        - [Imperative action]
        - If [condition], do X. Otherwise, do Y.
    </process>
    <output>
        [Exact format this phase produces — becomes input for the next phase]
    </output>
    <gate>
        - [Criterion that must be met before advancing]
    </gate>
</phase>
```

Rules:

- **Name phases with descriptive names.** `analyze`, `critique`, `synthesize` — not `phase_1`.
- **Each phase's output should be the next phase's input.** If phase 2 doesn't use phase 1's output, they aren't a sequence.
- **Keep phases to 2–5.** More than that and the model loses the thread.
- **`<process>` is imperative, not narrative.** "List every claim the draft makes" — not "you should consider listing the claims."
- **Include decision points in `<process>`.** "If X, do Y. Otherwise, do Z."
- **`<gate>` is a self-check, not a hand-off.** The model verifies the gate inside its own response before producing the next phase's work.

## Reference Template

```xml
<!--
  OVERVIEW
  Format: Numbered list (2-5 items)

  The phase map. One line per phase, in order.
  The model needs the full path before walking it.
-->
<overview>
    1. [phase_name] — [one-line intent]
    2. [phase_name] — [one-line intent]
    3. [phase_name] — [one-line intent]
</overview>

<!--
  PHASES
  Format: Named <phase> blocks with id and name

  Each phase is one bounded sub-process. Output of one phase
  becomes input for the next.

  - Name phases descriptively: analyze, critique, synthesize.
  - Keep to 2-5 phases.
  - Each phase's <output> should be the next phase's <inputs>.
-->
<phases>
    <!--
      PHASE: <objective>
      Format: One or two sentences

      What this phase accomplishes. Specific and bounded.
    -->
    <!--
      PHASE: <inputs>
      Format: Bullet list

      What this phase receives. Reference workflow runtime variables
      by name or "output from phase N".
    -->
    <!--
      PHASE: <process>
      Format: Imperative bullet list, may include decision points

      Step-by-step actions inside this phase. Imperative voice.
      Include "If X, do Y. Otherwise, do Z." for branches.

      BAD: "Consider analyzing the claims"
      GOOD: "List every claim the draft makes"
    -->
    <!--
      PHASE: <output>
      Format: Exact structure produced by this phase

      What the phase produces. Becomes input for the next phase.
      Be literal so the next phase can rely on the shape.
    -->
    <!--
      PHASE: <gate>
      Format: Bullet list of advance criteria

      Self-check the model performs before moving to the next phase.
      If the gate fails, the model revises this phase's output.
    -->
    <phase id="1" name="[phase_name]">
        <objective>
            [What this phase accomplishes]
        </objective>
        <inputs>
            - [Workflow input or prior-phase output this phase uses]
        </inputs>
        <process>
            - [Imperative action]
            - [Imperative action]
            - If [condition], do X. Otherwise, do Y.
        </process>
        <output>
            [Exact format produced — becomes phase 2's input]
        </output>
        <gate>
            - [Criterion that must be met before advancing]
        </gate>
    </phase>

    <phase id="2" name="[phase_name]">
        <objective>
            [What this phase accomplishes]
        </objective>
        <inputs>
            - Output from phase 1
        </inputs>
        <process>
            - [Imperative action]
        </process>
        <output>
            [Exact format produced]
        </output>
        <gate>
            - [Advance criterion]
        </gate>
    </phase>
</phases>

<!--
  GLOBAL CONSTRAINTS
  Format: Numbered list (3-6 items)

  Non-negotiable constraints that apply across every phase
  and the final output. Tone, format, hard limits, things to never do.
-->
<global_constraints>
    1. [Non-negotiable]
    2. [Non-negotiable]
</global_constraints>

<!--
  ERROR HANDLING
  Format: Bullet list of scenario → instruction pairs

  How the model should respond when something goes wrong.
  Cover at minimum: ambiguous input, unexpected output, gate fails,
  requirements that change mid-workflow.
-->
<error_handling>
    - Ambiguous input: [instruction]
    - Unexpected output from a phase: [instruction]
    - Gate fails after revision: [instruction]
    - Requirements change mid-workflow: [instruction]
</error_handling>

<!--
  SUCCESS CRITERIA
  Format: Bullet list

  The testable bar for whether the output is good.
  The model self-checks against this before producing final output.

  BAD: "Output should be high quality"
  GOOD: "Every claim in the revised draft is supported by a specific edit
         in the critique. No vague phrases from the analysis remain."
-->
<success_criteria>
    - [Concrete, testable criterion the output must satisfy]
    - [Another criterion]
</success_criteria>

<!--
  OUTPUT FORMAT
  Format: Field schema

  Include intermediate-phase outputs in the schema if you want the model
  to actually do those phases. Otherwise the model will skip them.
-->
<output_format>
    - [Field]: [description]
</output_format>
```

## Key Decisions

- Overview first — the model sees the full path before starting.
- Each phase is self-contained with explicit inputs/outputs for debugging.
- Gates prevent bad output from cascading through phases.
- Error handling is NOT optional for workflows.
- **`<success_criteria>` is the test for the final output.** The model self-checks against this before producing final output.