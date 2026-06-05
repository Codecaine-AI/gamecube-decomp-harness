---
covers: D-Comp Orchestrator system design map
concepts: [system-design, director, workers, durable-state, knowledge, score-gate]
---

# System Design Overview

D-Comp Orchestrator is an event-driven coordination system for decompilation
work. A thin runner owns durable state transitions and agent invocation. Pi
agents own reasoning. The board is the shared medium between those two worlds.

## Architecture Map

```text
OWNERSHIP LAYOUT

+----------------------+     +--------------------------+     +----------------------+
| Director scope       |     | Shared run state         |     | Worker execution     |
| - run target         |     | - queue/target packets   |---->| - lease A Pi worker  |
| - indexer output     |<--->| - leases/events/locks    |<----| - lease B Pi worker  |
| - reducer output     |     | - facts/reports          |     | - lease N Pi worker  |
| - Pi director        |     | - artifacts/wakeups      |     | - PR/docs/source     |
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

run target + indexer output + reducer output
        |
        v
+---------------------+       decisions        +--------------------------+
| Pi director         |----------------------->| State substrate          |
| choose next         |<-----------------------| wake event + snapshot    |
| influence point     |    wake + snapshot     | queue / leases / facts   |
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
                             reducer output + next board read
```

The important split is directional: the director reads a compact board and
writes scheduling decisions; workers receive leases and return durable evidence;
the state substrate is the only coordination surface between them.

## Core Concepts

- [Core principles](05-core-principles.md) covers the Sudoku metaphor,
  run-boundary rule, metric choice, and former-skill mapping.
- [Run director loop](10-run-director-loop.md) covers how board reads,
  delegation, sleep, and wake events work.
- [Board prioritization](15-board-prioritization.md) covers helper score inputs
  and the director's scheduling prior.
- [Agent model](20-agent-model.md) covers the director, worker, PR-review agent,
  and shared runtime boundary.
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

## Design Source

The original standalone design artifact is preserved as
[../design.html](../design.html). These markdown docs are the maintainable
version of that design, adjusted to the current package layout and terminology.
