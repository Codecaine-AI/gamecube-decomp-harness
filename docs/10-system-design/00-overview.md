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
| - run target         |     | - queue/target packets   |---->| - lease A Pi worker  |
| - indexer output     |<--->| - leases/events/locks    |<----| - lease B Pi worker  |
| - reducer output     |     | - facts/reports          |     | - lease N Pi worker  |
| - epoch policy       |     | - artifacts/wakeups      |     | - PR/docs/source     |
+----------------------+     | - score candidates       |     | - experimental       |
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
| admit/refill/route  |    wake + snapshot     | queue / leases / facts   |
+---------------------+                        +------------+-------------+
                                          |
                                          v
                              target packets / leases
                                          |
                                          v
                             +------------+-------------+
                             | Worker pool              |
                             | Pi workers under leases  |
                             | selected capabilities    |
                             +------------+-------------+
                                          |
                              reports / events / facts
                              score candidates
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
writes reproducible scheduling transitions; workers receive leases and return
durable evidence; the state substrate is the only coordination surface between
them.

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
| leases/events/logs  |    incident packet + recovery
+---------------------+
```

The process health loop is operational, not strategic. It preserves liveness
around the decomp system while the scheduler and workers continue to own
decompilation decisions.

## Core Concepts

- [Core principles](05-core-principles.md) covers the Sudoku metaphor,
  run-boundary rule, metric choice, and former-skill mapping.
- [Run scheduler loop](10-run-director-loop.md) covers how board reads,
  deterministic admission/refill, sleep, and wake events work.
- [Board prioritization](15-board-prioritization.md) covers helper score inputs
  and scheduler rank signals.
- [Agent model](20-agent-model.md) covers worker, PR-review, curator, reconcile,
  and QA repair agents plus the shared runtime boundary.
- [Process guardians](25-process-guardians.md) covers the babysit wrapper,
  health incidents, recovery policy, and restart boundary.
- [Durable state and events](30-state-and-events.md) covers the board, leases,
  reports, facts, and wake handshake.
- [Write safety](35-write-safety.md) covers write-set leases, file locks,
  optional workspaces, and integration race prevention.
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

## Design Source

The original standalone design artifact is preserved as
[../design.html](../design.html). These markdown docs are the maintainable
version of that design, adjusted to the current package layout and terminology.
