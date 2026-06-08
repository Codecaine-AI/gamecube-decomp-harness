---
covers: D-Comp Orchestrator CLI command modules and operator command surface
concepts: [cli, commands, init-run, tick, worker, trigger-agent, babysit, recovery, regression-check, pr-split-plan]
code-ref: decomp-orchestrator/src/cli, decomp-orchestrator/src/bin/decomp-orchestrator.ts
---

# CLI: Overview

The CLI is split into command modules under `src/cli/commands/`. The binary
entry point stays thin: it parses arguments, applies defaults, and dispatches
to the selected command.

Global parsing keeps checkout ownership and state ownership separate.
`--repo-root` identifies the Melee checkout to inspect, edit, and validate.
`--state-dir` identifies the durable board and artifact ledger. When
`--state-dir` is omitted, it defaults to `<cwd>/.decomp-orchestrator-state/`;
normal operations run from `decomp-orchestrator/` so state remains
orchestrator-owned even when `--repo-root` points at the parent Melee checkout.

## File Tree

```text
src/
+-- bin/
|   +-- decomp-orchestrator.ts
+-- cli/
    +-- args.ts
    +-- defaults.ts
    +-- main.ts
    +-- usage.ts
    +-- commands/
        +-- babysit.ts
        +-- index.ts
        +-- init-run.ts
        +-- kg.ts
        +-- pr-split-plan.ts
        +-- recover-leases.ts
        +-- regression-check.ts
        +-- shared.ts
        +-- status.ts
        +-- tick.ts
        +-- trigger-agent.ts
        +-- worker.ts
```

## Commands

| Command | Purpose |
| --- | --- |
| `init-run` | Creates run state, stores the run checkpoint goal, loads board data, queues initial candidate targets, and writes the initial board snapshot. |
| `tick` | Handles one unhandled wake event by running one director cycle. |
| `worker` | Leases one queued target, runs worker/repair sessions, gates returns on runner-owned post-return validation, writes report artifacts, releases the lease, and emits a wake event. |
| `trigger-agent` | Resting supervisor loop that wakes the director on events, starts workers up to `desired_workers` or `--max-workers`, and sleeps when the board is quiet. |
| `bootstrap` | Alias for `trigger-agent`. |
| `babysit` | Guardian wrapper that launches the decomp system command, captures process-health incidents, recovers failed or expired leases, and restarts according to policy. |
| `recover-leases` | Converts interrupted or expired active leases into durable stalled reports after operator confirmation. |
| `regression-check` | Wraps the repo's global saved-baseline regression gate and writes run artifacts. |
| `pr-split-plan` | Plans review-sized PR slices from the current branch/worktree by grouping changed files by Melee subsystem or top-level directory. |
| `kg-sources` | Lists registered knowledge source slices and external tool integrations. |
| `kg-status` | Prints graph database path, source/tool registry summaries, and graph record counts. |
| `kg-curate` | Reduces worker reports and PR postmortems into graph-owned curator enrichment records. |
| `kg-maintain` | Runs pending PR postmortem indexing, curator reduction, optional curator-agent proposal review, and graph rebuild. |
| `kg-rebuild-graph` | Rebuilds the v1 SQLite graph from selected graph inputs, currently `code_graph`, `past_prs`, and graph enrichments. |
| `kg-search` | Searches indexed graph chunks with optional source filtering. |
| `kg-file-card` | Prints file graph context, editability, PR history, resource hits, and scheduling signals for one source path. |
| `kg-rank-features` | Shows graph-derived ranking features for current board candidates. |
| `status` | Prints run, queue, lease, event, and report summary data. |

## Boundaries

The CLI keeps the single-step commands for debuggability, exposes
`trigger-agent` / `bootstrap` for autonomous decomp-system runs, and exposes
`babysit` as the outer guardian process for long-running development sessions.

