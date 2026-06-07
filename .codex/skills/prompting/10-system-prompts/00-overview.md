---
covers: System prompt types and routing logic for picking one
type: overview
concepts: [system-prompt, task, workflow, multi-turn, routing]
depends-on: [00-routing.md]
---

# System Prompts

A system prompt is the durable instruction artifact sent in the system message of one LLM call. It defines behavior; it does not contain runtime data. Runtime data arrives through the user message via an input formatter (`20-inputs/`).

System prompts in this skill are **Markdown files (`.md`) that use XML tags for structure** — not actual XML files. Markdown keeps the artifact readable; XML tags give the model clear structural boundaries.

## The Three Types

| Type | Calls | Output | Use when |
| --- | --- | --- | --- |
| **Task** | 1 | One bounded object | Input → output transform with no meaningful internal staging. |
| **Workflow** | 1 | One structured object produced via internal staging | Quality depends on the model moving through phases inside one response. |
| **Multi-turn** | N | One step's output and state per call; external code owns the loop | State changes between calls. Each call advances a process the application is orchestrating. |

### Task

One model call. One transform. No internal staging worth describing.

Examples: classify, extract fields, rewrite a passage, score against a rubric, normalize a record.

→ `20-task.md`

### Workflow

One model call. 

The prompt orchestrates internal multi-step reasoning, but the model returns once with one structured output. 

Staging happens inside the model's response.

Examples: 
 - analyze → critique → revise
 - extract → rank → synthesize
 - diagnose → plan → produce

→ `30-workflow.md`

### Multi-turn

Multiple model calls. External code owns the loop. Each call performs one step, returns its output and any state delta, then the application updates state and sends the next call. The prompt must declare its state contract, completion criteria, and tool policy.

Examples: spec interviews, agentic research loops, code-migration step processors, anything where the application drives a state machine through the model.

→ `40-multi-turn.md`

## Picking a Type

```text
Does state change between calls?
├─ Yes → MULTI-TURN
└─ No  → Single call.
         │
         Does the prompt benefit from internal staging
         (analyze, then critique; extract, then rank; etc.)?
         │
         ├─ Yes → WORKFLOW
         └─ No  → TASK
```

Use the smallest type that produces the required behavior:

- Start with **Task**.
- Upgrade to **Workflow** only when staged internal reasoning materially improves output quality.
- Upgrade to **Multi-turn** only when state must change between calls, or the loop is too long for one response.

A complex Task is still a Task. 

Internal complexity in the prompt does not require Workflow — Workflow is for cases where the model needs to *visibly* move through phases in its response.

## Selection Guide

| Signal | Archetype |
|--------|-----------|
| "Build me an agent/assistant that..." | System |
| "I need you to [single task]..." | Task |
| "Create a workflow/process that..." | Workflow |
| Long-running, many interactions | System |
| One-shot, clear deliverable | Task |
| Multi-step with dependencies | Workflow |
| Has tools/APIs | System |
| Needs branching logic | Workflow |


## Relationship to Inputs

Every system prompt declares what runtime data it expects. That declaration is the **output contract** the input formatter (`20-inputs/`) must satisfy.

- **Task** declares its runtime data via `<context>` sub-tags (`<data>`, `<message>`, `<document>`, etc.).
- **Workflow** and **Multi-turn** declare it via the `<inputs>` block inside `<workflow>`.

Draft the system prompt first so the input contract is fixed before you write code to satisfy it.

## Relationship to Generation

While drafting any system prompt, draw from `30-generation/`:

- `10-formatting-rules.md` — markdown+XML conventions (bullets, indentation, comments).
- `20-techniques.md` — contrastive examples, chain of verification, output priming, etc.
- `30-thinking-frameworks.md` — patterns for shaping the model's reasoning.
- `40-anti-patterns.md` — what to avoid (persona backstory, hedged instructions, redundant constraints).
- `50-evaluation.md` — formal scoring loop run before delivery.
