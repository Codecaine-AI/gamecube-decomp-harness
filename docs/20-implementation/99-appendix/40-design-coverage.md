---
covers: Coverage audit from original design HTML to package-local markdown docs
concepts: [coverage, design-audit, traceability, no-data-loss]
code-ref: decomp-orchestrator/decomp-orchestrator-design.html, decomp-orchestrator/docs/design.html
---

# Design Coverage Audit

The original HTML design remains preserved at [../../design.html](../../design.html).
This audit tracks where each design idea lives in the markdown docs.

## Section Coverage

| Design Section | Markdown Coverage | Notes |
| --- | --- | --- |
| Goals | [Foundation](../../00-foundation/00-overview.md), [Core principles](../../10-system-design/05-core-principles.md) | Covers whole-board use, parallel evidence, matched-code metric, run boundary, and PR boundary. |
| Architecture | [System overview](../../10-system-design/00-overview.md), [Agent model](../../10-system-design/20-agent-model.md), [Process guardians](../../10-system-design/25-process-guardians.md), [UI implementation](../ui/00-overview.md) | Covers runner/state/agent split, process health wrapping, dashboard controls, architecture diagrams, and component responsibilities. |
| Run Director Loop | [Run director loop](../../10-system-design/10-run-director-loop.md) | Covers wake/read/delegate/sleep, trigger actor, wake events, target packets, and reports. |
| Durable State | [Durable state and events](../../10-system-design/30-state-and-events.md), [State implementation](../state/00-overview.md) | Covers SQLite, artifacts, events, leases, reports, and fact types. |
| Board Prioritization | [Board prioritization](../../10-system-design/15-board-prioritization.md) | Preserves candidate-prior formula and scheduling signals. |
| Worker Lifecycle | [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md), [Worker capabilities](../../10-system-design/45-worker-capabilities.md) | Covers target packet, research, attempt loop, verification, reporting, and stall policy. |
| Write Safety | [Write safety](../../10-system-design/35-write-safety.md), [State implementation](../state/00-overview.md) | Covers central locks, write sets, optional workspaces, stale base checks, and artifact race rules. |
| Worker Capabilities | [Worker capabilities](../../10-system-design/45-worker-capabilities.md), [Knowledge model](../../10-system-design/50-knowledge-model.md) | Covers capability table, guardrails, evidence, and `melee-assist` absorption map. |
| Score Integration Gate | [Score integration and PR handoff](../../10-system-design/60-score-and-pr-handoff.md), [UI implementation](../ui/00-overview.md) | Covers serial integration, validation, baseline update, dashboard handoff controls, and PR handoff boundary. |
| Current Repo Mechanics | [Current repo mechanics](20-current-repo-mechanics.md) | Covers report/objdiff/configure/table-typer artifacts, progress terms, and first commands to wrap. |
| Unified Skill Model | [Core principles](../../10-system-design/05-core-principles.md), [Knowledge model](../../10-system-design/50-knowledge-model.md) | Covers how former skill surfaces become internal capabilities and references. |
| Implementation Plan | [Implementation roadmap](30-implementation-roadmap.md) | Preserves phased plan with current package status. |
| Implementation Defaults | [Implementation roadmap](30-implementation-roadmap.md) | Preserves v1 assumptions and boundaries. |

## Explicit Motif Coverage

| Motif | Markdown Location |
| --- | --- |
| Sudoku metaphor | [Core principles](../../10-system-design/05-core-principles.md) |
| Resting/trigger agent | [Run director loop](../../10-system-design/10-run-director-loop.md), [Process guardians](../../10-system-design/25-process-guardians.md), [CLI overview](../cli/00-overview.md) |
| Former skill mapping | [Core principles](../../10-system-design/05-core-principles.md) |
| Candidate-prior formula | [Board prioritization](../../10-system-design/15-board-prioritization.md) |
| `melee-assist` absorption | [Worker capabilities](../../10-system-design/45-worker-capabilities.md) |
| Progress terms | [Current repo mechanics](20-current-repo-mechanics.md) |
| Human dashboard | [UI implementation](../ui/00-overview.md) |
| V1 defaults | [Implementation roadmap](30-implementation-roadmap.md) |

## Current Implementation Gaps

The ideas are documented, but not every design feature is implemented yet:

- Rich graph edges such as `target_edges` are design-level concepts; current
  source has queue/target rows and can grow graph storage later.
- Reducer/fact promotion is represented in reports/facts but does not yet merge
  full learned-pattern artifacts.
- Score integration still stops at regression-check and PR promotion artifacts;
  full patch accept/reject integration remains future work.
- Final run summary is partially represented by checkpoint, carry-forward,
  regression report, and PR split-plan artifacts; a single consolidated handoff
  report remains future work.
