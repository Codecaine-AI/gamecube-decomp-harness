---
covers: Stateful prompt-run model used by every invocation of the prompting skill
type: workflow-model
concepts: [prompt-run, state, scratchpad, clarification, run-loop]
depends-on: [00-routing.md, 08-core-methodology.md]
---

# Prompt Run Model

Every substantive invocation of this skill creates or resumes a **prompt run**.

A prompt run is a durable workspace for one prompt artifact or tightly coupled prompt/formatter pair. It keeps source inputs, step-by-step working notes, state, and final outputs separate.

## Mental Model

```text
user request + source material
        ↓
.prompt-runs/{run-id}/
        ↓
clarify → brief → architect → draft → evaluate → finalize
        ↓
final prompt / formatter / report
```

There is no separate lightweight mode. Simple work produces a short run. Ambiguous work produces a longer run with more clarification.

## Run Directory

```text
.prompt-runs/{run-id}/
├── state.json
├── run-summary.md
├── inputs/
│   ├── request.md
│   ├── original-prompt.md
│   ├── context.md
│   └── examples.md
├── steps/
│   ├── 01-clarification.md
│   ├── 02-brief.md
│   ├── 03-diagnosis.md
│   ├── 04-architecture.md
│   ├── 05-draft.md
│   ├── 06-evaluation.md
│   └── 07-finalize.md
└── outputs/
    ├── system-prompt.md
    ├── formatter.*
    ├── improved-prompt.md
    └── final-report.md
```

Not every run uses every file. Create only the files that apply, but keep the directory shape stable.

## Run ID

Use this format:

```text
{YYYY-MM-DD}_{topic-slug}_{6-char-hex}
```

Examples:

```text
2026-05-05_support-triage-prompt_a1b2c3
2026-05-05_new-lead-scoring-prompt_d4e5f6
```

## State

`state.json` tracks the run. It is for workflow state, not prose requirements.

Minimum fields:

```json
{
  "id": "2026-05-05_support-triage-prompt_a1b2c3",
  "status": "active",
  "phase": "clarify",
  "artifact_type": "unknown",
  "source_type": "existing_prompt",
  "created_at": "2026-05-05T00:00:00.000Z",
  "updated_at": "2026-05-05T00:00:00.000Z",
  "steps": {
    "clarification": "pending",
    "brief": "pending",
    "diagnosis": "not_applicable",
    "architecture": "pending",
    "draft": "pending",
    "evaluation": "pending",
    "finalize": "pending"
  },
  "outputs": []
}
```

## Run Loop

1. **Initialize** — create the run directory and preserve source material.
2. **Clarify** — ask numbered questions if the brief cannot be completed from available context.
3. **Brief** — write the prompt brief: intended job, inputs, output, constraints, and failure modes.
4. **Diagnose** — for existing prompts, identify what works, what fails, and what must change.
5. **Architect** — choose artifact type, prompt type, formatter contract, and relevant techniques.
6. **Draft** — create or revise the artifact using `08-core-methodology.md` and reference docs.
7. **Evaluate** — score the artifact using `30-generation/06-evaluation-protocol.md`.
8. **Finalize** — write final outputs and final report.

## Clarification Gate

Do not draft until the brief identifies:

1. Intended job.
2. Artifact type.
3. Runtime inputs.
4. Desired output.
5. Known or likely failure modes.
6. Hard constraints.

If any are missing, ask numbered clarifying questions or write explicit assumptions and ask the user to approve them.

## Quick Runs

When requirements are clear, the run can move quickly:

```text
initialize → brief → architect → draft → evaluate → finalize
```

Still create state and step files. The scratchpad is useful even for quick work.

## Existing Prompt Runs

For prompt improvement:

1. Save the original prompt to `inputs/original-prompt.md`.
2. Write the intended job in `steps/02-brief.md`.
3. Write diagnosis in `steps/03-diagnosis.md`.
4. Save the rewritten prompt to `outputs/improved-prompt.md` or `outputs/system-prompt.md`.

## New Prompt Runs

For new prompt creation:

1. Save the user request to `inputs/request.md`.
2. Ask clarifying questions if the request is vague.
3. Skip diagnosis unless there are examples of failed outputs or prior attempts.
4. Save the new artifact to `outputs/system-prompt.md`, `outputs/formatter.*`, or both.

## Multiple-Prompt Work

This skill owns one prompt run at a time. If the user wants a prompt library updated, a higher-level workflow should inventory the prompts and create one prompt run per prompt.

## Connects To

- `workflows/prompt-run/00-overview.md` — operational workflow.
- `00-routing.md` — artifact routing inside a run.
- `08-core-methodology.md` — shared prompt-engineering engine.
- `30-generation/06-evaluation-protocol.md` — mandatory evaluation loop.
