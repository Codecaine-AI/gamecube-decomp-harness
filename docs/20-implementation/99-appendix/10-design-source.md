---
covers: Preserved original design artifact and markdown conversion map
concepts: [appendix, design-source, html, markdown-conversion, no-data-loss]
code-ref: decomp-orchestrator/decomp-orchestrator-design.html, decomp-orchestrator/docs/design.html
---

# Design Source

The original standalone design doc remains at
`decomp-orchestrator/decomp-orchestrator-design.html`.

An exact package-local copy is preserved at [../../design.html](../../design.html)
so the docs folder contains the visual HTML artifact as well as the markdown
documentation set.

## Markdown Conversion Map

| Original design section | Markdown destination |
| --- | --- |
| Goals | [Foundation overview](../../00-foundation/00-overview.md) and [Core principles](../../10-system-design/05-core-principles.md) |
| Architecture | [System design overview](../../10-system-design/00-overview.md) and [Agent model](../../10-system-design/20-agent-model.md) |
| Run Director Loop | [Run director loop](../../10-system-design/10-run-director-loop.md) |
| Durable State | [Durable state and events](../../10-system-design/30-state-and-events.md) and [State implementation](../state/00-overview.md) |
| Board Prioritization | [Board prioritization](../../10-system-design/15-board-prioritization.md) |
| Worker Lifecycle | [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md) |
| Write Safety | [Write safety](../../10-system-design/35-write-safety.md), [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md), and [State implementation](../state/00-overview.md) |
| Worker Capabilities | [Worker capabilities](../../10-system-design/45-worker-capabilities.md), [Worker lifecycle](../../10-system-design/40-worker-lifecycle.md), and [Knowledge model](../../10-system-design/50-knowledge-model.md) |
| Score Integration Gate | [Score integration and PR handoff](../../10-system-design/60-score-and-pr-handoff.md) |
| Current Repo Mechanics | [Current repo mechanics](20-current-repo-mechanics.md), [Implementation overview](../00-overview.md), [CLI overview](../cli/00-overview.md), and [Knowledge overview](../knowledge/00-overview.md) |
| Unified Skill Model | [Core principles](../../10-system-design/05-core-principles.md), [Agent model](../../10-system-design/20-agent-model.md), and [Knowledge model](../../10-system-design/50-knowledge-model.md) |
| Implementation Plan and Defaults | [Implementation roadmap](30-implementation-roadmap.md), [Foundation overview](../../00-foundation/00-overview.md), and implementation section docs |

## Preservation Rule

Do not delete or rewrite the preserved HTML as part of routine markdown doc
maintenance. Update markdown docs as the live package design evolves. Refresh
the HTML copy only when intentionally replacing the visual design artifact.

For an explicit checklist, see the
[design coverage audit](40-design-coverage.md).
