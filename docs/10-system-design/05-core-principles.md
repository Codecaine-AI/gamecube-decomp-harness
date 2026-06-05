---
covers: Core design principles, Sudoku metaphor, run boundaries, metrics, and former-skill mapping
concepts: [principles, sudoku, run-boundary, matched-code-percent, skill-model]
---

# Core Principles

D-Comp Orchestrator treats a decompilation run as a whole-board reasoning
problem. The director does not camp on one target just because it is unfinished.
It asks where the current facts make the next useful move easiest.

## Sudoku Metaphor

Treat decomp like Sudoku:

- A worker finding a fact does not always finish the file it is holding.
- That fact can still remove bad possibilities from other targets.
- A struct field, source shape, duplicate pattern, naming convention, or
  negative result can make a different target more constrained.
- The director's job is to choose the next square based on the entire board, not
  to tunnel on the last square touched.

In decomp terms, a worker may discover that a guessed source shape cannot be
right, that a duplicate reference has a reusable shape, or that a data owner
blocks several functions. Those outputs become constraints for future target
packets.

## Run Boundary

The run is the unit of progress. A source file, worker, symbol, or lease is not
a PR boundary. A run can target a checkpoint such as `+1.0% matched_code_percent`
or `+5.0% matched_code_percent` and keep integrating verified improvements until
that target is reached or useful evidence runs out.

## North-Star Metric

`matched_code_percent` is the north-star metric. It tracks exact matched code
progress and is the v1 target for run goals.

`fuzzy_match_percent` is useful telemetry for target selection and local
diagnosis, but it is not the success target. It can be high even when exact
matched code progress remains low.

`complete_code_percent` and linked/unit completeness are useful context, but
they are secondary to exact matched-code movement.

## Former Skill Surfaces

The orchestrator is the top-level run system. Former standalone skill surfaces
move down a layer:

| Former surface | New role inside orchestrator |
| --- | --- |
| `decomp-find` | Board scan, candidate-prior features, linked-blocker awareness, and progress metrics. |
| `melee-decomp` | Worker playbook for one file or symbol: gather context, edit source, verify, and stop before guessing. |
| `melee-decomp-sweep` | Optional experimental-search mode for bounded source-shape experiments, result shards, Pareto selection, and learned patterns. |
| Run director | Pi-agent Sudoku player: decide which square to touch next based on the whole board and every new fact. |

## Runtime Principle

The orchestrator itself is not the main reasoning agent. It is a thin stateful
runner that stores facts, leases, events, prompts, and artifacts. It launches
director and worker Pi sessions only when durable state says there is work to
do.
