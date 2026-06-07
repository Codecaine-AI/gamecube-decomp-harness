---
covers: Multi-turn type — multiple calls where external code owns the loop and updates state between calls
type: prompt-type
concepts: [multi-turn, agent, phases, state, tools, loop]
depends-on: [10-system-prompts/00-overview.md]
---

# Multi-turn Prompt Archetype

A Multi-turn prompt is the system prompt for an agent that runs across multiple model calls. The application orchestrates the loop, the agent acts on each call, and state persists between calls.

The defining property: **state changes between calls, and the agent navigates that state**. Each call, the agent reads inputs and state, performs one phase's worth of work, returns its output, and the application updates state and issues the next call.

If the work fits in one response, use Workflow. If there's no internal staging, use Task.

## Shape

```text
Multi-turn System Prompt
├─ <purpose>
├─ <rules>
├─ <context>
├─ <goal>
├─ <overview>            phase map: one line per phase
├─ <workflow>
│   ├─ <inputs>
│   └─ <phases>
│       └─ <phase id name>
│           ├─ <objective>
│           ├─ <steps>
│           └─ <constraints>
├─ <error_handling>
├─ <success_criteria>
├─ <output_format>
└─ <reminders>
```

`<rules>` sit right after `<purpose>` so the agent reads its non-negotiables before any procedure. `<reminders>` repeat the most critical rules at the end for recency. Everything in between describes what the agent is doing and how.

## Writing `<phases>`

Phases in Multi-turn are different from Workflow phases. Workflow phases are sequential reasoning units inside one response. Multi-turn phases are positions the agent can be at across calls — and **a phase can be a loop**.

```xml
<phase id="2" name="focus_loop">
    <objective>
        Iteratively explore open questions until the spec is coherent.
    </objective>
    <steps>
        1. Pick the highest-leverage open question from state.
        2. Use the ask tool to gather user signal.
        3. Update spec.md with what was learned.
        4. If the question is resolved, mark it resolved.
        5. Loop to step 1 with the next open question.
    </steps>
    <constraints>
        - Update spec.md after every user response. Do not batch.
    </constraints>
</phase>
```

Rules:

- **Phases are navigated by state, not by turn count.** The agent reads state at the start of each call and decides which phase it is in. "On turn 3" is fragile; "while questions has open entries" is robust.
- **A phase can loop internally.** End the steps with "Loop to step N" when the agent should iterate within the phase across calls.
- **Each phase ends when its advancement condition is met.** Describe the condition in steps or constraints — no separate `<gate>` block. ("When questions has zero open entries, the next call enters phase 3.")
- **Phase steps reference tools by name.** Tools are declared in frontmatter; the prompt body uses them. Imperative voice: "Call `spec_resolve_question(id)`."
- **Keep phases to 2–6.** Setup, main loop, finalize is a common shape.

## Reference Template

