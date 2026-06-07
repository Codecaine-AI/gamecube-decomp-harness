---
covers: Operational workflow for stateful prompt runs
type: workflow
concepts: [prompt-run, steps, inputs, outputs, state]
depends-on: [../../05-run-model.md, ../../08-core-methodology.md]
---

# Prompt Run Workflow

Use this workflow for every prompt creation, prompt improvement, prompt diagnosis, or prompt/formatter pair produced by this skill.

## Directory Shape

```text
.prompt-runs/{run-id}/
├── state.json
├── run-summary.md
├── inputs/
├── steps/
└── outputs/
```

- `inputs/` stores source material and user-provided context.
- `steps/` stores scratchpad artifacts for the run loop.
- `outputs/` stores final deliverables only.
- `state.json` tracks phase/status.
- `run-summary.md` gives a human-readable overview.

## Workflow Steps

1. `10-init.md` — create or resume the run.
2. `20-clarify.md` — ask high-leverage clarifying questions when needed.
3. `30-brief.md` — create the prompt brief and pass the clarification gate.
4. `40-architect.md` — choose artifact type, prompt type, and techniques.
5. `50-draft.md` — draft the prompt or formatter.
6. `60-evaluate.md` — evaluate and optimize until the artifact is ready.
7. `70-finalize.md` — save final outputs and report.

For existing prompt improvement, include diagnosis inside `steps/03-diagnosis.md` before architecture. Diagnosis uses `../../30-generation/05-anti-patterns.md` and `../../30-generation/06-evaluation-protocol.md`.

## Step File Convention

Use numbered step files so the run is easy to skim and resume:

```text
steps/
├── 01-clarification.md
├── 02-brief.md
├── 03-diagnosis.md
├── 04-architecture.md
├── 05-draft.md
├── 06-evaluation.md
└── 07-finalize.md
```

Skip irrelevant steps only by marking them `Not applicable` in the step file or state. Do not silently omit important reasoning.

## Completion Criteria

A run is complete when:

1. Source material is preserved in `inputs/`.
2. The prompt brief is sufficient.
3. The artifact is drafted against the relevant reference docs.
4. Evaluation is complete and passes the required bar.
5. Final outputs are saved in `outputs/`.
6. `run-summary.md` explains what changed and why.
