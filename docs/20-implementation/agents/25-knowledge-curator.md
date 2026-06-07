---
covers: Knowledge-curator agent and graph enrichment reducer
concepts: [knowledge-curator, graph-enrichment, worker-reports, pr-postmortems]
code-ref: decomp-orchestrator/src/agents/knowledge-curator, decomp-orchestrator/src/knowledge/curator.ts
---

# Knowledge Curator Agent

The knowledge-curator agent is the model-reviewed layer between messy evidence
and graph-owned knowledge. V1 uses a deterministic reducer as the canonical
writer, and the agent can optionally add proposal-only source updates.

## Files

| File | Purpose |
| --- | --- |
| `src/agents/knowledge-curator/index.ts` | Registers the agent slice. |
| `src/agents/knowledge-curator/prompt.ts` | Builds the curator prompt bundle. |
| `src/agents/knowledge-curator/schema.json` | Defines the expected JSON shape. |
| `src/agents/knowledge-curator/templates/system.md` | Defines curation rules and output contract. |
| `src/knowledge/curator.ts` | Deterministically reduces worker reports and PR postmortems into enrichment records. |
| `src/knowledge/graph/knowledge-curator.ts` | Emits curator records into internal graph entities, facts, and edges. |

## Flow

`kg-curate` rewrites
`knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl` from
worker reports and PR postmortems. `kg-maintain` runs pending PR postmortem
indexing first, then curation, optional `--run-curator-agent`, and graph
rebuild.

When model-reviewed curation is enabled, the curator samples deterministic
records with `--curator-agent-record-limit`, splits them with
`--curator-agent-batch-size`, and runs independent batches with
`--curator-agent-jobs` (default `16`). Batch outputs are collected first, then
proposal-only source updates are appended in deterministic ID order. The live
agent uses the shared defaults unless overridden: provider `codex-lb`, model
`gpt-5.5`, thinking `medium`. `local.env` sets
`PI_CODING_AGENT_DIR=.pi-agent`, so auth is loaded from ignored repo-local
`.pi-agent/models.json`, matching the PR-review path.

Workers and PR agents contribute evidence. The curator decides whether that
evidence becomes an accepted graph lesson or a proposal-only source update.
Data-sheet/tool-output changes stay proposals until source-specific validation
applies them.

## Related

- [Knowledge implementation](../knowledge/00-overview.md)
- [PR-review agent](20-pr-review.md)
