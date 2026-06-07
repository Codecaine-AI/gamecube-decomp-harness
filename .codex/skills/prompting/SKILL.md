---
name: prompting
description: Create and improve prompts and input formatters for LLM calls.
---

# Prompting Skill

## Purpose

Use this skill to create, improve, or diagnose prompts and input formatters for programmatic LLM calls.

Every invocation creates or resumes a **prompt run**. A prompt run is a stateful scratchpad with inputs, step artifacts, and final outputs. Runs can be short when requirements are clear or clarification-heavy when the prompt's purpose, inputs, output, or failure modes are unclear.

This file is the entrypoint only. The core prompt-engineering method lives in `08-core-methodology.md`.

## Start Here

1. Read `05-run-model.md` to understand the prompt-run lifecycle.
2. Read `workflows/prompt-run/00-overview.md` for the operational workflow.
3. Read `00-routing.md` to choose the artifact type:
   - System prompt
   - Input formatter
   - Both
4. Read `08-core-methodology.md` for the shared prompt-engineering workflow.
5. Load the relevant reference docs before drafting:
   - System prompts: `10-system-prompts/00-overview.md`
   - Input formatters: `20-inputs/00-overview.md`
   - Generation rules: `30-generation/`

## Non-Negotiables

1. Always create or resume a prompt run before doing substantive prompt work.
2. Preserve source material in the run's `inputs/` directory before rewriting it.
3. Clarify before drafting when intent, runtime inputs, desired output, or failure modes are unclear.
4. Do not draft until the brief is sufficient or the user approves explicit assumptions.
5. Do not deliver an artifact without running the evaluation protocol in `30-generation/06-evaluation-protocol.md`.
6. Use XML structure for system prompts and rendered formatter messages.
7. Never use persona backstories or named-person imitation.
8. Use imperative voice in prompts. Avoid hedged language.
9. Every section must justify its token cost. Cut anything that does not change output.

## Run Summary

A prompt run lives under `.prompt-runs/{run-id}/` and contains:

```text
.prompt-runs/{run-id}/
├── state.json
├── run-summary.md
├── inputs/
├── steps/
└── outputs/
```

The run records what was asked, what was clarified, what was decided, how the artifact was drafted, how it evaluated, and what final outputs were produced.

## Default Behavior

- If the user asks to create a new prompt, create a prompt run from the request.
- If the user asks to improve an existing prompt, create a prompt run and preserve the original prompt in `inputs/original-prompt.md`.
- If the user asks a quick prompt question, only create a run when producing or changing a prompt artifact.
- If multiple prompts are involved, a higher-level orchestration workflow should inventory them and invoke this skill separately per prompt.
- In all runs, use `08-core-methodology.md` as the prompt-engineering engine.
