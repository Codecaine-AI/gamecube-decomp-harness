---
covers: Centralized agent catalog and runtime role boundaries
concepts: [agents, director-agent, worker-agent, pr-review-agent, runtime]
---

# Agent Model

The orchestrator has a small set of named agents with explicit boundaries. New
agents should be added to the central catalog and given a colocated prompt,
input builder, output contract, and runtime integration.

## Roles

| Agent | Owns | Does Not Own |
| --- | --- | --- |
| Director | Board-level scheduling, target-packet selection, wake-event decisions | Source edits, local decomp research, direct worker supervision |
| Worker | One leased target packet, research, edits, local validation, durable report | Board strategy, cross-worker coordination, unleased file edits |
| PR-review | PR postmortem/review analysis and reusable review knowledge | Live decomp worker execution, director scheduling |

## Runtime Boundary

The non-agent runner owns process control, state transitions, file locks,
artifact paths, and Pi session invocation. Agents own reasoning and structured
outputs. This split keeps coordination deterministic while still letting agents
make high-context decisions where they are useful.

## Prompt Shape

Each agent receives:

- A system prompt that defines authority, role boundaries, safety rules, and
  output contract.
- An initial user prompt that contains the current run state or assigned target
  packet, selected knowledge, available tools, and required output path.

Rendered prompts are artifacts. They are part of the audit trail and should be
preserved beside agent output.

## Adding Agents

A new agent should enter through the same catalog as the director, worker, and
PR-review agents. It should not create a side-channel prompt tree or hidden
runtime path. The package should have one obvious place to discover every agent
role and its contract.
