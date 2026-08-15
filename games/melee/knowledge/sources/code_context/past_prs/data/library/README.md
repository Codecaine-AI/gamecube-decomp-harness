# Past PR Library

Searchable decomp-orchestrator library generated from `projects/melee/knowledge/sources/code_context/past_prs/data` PR slices.

Important files:

- `index.csv`: spreadsheet-friendly index of every processed PR.
- `index.jsonl`: one JSON record per processed PR for script/RAG ingestion.
- `known_fixes.md`: compact human-readable rollup.
- `../prs/pr-NNNN/postmortem/postmortem.json`: structured per-PR knowledge record.

Shared pr-indexer instructions live in `apps/server/src/core/agent-catalog/agents/knowledge/pr-indexer`; per-PR postmortems live inside each PR vertical slice.
Live model-reviewed runs route through `decomp-orchestrator kg-pr-indexer-agent`, which records kernel containers, agent runs, and Pi sessions through the orchestrator kernel adapter.

Records with `agent_status=scaffolded_without_agent` are deterministic drafts. Rerun with `--run-agent --pending-only --jobs 16` for model-reviewed JSON records. Provider/API failures stay pending instead of writing fallback postmortems.
