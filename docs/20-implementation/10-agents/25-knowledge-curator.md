---
covers: Knowledge-curator agent and graph enrichment reducer
concepts: [knowledge-curator, graph-enrichment, worker-states, checkpoints, pr-postmortems]
code-ref: decomp-orchestrator/apps/server/src/core/agent-catalog/agents/knowledge/curator, decomp-orchestrator/apps/server/src/core/knowledge/curator.ts
---

# Knowledge Curator Agent

The knowledge-curator agent is the model-reviewed layer between messy evidence
and graph-owned knowledge. V1 uses a deterministic reducer as the canonical
writer, and the agent can optionally add proposal-only source updates.

## Files

| File | Purpose |
| --- | --- |
| `apps/server/src/core/agent-catalog/agents/knowledge/curator/index.ts` | Registers the agent slice. |
| `apps/server/src/core/agent-catalog/agents/knowledge/curator/agent.ts` | Kernel metadata plus curator prompt, context, and tool wiring. |
| `apps/server/src/core/agent-catalog/agents/knowledge/curator/prompt.ts` | Defines the stable curator system prompt and bundle entrypoint. |
| `apps/server/src/core/agent-catalog/agents/knowledge/curator/context.ts` | Builds the injected curator batch packet, tools, and output schema. |
| `apps/server/src/core/agent-catalog/agents/knowledge/curator/schema.json` | Defines the expected JSON shape. |
| `apps/server/src/core/knowledge/curator.ts` | Deterministically reduces worker states, selected checkpoints, and PR postmortems into enrichment records. |
| `apps/server/src/core/knowledge/graph/knowledge-curator.ts` | Emits curator records into internal graph entities, facts, and edges. |

## Flow

`kg-curate` rewrites
`projects/melee/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl`
from persisted worker states, selected checkpoints, and PR postmortems.
`kg-maintain` runs pending PR postmortem indexing first, then curation,
optional `--run-curator-agent`, and graph rebuild.

When model-reviewed curation is enabled, the curator samples deterministic
records with `--curator-agent-record-limit`, splits them with
`--curator-agent-batch-size`, and runs independent batches with
`--curator-agent-jobs` (default `16`). Batch outputs are collected first, then
proposal-only source updates are appended in deterministic ID order. The live
agent uses the shared defaults unless overridden: provider `codex-lb`, model
`gpt-5.5`, thinking `medium`. `local.env` sets
`PI_CODING_AGENT_DIR=.pi-agent`, so auth is loaded from ignored repo-local
`.pi-agent/models.json`, matching the PR indexer path.

Workers and PR agents contribute evidence. The curator decides whether that
evidence becomes an accepted graph lesson or a proposal-only source update.
Data-sheet and source-corpus changes stay proposals until source-specific
validation applies them. Tool cache or index refresh decisions stay with the
owning tool suite.

## Related

- [Knowledge implementation](../30-knowledge/00-overview.md)
- [PR indexer, splitter, and reviewer agents](20-pr-review.md)
