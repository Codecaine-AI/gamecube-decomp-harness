# Past PR Library

Searchable decomp-orchestrator library generated from `decomp-orchestrator/knowledge/sources/past_prs/data` PR slices.

Important files:

- `index.csv`: spreadsheet-friendly index of every processed PR.
- `index.jsonl`: one JSON record per processed PR for script/RAG ingestion.
- `known_fixes.md`: compact human-readable rollup.
- `pr-NNNN/postmortem.json`: structured per-PR knowledge record.

Shared Pi instructions live in `src/agents/pr-review`; per-PR folders intentionally only store JSON records.
Persisted PR-review Pi sessions are written under `.pi-sessions/pr-review/`, which is ignored by git.

Records with `agent_status=scaffolded_without_agent` are deterministic drafts. Rerun with `--run-agent --pending-only --jobs 16` for model-reviewed JSON records. Pi/API failures stay pending instead of writing fallback postmortems.
