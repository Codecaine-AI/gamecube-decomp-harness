# Past PR Commands

Useful commands for this slice:

- `bun run pr:refresh:dry`
- `bun run pr:refresh`
- `bun run pr:refresh:all`
- `bun run pr:sync:all`
- `bun run pr:postmortems -- --dump-root knowledge/sources/past_prs/data/current --run-agent`
- `bun run kg:rebuild -- --repo-root <repo_root> --sources past_prs`

The graph rebuild performs the secondary synthesis pass that turns raw PR
records into file graph edges, search chunks, and ranking signals.

Full corpus refresh:

```bash
bun run pr:refresh:all
```

This expands discovery to the whole `doldecomp/melee` PR corpus, fetches missing
PR slices with `--fetch-jobs 16`, and processes missing model-reviewed
postmortems with `--postmortem-jobs 16`.

The fetch is resumable. If GitHub rate-limits the run, wait for the reported
reset time and rerun the same command; complete local PR slices are skipped.

The PR postmortem builder also accepts `--agent-timeout-seconds` so a stuck
Pi-agent call can fall back to a scaffolded record instead of blocking the whole
index pass. The default is 900 seconds per PR.

Live PR-review Pi sessions are persisted by default under
`decomp-orchestrator/.pi-sessions/pr-review/`, which is ignored by git. Override
with `--session-dir <path>` only when you intentionally want a different local
session store.
