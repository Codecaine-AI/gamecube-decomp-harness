---
covers: Centralized agent catalog, runtime role boundaries, and non-agent run-loop/guardian actors
concepts: [agents, scheduler, worker-agent, pr-review-agent, runtime, run-loop, guardians]
---

# Agent Model

The orchestrator has a small set of named agents with explicit boundaries. New
agents should be added to the central catalog and given a colocated prompt,
input builder, output contract, and runtime integration.

The package also has evented process actors such as the deterministic run loop
and the guardian process. They make rule-based
decisions and sleep between events, but they are not Pi agents. They own process
and state-machine mechanics, including target admission and ready-queue refill.

## Roles

| Agent | Owns | Does Not Own |
| --- | --- | --- |
| Worker | One leased target packet, research, edits, local validation, durable report | Board strategy, cross-worker coordination, unleased file edits |
| PR-review | PR postmortem/review analysis and reusable review knowledge | Live decomp worker execution, scheduler admission |
| Knowledge-curator | Reducing worker/PR evidence into graph-safe lessons and proposal-only source updates | Direct graph mutation, scheduling, decomp attempts |
| Reconcile | Making a bundle safe at run-cycle boundaries: fixing QA regressions before PR handoff (`ship-validate`) and resolving merge conflicts, duplicate work, and build errors after an upstream sync (`sync-merge`) | Board scheduling, lease-scoped worker tactics, knowledge graph mutation, publishing PRs |

The reconcile agent is deliberately not a worker capability. It needs
whole-checkout authority - merging, rebuilding, multi-file regression fixes -
that the lease/write-set model denies workers, and it only runs while
worker scheduling is locked (run paused or no session active). When
upstream already matched a function held locally, upstream wins; the local
attempt is preserved as lesson evidence for the curator pipeline, not as code.

## Process Actors

| Actor | Owns | Does Not Own |
| --- | --- | --- |
| Trigger actor | Durable wake-event reaction, deterministic scheduler ticks, epoch admission/refill, worker-slot realization, sleep between board events | Source edits, model-driven board strategy, process crash repair |
| Guardian process | Decomp system process health, incident capture, failed/expired lease recovery, restart policy | Target selection, worker tactics, hidden always-on agent memory |

## Runtime Boundary

The non-agent runner owns process control, state transitions, scheduler epochs,
file locks, artifact paths, and Pi session invocation. Agents own target-local
or boundary-specific reasoning and structured outputs. This split keeps
coordination deterministic while still letting agents make high-context
decisions where they are useful. The guardian may decide that a process incident
needs recovery, but the runtime materializes that intent as lease recovery
commands and process restarts.

## Prompt Shape

Each agent receives:

- A system prompt that defines authority, role boundaries, safety rules, and
  output contract.
- An initial user prompt that contains the current run state or assigned target
  packet, selected context, available resources/tools, and required output path.

Rendered prompts are artifacts. They are part of the audit trail and should be
preserved beside agent output.

## Adding Agents

A new agent should enter through the same catalog as the worker, PR-review,
knowledge-curator, reconcile, and QA repair agents. It should not create a
side-channel prompt tree or hidden runtime path. The package should have one
obvious place to discover every agent role and its contract.
