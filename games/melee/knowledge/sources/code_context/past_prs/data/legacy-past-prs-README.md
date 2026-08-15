# Past PRs

This directory stores GitHub PR data and searchable PR summaries for the
doldecomp/melee decompilation workflow.

## Stable Dump

`current/` is the default refresh target for `utils/fetch_recent_pr_dump.py`.
Refresh window details live in `current/fetch_metadata.json`, not in the folder
name.

Important files inside a dump root:

- `fetch_metadata.json`: repo, activity mode, since date, fetch timestamp, and postmortem mode.
- `prs.json`: compact PR index from GitHub discovery.
- `manifest.json`: generated dump manifest and layout metadata.
- `summary.json`: aggregate counts, sizes, and generated file paths.
- `pr_counts.json`: per-PR counts for comments, reviews, and diff bytes.
- `vertical_slice_index.json`: one record per `prs/pr-NNNN` folder.
- `analysis/text_corpus.jsonl`: PR bodies, issue comments, inline review comments, and review summaries.
- `analysis/changed_files.jsonl`: changed-file summaries parsed from PR diffs.
- `analysis/diff_lines.jsonl`: added/deleted diff lines for search.
- `analysis/human_pr_text.md`: human-authored PR bodies and issue comments.
- `analysis/review_comments.md`: inline review comments with paths and hunks.
- `prs/pr-NNNN/`: one vertical slice per PR with raw JSON, diff, counts, activity, and split analysis files.

## Searchable PR Library

`prs/` is the searchable knowledge layer built from PR slices. Each PR folder
stores only the structured JSON record. Canonical shared Pi-agent instructions
live in `../../../packages/agents/src/pr-review/` and are rendered with the
current PR context when the builder runs. The older `agent/` folder may exist as
a legacy mirror for previously generated run summaries.

Primary library files:

- `prs/index.csv`: spreadsheet-friendly lookup table.
- `prs/index.jsonl`: JSONL records for search/RAG ingestion.
- `prs/known_fixes.md`: compact human-readable rollup.
- `prs/pr-NNNN/postmortem.json`: structured knowledge record.
- `../../../packages/agents/src/pr-review/templates/system.md`: shared Pi system prompt.
- `../../../packages/agents/src/pr-review/templates/initial_user.md`: shared per-PR context template.
- `../../../packages/agents/src/pr-review/schema.json`: required JSON response shape.

## Utils

`utils/` contains the Python refresh, analysis, organization, and PR-library
builder scripts.

Records with `agent_status=scaffolded_without_agent` are deterministic drafts.
Run the Pi agent for richer JSON records. The default Pi review config is
provider `codex-lb`, model `gpt-5.5`, thinking `medium`, and tools
`read,grep,find,ls`. The builder loads ignored repo-local `local.env` before
spawning Pi; `local.env` points Pi at ignored `.pi-agent/models.json` for the
project-specific `codex-lb` key:

```bash
python decomp-orchestrator/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py --postmortem-mode pi --postmortem-scope fetched --postmortem-jobs 16
python decomp-orchestrator/knowledge/sources/code_context/past_prs/commands/build_pr_postmortems.py --dump-root decomp-orchestrator/knowledge/sources/code_context/past_prs/data --run-agent --rerun-existing --jobs 16
```

For a full repo-and-library sync, use:

```bash
python decomp-orchestrator/knowledge/sources/code_context/past_prs/commands/sync_repo_and_pr_library.py --postmortem-jobs 16
python decomp-orchestrator/knowledge/sources/code_context/past_prs/commands/sync_repo_and_pr_library.py --pr-activity updated --refresh-existing-prs --postmortem-jobs 16
```