The trigger-agent is deliberately not a Pi agent. It is a thin evented loop over
durable SQLite state: wake the director for unhandled events, start worker
sessions for open slots, then rest until state changes. The babysit command is
also not a Pi agent. It wraps the decomp system process, sleeps while that
process runs, wakes on process exit or worker-process error, writes guardian
artifacts under `state_dir/guardian/`, runs `recover-leases` when appropriate,
and restarts the child when policy allows.

## Worker Post-Return Gate

`worker` captures the write-set diff before the first worker attempt. When the
agent returns, the runner evaluates the structured `local_regression_check`,
checks that validation artifacts exist, verifies edited paths stay inside the
lease, compares the post-attempt write-set diff against the pre-worker diff,
and optionally runs `--post-return-check-command` for accepted
`progress`/`score_candidate` reports.

If the post-return gate fails, the lease remains held and the runner sends a
`repair_request` back to the worker. `--repair-attempts` controls how many
repair turns are allowed before the runner records a stalled report. The
optional command hook runs from the repo root and supports placeholders:
`{repo_root}`, `{state_dir}`, `{worker_log_dir}`, `{lease_id}`,
`{source_path}`, `{unit}`, `{symbol}`, and `{write_set}`.

`--worker-thinking-level` lets the trigger actor launch worker Pi sessions with
a different thinking level from the director. For example, the director can stay
on the global default while workers run with `--worker-thinking-level low`.

The trigger actor also owns deterministic queue refill. Each loop reads the
current board artifacts, ranks candidates with the configured knowledge graph
when available, refills queued targets toward a ready-pool target, starts worker
subprocesses for open slots, then handles one director wake event. This means a
slow director replan does not prevent workers from picking up already queued,
unlocked work.

Queue size and board scan width are separate. `--candidate-limit` remains the
initial seed size and compatibility pool size. `--queue-target-size` controls
how much already-ranked work the trigger keeps queued, and defaults near active
worker capacity so new graph facts can affect scheduling quickly.
`--candidate-window` controls the initial ranked board scan width used to find
fresh work beyond the current pool. If that window is exhausted, deterministic
refill expands the scan until it restores the pool target or reaches the end of
the ranked board.

Even when the queue is full, the trigger periodically rereads the graph-ranked
board and refreshes priorities for queued-but-not-leased targets inside the scan
window. Graph maintenance can therefore move newly informative targets upward
without waiting for the old queue to drain completely.

The trigger writes a prioritized `pool_below_target` event when deterministic
refill is not enough and capacity is becoming inefficient. The defaults wake the
director when total queued work falls to 25% of `--queue-target-size`, when
unlocked distinct-file work falls below `--max-workers`, when queued work is
blocked by active file locks, or when a long-tail drain persists for five
minutes. Operators can tune this with:

| Flag | Meaning |
| --- | --- |
| `--candidate-limit <n>` | Initial seed size and compatibility pool size; default is `max(32, max_workers * 2)`. |
| `--queue-target-size <n>` | Maintain at least this many queued targets, subject to available fresh board candidates; default is `max(candidate_limit, max_workers * 2)`. |
| `--candidate-window <n>` | Initial number of ranked board candidates scanned for director context and deterministic refill; refill expands this when the window is exhausted. |
| `--graph-db <path>` | Knowledge graph used for board ranking and worker file-card context; defaults to `knowledge/resource_graph/graph.sqlite`. |
| `--queue-refresh-interval-ms <n>` | Refresh queued target priorities from the latest graph-ranked board at this interval; default is 60000. |
| `--queue-low-watermark <n>` | Wake when total queued work is at or below `n` while workers are active. |
| `--schedulable-low-watermark <n>` | Wake when unlocked distinct-file work is at or below `n` while the run is underfilled. |
| `--active-low-watermark <n>` | Active-worker threshold for long-tail detection; default is 75% of `--max-workers`. |
| `--long-tail-replan-ms <n>` | Wake after underfilled long-tail state persists for `n` ms. |
| `--replan-interval-ms <n>` | Optional periodic director wake while workers are active; default `0` disables it. |
| `--replan-cooldown-ms <n>` | Minimum delay between trigger-produced replan events. |
| `--no-blocked-queue-replan` | Disable replans caused only by queued work blocked behind file locks. |

