# Full PR Corpus Resume Status

Status resolved: 2026-06-09.

The active corpus has been migrated to the vertical-slice v2 layout under
`knowledge/sources/code_context/past_prs/data`:

- `2550 / 2550` PRs have complete raw slices under `prs/pr-NNNN/raw`.
- `2550 / 2550` PRs have postmortems under
  `prs/pr-NNNN/postmortem/postmortem.json`.
- `data/library/index.jsonl` has `2550` rows.
- The legacy `current/` child directory has been removed after checksum-verified migration.

Historical status captured: 2026-06-06 14:23 CDT.

The full PR corpus refresh was started with:

```bash
python3 knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py \
  --all-prs \
  --fetch-jobs 32 \
  --postmortem-mode pi \
  --postmortem-jobs 32 \
  --postmortem-scope all
```

GitHub core REST API rate limiting stopped that fetch before the final formatting
and PR-review phases completed.

Historical known state at that time:

- Discovered PRs in `prs.json`: 2,499.
- Complete local PR slices/files: 1,649.
- Partial or still-missing PR slices/files: 850.
- Existing processed postmortems: 421.
- Agent-completed postmortems: 383.
- Historical `data/prs/index.jsonl` rows: 421.
- Core REST API reset: 2026-06-06 14:39:18 CDT.
- Offline PR-review processing is continuing against the complete local slices
  with `build_pr_postmortems.py --pending-only --complete-only --run-agent --jobs 32`.

Resume plan:

1. Continue processing complete local PR slices before waiting on GitHub.
2. After the reset, rerun
   `python3 projects/melee/knowledge/sources/code_context/past_prs/commands/fetch_recent_pr_dump.py --all-prs --fetch-jobs 16 --postmortem-mode pi --postmortem-jobs 16 --postmortem-scope all`.
3. The fetcher skips complete local PR slices, so the rerun should only fetch
   the remaining partial/missing PRs before rebuilding analysis and postmortems.
4. Rebuild the resource graph and run `bun run kg:smoke -- --strict` after the
   final PR corpus finishes.
