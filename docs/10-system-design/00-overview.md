---
covers: D-Comp Orchestrator system design map
concepts: [system-design, scheduler, workers, durable-state, process-guardians, knowledge, score-gate]
---

# System Design Overview

D-Comp Orchestrator is an event-driven coordination system for decompilation
work. A thin runner owns durable state transitions, deterministic scheduling,
and agent invocation. Pi agents own bounded target-local or boundary-specific
reasoning. The board is the shared medium between those two worlds.
An optional guardian process can wrap the decomp system process to handle
operational health events, recovery, and restart without becoming a second
board scheduler.

## Architecture Map

```text
OWNERSHIP LAYOUT

+----------------------+     +--------------------------+     +----------------------+
| Scheduler scope      |     | Shared run state         |     | Worker execution     |
| - run target         |     | - epochs/targets         |---->| - claim A Pi worker  |
| - indexer output     |<--->| - claims/events          |<----| - claim B Pi worker  |
| - reducer output     |     | - worker states          |     | - claim N Pi worker  |
| - epoch policy       |     | - artifacts/wakeups      |     | - PR/docs/source     |
+----------------------+     | - checkpoints/facts      |     | - experimental       |
                             +------------+-------------+     |   search             |
                                          |                   | - permuter handoff   |
                                          v                   +----------------------+
                             +------------+-------------+
                             | Score gate                |
                             | verify / absorb           |
                             | refresh baseline          |
                             +--------------------------+
```

```text
RUNTIME FEEDBACK LOOP

run target + report/graph evidence
        |
        v
+---------------------+       epoch policy     +--------------------------+
| Deterministic       |----------------------->| State substrate          |
| scheduler           |<-----------------------| wake event + snapshot    |
| admit/drain/route   |    wake + snapshot     | epochs / claims / facts  |
+---------------------+                        +------------+-------------+
                                          |
                                          v
                              target packets / claims
                                          |
                                          v
                             +------------+-------------+
                             | Worker pool              |
                             | Pi workers under claims  |
                             | selected capabilities    |
                             +------------+-------------+
                                          |
                              checkpoints / events
                              facts / selected patches
                                          |
                                          v
                             +------------+-------------+
                             | State substrate          |
                             | durable board update     |
                             +------------+-------------+
                                          |
                                  score candidates
                                          |
                                          v
                             +------------+-------------+
                             | Score gate               |
                             | verify / absorb          |
                             | refresh baseline         |
                             +------------+-------------+
                                          |
                                    new baseline
                                          |
                                          v
                             refreshed evidence + next board read
```

The important split is directional: the scheduler reads durable board state and
writes reproducible scheduling transitions; workers receive target claims and
produce checkpoint evidence; the state substrate is the only coordination
surface between them.

```text
PROCESS HEALTH LOOP

+---------------------+
| Guardian process    |
| waits for incidents |
+----------+----------+
           |
           v
+---------------------+        process exit / worker error
| Decomp system       |----------------------------------+
| run loop, scheduler,|                                  |
| workers             |                                  |
+----------+----------+                                  |
           |                                             |
           v                                             |
+---------------------+                                  |
| Durable state       |<---------------------------------+
| claims/events/logs  |    incident packet + recovery
+---------------------+
```

The process health loop is operational, not strategic. It preserves liveness
around the decomp system while the scheduler and workers continue to own
decompilation decisions.

## Core Concepts

- [Session operating flow](01-session-operating-flow.md) covers the target
  first-read flow for a full Melee project session, from baseline sync through
  epoch workers, PR review, and next-session intake.
- [Core principles](05-core-principles.md) covers the Sudoku metaphor,
  run-boundary rule, metric choice, and former-skill mapping.
- [Run scheduler loop](10-run-director-loop.md) covers how board reads,
  deterministic admission, sleep, and wake events work.
- [Board prioritization](15-board-prioritization.md) covers helper score inputs
  and scheduler rank signals.
- [Agent model](20-agent-model.md) covers worker, integration resolver, PR
  indexer/splitter/reviewer, curator, reconcile, and QA repair agents plus the
  shared runtime boundary.
- [Process guardians](25-process-guardians.md) covers the babysit wrapper,
  health incidents, recovery policy, and restart boundary.
- [Durable state and events](30-state-and-events.md) covers the board, target
  claims, worker states, checkpoints, facts, and wake handshake.
- [Write safety](35-write-safety.md) covers target-claim write sets, worker
  workspaces, and integration race prevention.
- [Worker lifecycle](40-worker-lifecycle.md) covers target packets, research,
  capabilities, validation, and stall behavior.
- [Worker capabilities](45-worker-capabilities.md) covers the worker tactic
  table, evidence emitted, guardrails, and `melee-assist` absorption map.
- [Knowledge model](50-knowledge-model.md) covers references, workflows, tools,
  decomp resources, and past PR evidence.
- [Score integration and PR handoff](60-score-and-pr-handoff.md) covers the
  validation gate and the boundary between run output and human-facing review.
- [Operator flow and PR tracking](65-operator-flow-and-pr-tracking.md) covers
  the canonical session lifecycle, the pipeline-rail sidebar, and PRs as
  first-class tracked state.
- [Campaign and save points](70-save-points.md) covers the canonical campaign
  timeline, commit-anchored save points, and the where-we-are staleness
  contract.
- [Project session architecture mockup](75-project-session-architecture.md)
  covers the target project-centered model, single active session rule,
  run-to-PR lifecycle, and multi-page dashboard shape.

## Design Source

These docs are the maintainable version of the original standalone HTML design
artifact (since retired from the tree), adjusted to the current package layout
and terminology.