```xml
<!--
  PURPOSE
  Format: 1-3 short sentences

  What this agent does and why it exists. No persona, no backstory.
  State the agent's job in concrete terms.

  BAD: "You are a helpful assistant that helps users build specs"
  GOOD: "Build a feature spec by interviewing the user one question at a time
         and updating the spec document after every response."
-->
<purpose>
    [What this agent does, in concrete terms]
</purpose>

<!--
  RULES
  Format: Numbered or bulleted list (under 7 items)

  Non-negotiable behavioral constraints. Absolute language only.
  Sit near the top so the agent reads them before procedure.

  - Never [X]
  - Always [Y]
  - When [condition], do [action]

  More than 7 rules means you're overspecifying. Split into rules
  (non-negotiable) and constraints (per-phase) if needed.
-->
<rules>
    1. [Never ...]
    2. [Always ...]
    3. [When ..., do ...]
</rules>

<!--
  CONTEXT
  Format: Prose paragraph(s)

  Why this work matters. Background the agent needs to make good decisions
  in situations the prompt didn't explicitly anticipate. State schema
  references, conventions, naming, system invariants — anything that
  grounds the agent's autonomy.

  Unstructured on purpose — write what the agent needs to know, not what
  fits a template.
-->
<context>
    [Prose explaining the situation, the system the agent operates in,
    the state it reads and writes, and why the work matters]
</context>

<!--
  GOAL
  Format: 1-3 short sentences

  What the agent is trying to achieve overall, across the whole loop.
  Distinct from <purpose>: purpose is what the agent does; goal is the
  end state it's working toward.

  BAD: "Help the user build a great spec"
  GOOD: "Produce a finalized spec.md that captures the user's requirements
         as coherent prose, with zero open questions remaining."
-->
<goal>
    [What the agent is working toward across the full loop]
</goal>

<!--
  OVERVIEW
  Format: Numbered list (2-6 items)

  Phase map. One line per phase, in the order they typically run.
  The agent uses this to orient itself at the start of each call.
-->
<overview>
    1. [phase_name] — [one-line intent]
    2. [phase_name] — [one-line intent]
    3. [phase_name] — [one-line intent]
</overview>

<!--
  WORKFLOW
  Format: Envelope holding inputs and phases

  The actual procedure the agent runs.
-->
<workflow>
    <!--
      INPUTS
      Format: Bullet list of named runtime inputs

      What the application passes the agent on each call. Reference state
      paths and pipeline_context fields. The agent reads these to determine
      which phase it is in and what to do.
    -->
    <inputs>
        - `<pipeline_context>`: [fields the agent reads]
        - state.[path]: [what the agent reads from state]
    </inputs>

    <!--
      PHASES
      Format: Named <phase> blocks with id and name

      Each phase is a position the agent can be at. A phase can loop
      internally — describe the loop in steps with "Loop to step N".
      Advancement happens when the phase's condition is met (described
      in steps or constraints).

      - Name phases descriptively: read_state, focus_loop, finalize.
      - Keep to 2-6 phases.
    -->
    <phases>
        <!--
          PHASE: <objective>
          Format: 1-2 sentences

          What this phase accomplishes.
        -->
        <!--
          PHASE: <steps>
          Format: Numbered list, imperative voice

          What the agent does in this phase. Reference tools by name.
          Include "If X, ..." for branches.
          End with "Loop to step N" when the phase iterates across calls.

          BAD: "Consider asking the user a question"
          GOOD: "Call `ask` with the highest-leverage open question"
        -->
        <!--
          PHASE: <constraints>
          Format: Bullet list (optional)

          Phase-specific rules. Things that apply only when in this phase.
          Workflow-wide rules belong in <rules>, not here.
        -->
        <phase id="1" name="[phase_name]">
            <objective>
                [What this phase accomplishes]
            </objective>
            <steps>
                1. [Imperative action]
                2. [Imperative action]
            </steps>
            <constraints>
                - [Phase-specific rule]
            </constraints>
        </phase>

        <phase id="2" name="[phase_name]">
            <objective>
                [What this phase accomplishes — often a loop]
            </objective>
            <steps>
                1. [Imperative action]
                2. [Imperative action]
                3. If [condition], [action].
                4. Loop to step 1 until [advancement condition].
            </steps>
        </phase>

        <phase id="3" name="[phase_name]">
            <objective>
                [Terminal phase — produces final output and exits]
            </objective>
            <steps>
                1. [Imperative action]
                2. [Call the completion tool or emit final output]
            </steps>
        </phase>
    </phases>
</workflow>

<!--
  ERROR HANDLING
  Format: Bullet list of scenario → instruction pairs

  How the agent should respond when something goes wrong.
  Cover: ambiguous input, tool failure, state inconsistency,
  unexpected user signals, requirements that change mid-loop.
-->
<error_handling>
    - Ambiguous input: [instruction]
    - Tool call fails: [instruction]
    - State is inconsistent: [instruction]
    - User signals stop mid-loop: [instruction]
</error_handling>

<!--
  SUCCESS CRITERIA
  Format: Bullet list

  The testable bar for whether the whole job is done well. The agent
  self-checks against this before producing final output or completing.

  BAD: "Spec is high quality"
  GOOD: "spec.md reads as coherent prose covering goals, non-goals,
         and design decisions. No open questions remain."
-->
<success_criteria>
    - [Concrete, testable criterion the final state must satisfy]
    - [Another criterion]
</success_criteria>

<!--
  OUTPUT FORMAT
  Format: Per-call response schema

  The shape the agent returns on each call. For interactive agents,
  this is often the user-facing response plus tool calls. For
  background agents, it's the structured payload the application
  consumes.
-->
<output_format>
    [Per-call response shape — what the agent emits each turn]
</output_format>

<!--
  REMINDERS
  Format: 2-3 bullets

  Repeat the most critical rules at the end. Recency effect.
  Pick the rules most likely to drift, not all of them.
-->
<reminders>
    - [Critical rule worth repeating]
    - [Another critical rule]
</reminders>
```

## Key Decisions

- **`<rules>` sit right after `<purpose>`.** Constraints before capabilities. The agent reads its non-negotiables before any procedure.
- **`<context>` is prose, not structured.** Background, state schema references, conventions, system invariants — written naturally. The agent has agency, so it needs grounding to make good decisions in unanticipated situations.
- **`<goal>` is the end state, not the procedure.** Distinct from `<purpose>` (what the agent does) and `<overview>` (how the phases lay out).
- **Phases are positions, not stages.** The agent reads state at the start of each call and determines which phase it is in. A phase can be a loop — `<steps>` describes the iteration.
- **No `<gate>` per phase.** Advancement conditions live inside `<steps>` or `<constraints>`. ("Advance to phase 3 only when questions[] has zero open entries.")
- **No per-phase `<inputs>` block.** Workflow-level `<inputs>` covers what's passed in; phase steps reference state and inputs directly.
- **Tools are declared in frontmatter, used by name in the body.** The prompt body doesn't need a separate `<tool_policy>` block — tool usage is described inline in steps.
- **`<reminders>` repeats 2–3 most critical rules at the end.** Recency effect. Pick the rules most likely to drift, not all of them.

## Anti-Patterns

- **Don't drive phases by turn count.** "On turn 3, do X" breaks resumability. Read state and determine phase from there.
- **Don't write a `<state_contract>` block.** State references go in `<context>` and `<inputs>`. A separate contract is overkill.
- **Don't write a `<tool_policy>` block.** Tools are in frontmatter; usage is in steps.
- **Don't write a `<sub_phases>` block.** Branches and side-loops live inside a phase's `<steps>` ("If X, do Y; otherwise loop").
- **Don't write a `<response_templates>` block.** Per-call shape goes in `<output_format>`. Per-scenario formatting belongs inline in steps.
- **Don't put more than 7 rules in `<rules>`.** Overspecification. Split into `<rules>` (non-negotiable) and per-phase `<constraints>` (situational).
- **Don't repeat all rules in `<reminders>`.** Reminders are for the 2–3 most likely to drift. Repeating everything dilutes the effect.
- **Don't conflate `<rules>` and `<constraints>`.** Rules are workflow-wide non-negotiables. Constraints are phase-specific.
- **Don't conflate `<goal>` and `<success_criteria>`.** Goal is the intended end state. Success criteria are the testable bar for "is the end state actually good."
