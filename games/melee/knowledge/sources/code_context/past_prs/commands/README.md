# Past PR Commands

Useful commands for this slice:

- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py --dry-run`
- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py`
- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py --all-prs --fetch-jobs 16 --postmortem-mode pi --postmortem-jobs 16 --postmortem-scope all`
- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/sync_repo_and_pr_library.py --all-prs --fetch-jobs 16 --postmortem-jobs 16`
- `bun run kg:maintain -- --run-pr-agent --pr-jobs 16 --no-tool-runners --no-tool-index --no-data-sheet-facts --no-rebuild`
- `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/migrate_pr_data_layout.py --dry-run`
- `bun run kg:rebuild -- --repo-root <repo_root> --sources past_prs`

The graph rebuild performs the secondary synthesis pass that turns raw PR
records into file graph edges, search chunks, and ranking signals.

Full corpus refresh:

```bash
python3 projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py --all-prs --fetch-jobs 16 --postmortem-mode pi --postmortem-jobs 16 --postmortem-scope all
```

This expands discovery to the whole `doldecomp/melee` PR corpus, fetches missing
PR slices into `data/prs/pr-NNNN/raw` with `--fetch-jobs 16`, rebuilds
`data/aggregate`, and processes missing model-reviewed postmortems in
`data/prs/pr-NNNN/postmortem` with `--postmortem-jobs 16`.

The fetch is resumable. If GitHub rate-limits the run, wait for the reported
reset time and rerun the same command; complete local PR slices are skipped.

The PR postmortem builder also accepts `--agent-timeout-seconds` so a stuck
kernel-backed pr-indexer run can leave the record pending instead of blocking
the whole index pass. The default is 900 seconds per PR.

Live model-reviewed postmortems route through `kg-pr-indexer-agent`, so the
orchestrator kernel adapter records the postmortem container, agent run, and
Pi session under the configured kernel observability DB.
