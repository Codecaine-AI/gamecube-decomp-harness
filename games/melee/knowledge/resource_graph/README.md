# Resource Graph

Resource-graph commands and schemas for project-derived code context, active
knowledge-source indexes, and graph-owned enrichments.

The resource graph is the layer for evidence that changes or needs linking:
current code graph records, path/file cards, past-PR edges, resource hits, rank
features, imported durable lessons, and curator-produced
updates. Durable mismatch-pattern knowledge also lives here as graph-owned
entities linked to files, functions, PRs, and evidence records. The graph is not
the home for every source corpus; source corpora stay under
`projects/melee/knowledge/sources/<section>/<source_id>/data`, and raw
objdiff/checkdiff output stays with the tool run that produced it.

Generated files:

- `projects/melee/graph/graph.sqlite`
- `projects/melee/graph/graph.sqlite-shm`
- `projects/melee/graph/graph.sqlite-wal`
- `projects/melee/knowledge/sources/<section>/<source_id>/indexes/*.jsonl`
- `projects/melee/shared/tool-data/<tool_id>/indexes/*.jsonl` for stable
  resolver-backed tool indexes.

Graph-owned enrichment artifacts:

- `projects/melee/knowledge/resource_graph/enrichments/agent_shared_state_lessons.jsonl` - curated lessons imported
  from a legacy `agent_state-shared.db`. The importer keeps durable tool issues
  and useful function hints, skips stale operational state, and does not require
  the original DB after import.
- `projects/melee/knowledge/resource_graph/enrichments/knowledge_curator_updates.jsonl` -
  generated worker/PR lessons and proposal-only source updates produced by
  `kg-curate` or `kg-maintain`. This is ingestion output, not a registered
  knowledge source.
- `mismatch_patterns` - graph-owned derived source built from accepted curator
  records and imported historical lessons. It normalizes recurring stack,
  register-allocation, inline-boundary, control-flow, data-layout, type, split,
  loop, struct-layout, and negative-evidence lessons into linked pattern
  entities.

CLI entry points are exposed through `bun run kg:*` package scripts.

Useful commands:

- `bun run kg:import-agent-state -- --input agent_state-shared.db`
- `bun run kg:curate -- --state-dir <state_dir>`
- `bun run kg:maintain -- --state-dir <state_dir> --repo-root <repo_root>`
- `bun run kg:rebuild -- --repo-root <repo_root>`
- `bun run kg:smoke -- --strict`
- `bun run kg:search -- --source agent_shared_state --query <query>`
- `bun run kg:search -- --source mismatch_patterns --query <query>`

Default graph ingestion builds `code_graph`, `past_prs`, `decomp_standards`,
`opseq_similarity`, and `ghidra_xrefs`, plus graph-owned call, sibling,
knowledge-ledger, curator, agent-state, and mismatch-pattern records. The
source registry contains only maintained source directories; derived graph
sources do not require parallel corpus folders or direct worker search APIs.