The babysit wrapper forwards these trigger flags to its child `bootstrap` or
`trigger-agent` command.

## Regression Check

`regression-check` wraps the saved-baseline `ninja changes_all` flow, captures
stdout/stderr, parses `build/GALE01/report_changes.json`, writes
`summary.json`, and generates a PR-style Markdown report through
`src/objdiff/report.ts`. The regression gate fails when Ninja returns nonzero,
the report cannot be parsed, or the report contains broken matches, fuzzy
regressions, or metric regressions.

The same report evaluates PR promotion separately from regression cleanliness.
Default promotion evidence requires no regressions plus an exact new match or
matched code/data byte movement; fuzzy-only improvements are recorded as
`local_only` evidence because match percent alone can be misleading. Use
`--require-pr-promotion` for final maintainer-facing handoff, and tune
`--promotion-min-*` thresholds only when an operator deliberately wants a higher
or broader promotion policy.

## PR Split Planning

`pr-split-plan` is the operator handoff command for turning a large accepted
change bundle into smaller review units. It reads `git diff --name-status
<base-ref>...HEAD` and dirty worktree status from `--repo-root`, merges those
paths, and groups them into slices.

The default `--group-mode melee-subsystem` treats any path containing
`melee/<subsystem>` as part of that subsystem, so source, headers, and assembly
for `it`, `gm`, `cm`, `ft`, and adjacent directories stay together. Support
roots such as `sysdolphin`, `Runtime`, `MSL`, and `MetroTRK` become their own
slices, while cross-cutting root/config files become shared slices. Use
`--group-mode top-dir` for a simpler first-directory split.

Each slice includes a suggested branch name, PR title, pathspec list, patch
workflow, isolation-check workflow, and unverified independence disposition.
The disposition is conservative metadata:

| Disposition | Meaning |
| --- | --- |
| `independent` | Looks source/header-scoped to one Melee subsystem and can become an independent PR only after the isolation check passes. |
| `shared-prep` | Touches build/config/generated/root/support-library files or other shared surfaces that should land first or be stacked intentionally. |
| `stacked` | Looks subsystem-adjacent but may depend on shared declarations, renames, deletes, or other nonlocal effects. |
| `needs-merge` | The split is probably artificial for review; keep it together or manually redesign the slice. |

The isolation workflow applies one slice to a fresh worktree at `--base-ref` and
runs `--slice-check-command`, which defaults to `python configure.py
--require-protos && ninja changes_all`. Worktree and untracked files are
included by default so the operator can see unfinished local changes, but the
command warns that generated patch commands only replay committed `HEAD`
changes. Use `--committed-only` after committing the source bundle,
`--worktree-only` for a local staging preview, `--no-untracked` to suppress
untracked paths, `--json` for automation, or `--output <path>` to save the
rendered plan.

## Knowledge Maintenance

`trigger-agent` can run `kg-maintain` in the background. Live runs default to a
five-minute maintenance interval; dry-run agents default to disabled. Use
`--no-knowledge-maintenance` to disable it, or
`--knowledge-maintenance-interval-ms <n>` to tune it.

Maintenance does not require the main loop to inspect individual PRs. The PR
postmortem command uses pending-only discovery to find PRs in the current dump
that do not have `postmortem.json` yet. Live trigger maintenance queues up to
eight pending PRs per interval through the PR-review agent by default; use
`--no-run-pr-agent` to keep the background pass deterministic or `--pr-limit`
to tune the batch. Direct `kg-maintain` remains deterministic unless
`--run-pr-agent` is passed. The knowledge curator then rewrites graph-owned
worker/PR lessons and proposal-only source updates before the graph rebuild.

`init-run --goal-kind matched_code_percent --goal-value <percent>` records the
checkpoint for this run. The checkpoint is a pause/handoff threshold for the
current batch, not the final decompilation objective. The long-term project
target remains `100%` matched code.

## Related

- [State implementation](../state/00-overview.md)
- [Agent runtime](../agents/30-runtime.md)
