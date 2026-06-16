---
covers: D-Comp Orchestrator CLI command modules and operator command surface
concepts: [cli, commands, init-run, tick, worker, scheduler, run-loop, babysit, recovery, checkpoint, regression-check, qa-ship-gate, qa-repair, pr-split-plan, pr-draft-qa, pr-preship-review, ui]
code-ref: decomp-orchestrator/apps/cli/src/cli, decomp-orchestrator/apps/cli/src/bin/decomp-orchestrator.ts
---

# CLI: Overview

The CLI is split into command modules under `apps/cli/src/cli/commands/`.
The binary entry point stays thin: it parses arguments, applies defaults, and
dispatches to the selected command.

Global parsing can resolve a configured project before command dispatch.
`--project <id>` selects `projects/<id>/project.json`, applies ignored
`projects/<id>/local.project.json` when present, then applies explicit
`--repo-root`, `--state-dir`, and command-level `--graph-db` overrides. Project
mode carries the resolved project id, checkout root, state directory, graph
database, descriptor path, and local override path through CLI commands. Raw
path mode remains available when `--project` is omitted.

## File Tree

```text
apps/cli/src/
+-- bin/
|   +-- decomp-orchestrator.ts
+-- cli/
    +-- args.ts
    +-- defaults.ts
    +-- main.ts
    +-- usage.ts
    +-- commands/
        +-- babysit.ts
        +-- checkpoint-run.ts
        +-- index.ts
        +-- init-run.ts
        +-- kg.ts
        +-- pr-draft-qa.ts
        +-- pr-preship-review.ts
        +-- pr-split-plan.ts
        +-- qa-gate.ts
        +-- qa-repair.ts
        +-- reconcile.ts
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
| `tick` | Handles one unhandled wake event with the deterministic scheduler: refresh/refill the queue from the graph-ranked board, record queue pressure, and mark the event handled. |
| `worker` | Leases one queued target, runs worker/repair sessions, gates returns on runner-owned post-return validation, writes report artifacts, releases the lease, and emits a wake event. |
| `run-loop` | Resting deterministic scheduler loop that handles wake events, keeps epoch work moving, starts workers up to `desired_workers` or `--max-workers`, and sleeps when the board is quiet. |
| `trigger-agent` | Compatibility alias for `run-loop`. |
| `bootstrap` | Compatibility alias for `run-loop`. |
| `babysit` | Guardian wrapper that launches the decomp system command, captures process-health incidents, recovers failed or expired leases, and restarts according to policy. |
| `checkpoint-run` | Harvests a drained run into PR-candidate exact matches and carry-forward items. |
| `recover-leases` | Converts interrupted or expired active leases into durable stalled reports after operator confirmation. |
| `epoch-run` | Runs one epoch checkpoint cycle by hand: commits validated work (excluding active-lease files), rebuilds the full report in the persistent epoch worktree, records an `epoch` save point, and requeues regression repairs. `--no-requeue` plans repairs without touching the queue. |
| `regression-check` | Wraps the repo's global saved-baseline regression gate, runs the QA ship gate (`review_lint` diff scan vs `--qa-base`, fail-closed, bypass only via `--skip-qa-gate`), and writes run artifacts. |
| `qa-repair` | Builds the PR-bound QA repair queue from checkpoint candidates, explicit candidate files, or saved `review_lint scan_diff` JSON; optionally runs the `qa-repair` agent over selected items; writes queue/report/ship-filter artifacts under `state_dir/qa_repairs/<run-id>/<timestamp>/`. |
| `pr-split-plan` | Plans review-sized PR slices from the current branch/worktree by grouping changed files by Melee subsystem or top-level directory. |
| `pr-draft-qa` | Runs the draft PR lifecycle around an opened GitHub PR: resolve/fetch PR refs, run preship review, scan deterministic QA findings, optionally run repair agents, comment unresolved findings with stable dedupe markers, and verify CI/local checks. Artifacts land under `state_dir/pr_draft_qa/pr-<number>/<run-id>/`. |
| `pr-preship-review` | Runs the pr-review agent in adversarial pre-ship mode over planned PR slices (`--plan` from saved `pr-split-plan --json` output, `--all` or `--slice <id>`); any `reject` finding or infrastructure failure exits 1 and blocks handoff. Artifacts land under `state_dir/preship_reviews/<run-id>/<slice-id>/`. |
| `reconcile` | Runs the reconcile Pi agent. `--mode ship-validate` fixes QA-gate regressions before PR handoff; `--mode sync-merge` resolves merge conflicts, duplicate matches, and build errors after an upstream sync. `--attempt-budget` bounds fix cycles; artifacts land under `state_dir/reconcile/<timestamp>/`. |
| `save-point` | Records a campaign save point: commits the dirty worktree (never staging `decomp-orchestrator/` or the state dir), copies `report.json`/`report_changes.json` plus a board snapshot under `state_dir/save_points/<timestamp>/`, and inserts the row with commit/base SHAs and `matched_code_percent`. `--list` prints recent save points. |
| `kg-sources` | Lists active knowledge source sections and external tool integrations. |
| `kg-status` | Prints graph database path, source/tool registry summaries, and graph record counts. |
| `kg-curate` | Reduces worker reports and PR postmortems into graph-owned curator enrichment records. |
| `kg-maintain` | Runs pending PR postmortem indexing, curator reduction, optional curator-agent proposal review, and graph rebuild. |
| `kg-rebuild-graph` | Rebuilds the v1 SQLite graph from selected active sources and graph-owned enrichments. |
| `kg-search` | Searches indexed graph chunks with optional source filtering. |
| `kg-file-card` | Prints file graph context, editability, PR history, resource hits, and scheduling signals for one source path. |
| `kg-rank-features` | Shows graph-derived ranking features for current board candidates. |
| `status` | Prints run, queue, lease, event, and report summary data. |

## Boundaries

The CLI keeps the single-step commands for debuggability, exposes `run-loop`
for autonomous decomp-system runs, preserves `trigger-agent` / `bootstrap` as
compatibility aliases, and exposes `babysit` as the outer guardian process for
long-running development sessions.

Project resolution is a global CLI concern, not a command-local convention.
Commands consume `globals.repoRoot`, `globals.stateDir`, optional
`globals.graphDbPath`, and optional project metadata from the parser. State
metadata, agent prompts, resource maps, process command construction, and
knowledge graph commands can therefore share one selected project identity.

The resolver precedence is explicit override, then ignored local project
override, then tracked project descriptor, then built-in defaults. Relative
descriptor and local override paths resolve from the project directory; explicit
CLI paths resolve from the invoking working directory. Project descriptors may
also provide validation defaults, dashboard defaults, PR split defaults,
`baseRef`, `processName`, and `localEnv`.

The run loop is deliberately not a Pi agent. It is a thin evented loop over
durable SQLite state: handle unhandled events with deterministic scheduler
ticks, start worker sessions for open slots, then rest until state changes. The
babysit command is also not a Pi agent. It wraps the decomp system process,
sleeps while that process runs, wakes on process exit or worker-process error,
writes guardian artifacts under `state_dir/guardian/`, runs `recover-leases`
when appropriate, and restarts the child when policy allows.

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

`--worker-thinking-level` lets the run loop launch worker Pi sessions with
a thinking level different from the global CLI default. For example, a run can
keep review and manual commands on the global default while workers run with
`--worker-thinking-level low`.

The run loop also owns deterministic epoch shape. By default it keeps one
active scheduler epoch in SQLite, adopts any existing queued or leased repair
work into that epoch, admits a fixed target set from the graph-ranked board,
and refills only the immediately leaseable ready queue from that admitted set.
`--queue-target-size` remains a compatibility default, while
`--epoch-size <n|full>` controls total admission and
`--epoch-ready-queue-size <n>` controls how many admitted targets are kept
queued for workers.

When every admitted target reaches a terminal worker-report state, the boundary
pipeline commits validated work (excluding files under active leases), checks
that commit out into a persistent worktree at `<state-dir>/epoch_worktree`,
runs `--epoch-configure-command` plus the full report build there, publishes
fresh `report.json`/`report_changes.json` back to the live repo for board
scoring, advances the worktree baseline so the next epoch diffs
epoch-over-epoch, records an `epoch` save point with measures, regression
counts, and a `qa_gate` payload, requeues regressed functions as priority repair
targets, runs boundary knowledge maintenance according to
`--full-kg-maintenance-mode`, closes the scheduler epoch, and admits the next
epoch from the refreshed board. Epoch failures emit `epoch_cycle_error` and
back off `--epoch-retry-ms`; regressions above
`--epoch-regression-pause-threshold` emit `epoch_regression_pause` and pause
new epoch admission.

Three sizing knobs are separate. `--candidate-limit` remains the initial seed
size and compatibility pool size. `--epoch-size` is total admission for the
active scheduler epoch, with `full` admitting every currently schedulable board
candidate as the scan expands to exhaustion. `--epoch-ready-queue-size` is the
ready queue cap. `--candidate-window` controls the initial ranked-board scan;
the scheduler expands it when the requested epoch size or full-board scan needs
more candidates.

Fast run-evidence refresh is the in-epoch maintenance lane. The run loop can run
`kg-maintain --no-tool-runners` on an interval or after a coalesced worker-report
count. It records started, finished, skipped, and deferred events; it never
launches overlapping fast refreshes; and after a successful refresh it updates
priority order for queued targets inside the active admitted set. Fast refresh
does not rebuild report truth.

In legacy continuous mode (`--no-epoch-cycle`) the run loop instead tops the
queue back up toward the target on every pass and writes a prioritized
`pool_below_target` event when deterministic refill is not enough and capacity
is becoming inefficient. The CLI defaults route queue-pressure work when total
queued work falls to 25% of `--queue-target-size`, when unlocked distinct-file
work falls below `--max-workers`, when queued work is blocked by active file
locks, or when a long-tail drain persists for five minutes. The dashboard uses a
stricter preset policy: ready queue is always `4 * workers`, and
`--queue-low-watermark` is always `workers`, so a 16-worker dashboard run
keeps a 64-target queue and asks for fresh priority work when 16 queued
targets remain. In epoch mode those watermark replans are suppressed — a
draining queue is the intended shape — and `pool_below_target` is emitted only
when a post-rebuild refill finds no fresh board work. Operators using the CLI
directly can tune this with:

| Flag | Meaning |
| --- | --- |
| `--no-epoch-cycle` | Restore continuous queue top-up and watermark-driven replan events. |
| `--epoch-size <n\|full>` | Total target admissions for one scheduler epoch; default is `--queue-target-size`. |
| `--epoch-ready-queue-size <n>` | Number of admitted targets kept immediately leaseable. |
| `--epoch-worktree <path>` | Persistent checkpoint worktree; default `<state-dir>/epoch_worktree`. |
| `--epoch-configure-command <cmd>` | Shell command run in the worktree before each report build; default `python configure.py --require-protos`. |
| `--epoch-link-paths <a,b>` | Untracked build inputs symlinked from the live repo into the worktree; default `orig`. |
| `--epoch-regression-pause-threshold <n>` | Pause (no refill) when more than `n` report rows regress in one epoch; default 12. |
| `--epoch-regression-requeue-limit <n>` | Max regressed functions requeued as priority repairs per epoch; default 32. |
| `--epoch-retry-ms <n>` | Backoff after an epoch failure, pause, or exhausted board; default 600000. |
| `--fast-kg-maintenance-interval-ms <n>` | In-epoch fast refresh cadence; live default 180000 and dry-run default 0. |
| `--fast-kg-maintenance-report-count <n>` | Coalesced worker-report trigger for fast refresh; default 16. |
| `--no-fast-kg-maintenance` | Disable the in-epoch fast refresh lane. |
| `--full-kg-maintenance-mode <mode>` | Boundary maintenance mode: `full`, `no-tool-runners`, or `skip`. |
| `--candidate-limit <n>` | Initial seed size and compatibility pool size; default is `max(32, max_workers * 2)`. |
| `--queue-target-size <n>` | Compatibility default for epoch size and ready queue size; in `--no-epoch-cycle` mode it is the maintained queue level. |
| `--candidate-window <n>` | Initial number of ranked board candidates scanned; admission expands this when the window is exhausted. |
| `--graph-db <path>` | Knowledge graph used for board ranking and worker file-card context; defaults to the selected project's graph DB, or `knowledge/resource_graph/graph.sqlite` without a project. |
| `--queue-refresh-interval-ms <n>` | Legacy continuous-mode priority refresh interval; default is 60000. |
| `--queue-low-watermark <n>` | Emit queue-pressure work when total queued work is at or below `n` while workers are active. |
| `--schedulable-low-watermark <n>` | Emit queue-pressure work when unlocked distinct-file work is at or below `n` while the run is underfilled. |
| `--active-low-watermark <n>` | Active-worker threshold for long-tail detection; default is 75% of `--max-workers`. |
| `--long-tail-replan-ms <n>` | Emit queue-pressure work after underfilled long-tail state persists for `n` ms. |
| `--replan-interval-ms <n>` | Optional periodic queue-pressure refresh while workers are active; default `0` disables it. |
| `--replan-cooldown-ms <n>` | Minimum delay between run-loop-produced replan events. |
| `--no-blocked-queue-replan` | Disable queue-pressure work caused only by queued work blocked behind file locks. |

The babysit wrapper forwards these run-loop flags to its child `run-loop`
command. The legacy child command names `trigger-agent` and `bootstrap` remain
accepted for existing scripts.

## Regression Check

`regression-check` wraps the saved-baseline `ninja changes_all` flow, captures
stdout/stderr, parses `build/GALE01/report_changes.json`, writes
`summary.json`, and generates a PR-style Markdown report through
`packages/core/src/objdiff/report.ts`. The regression gate fails when Ninja returns nonzero,
the report cannot be parsed, or the report contains broken matches, fuzzy
regressions, or metric regressions.

The QA ship gate (L2) runs in the same command. After the build step,
`regression-check` invokes the `review_lint` diff scanner
(`tools/source_editing/review_lint/api/scan_diff.py`) against the merge-base
with `--qa-base` (default: the project's `baseRef`, else `origin/master`) and
folds the result into the verdict:
`passed = regressionGatePassed && !promotionBlocked && qaGatePassed`. The
summary gains `qaGateExitCode`, `qaGateSkipped`, `qaFindings`, `qaCounts`, and
`qaScanPath`; raw scanner output lands beside it as `qa_scan.json` and
`qa_scan.txt`. The gate fails closed — a scanner that cannot run blocks the
handoff — and a failure hint lists the violating rules at `file:line`, with
each finding citing the standard it violates. The only bypass is an explicit
`--skip-qa-gate`, for emergencies.

The same report evaluates PR promotion separately from regression cleanliness.
Default promotion evidence requires no regressions plus an exact new match or
matched code/data byte movement; fuzzy-only improvements are recorded as
`local_only` evidence because match percent alone can be misleading. Use
`--require-pr-promotion` for final maintainer-facing handoff, and tune
`--promotion-min-*` thresholds only when an operator deliberately wants a higher
or broader promotion policy.

## QA Repair

`qa-repair` is the PR-prep repair lane for deterministic QA findings in
candidate files. It reads the latest checkpoint for the selected run by
default, adds explicit `--candidate-files` or `--candidate-list` paths when
provided, and can replay a saved scanner result with `--scan-json`. When no
candidate source exists, `--all-scan-files` treats every file in the scan as a
candidate; the dashboard uses that fallback when no checkpoint artifact is
available.

The command writes:

- `queue.json`: all candidate files, grouped repair items, ignored findings,
  scan metadata, proofs, warnings, and attempts.
- `summary.json`: counts by file, status, rule, severity, recommendation, and
  artifact paths.
- `report.md`: a human review list of files with QA errors, warning-only
  files, rules, statuses, and routing reasons.
- `ship_status.json`: the split-plan filter containing surviving files and
  dropped-file reasons.

By default, the command only builds the deterministic artifacts. Error
findings always become repair items. Warning-only files remain advisory unless
`--repair-warnings` is set; with that flag, warnings are repair targets and the
post-repair scan must clear them before the item can become clean. With
`--run-agents`, it runs the `qa-repair` role for queued items; global
`--dry-run-agents` renders item prompts and output placeholders without live Pi
calls. `--item-id` selects one repair item and `--max-items` bounds the number
of items processed in one invocation.

Live item processing accepts only schema-valid agent JSON, including a
per-finding disposition of `fixed_source`, `fixed_by_minimal_revert`,
`left_with_evidence`, or `false_positive`, then reruns the QA scanner for that
file before applying status. `--score-check-command`, `--build-check-command`,
and `--regression-check-command` add runner-owned shell validations after a
live repair; each command runs from the project root, writes
stdout/stderr/summary artifacts under the item directory, and blocks clean
status on nonzero exit. The score command can emit JSON with
`preTargetScore`/`postTargetScore` or `score_impact` to route
`clean_lower_score`.

Validation command placeholders are `{repo_root}`, `{state_dir}`,
`{output_dir}`, `{run_id}`, `{item_id}`, `{source_path}`, and `{base_ref}`.
Agent failures, invalid JSON, missing post-scans, remaining error findings,
blocked outcomes, false-positive-only outcomes, and failed validation commands
cannot mark an item clean. Final ship-set verification still gates the
assembled PR plan.

## Run Checkpoint

`checkpoint-run` is the operator bridge between a drained run and PR packaging.
It reads worker reports for the selected run, writes checkpoint artifacts under
`state_dir/runs/<run_id>/checkpoints/<timestamp>/`, and persists the split to
`run_checkpoints` and `checkpoint_items`.

The checkpoint classifies exact-match `progress` or `score_candidate` reports
as `pr_candidate`. Clean non-exact progress is evaluated against the project's
improvement promotion floors (`pr.improvementMinGainPoints`, default 2.0
match-percent points, and `pr.improvementMinMatchedBytes`, default 64 estimated
matched bytes from function size × gain): improvements that clear both floors
become `improvement_candidate` and ship in a separate improvement PR lane,
while sub-floor progress becomes `deferred_patch`. `needs_fact`,
`stalled_no_useful_guess`, and `needs_rework` reports stay visible as
carry-forward evidence. The generated `pr_candidates.md` lists both lanes
(match candidates first, then improvement candidates with their gain and byte
evidence) and is the source list for PR packaging, while `carry_forward.md` is
the ledger of local work that should not be forgotten after the baseline or
next run is reset.

The dashboard Fresh Run action checkpoints the current run before resetting the
report baseline by default. Disable that only when intentionally discarding or
manually managing the previous run handoff.

The dashboard PR Handoff panel also exposes `Checkpoint` as a direct action.
That UI path calls the same `createRunCheckpoint` handoff logic as
`checkpoint-run` and refuses active leases unless the run has been drained or
the leases have been recovered.

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

Passing `--checkpoint <checkpoint.json>` (the dashboard does this
automatically using the latest run checkpoint) splits each subsystem slice
into PR lanes: a match slice carrying `pr_candidate` files plus supporting
files the matches need to build, and an improvement slice
(`improve-<subsystem>` branch, `(fuzzy improvements)` title) carrying
`improvement_candidate` files. Improvement slices warn that they need
NONMATCHING framing and a lower review priority; match slices warn when a file
also carries fuzzy improvements in other functions. `--max-files-per-pr` is a
hard ceiling for slice refinement, not a packing target.

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

## Draft PR QA Lifecycle

`pr-draft-qa` is the PR-bound pre-human-review coordinator. The command either
resolves an existing PR with `--pr` / `--pr-url`, or creates the draft first
with `--create-draft --title`. The PR remains the remote anchor: the command
uses `gh pr view`, fetches the PR base and `pull/<number>/head`, and writes the
run under `state_dir/pr_draft_qa/pr-<number>/<run-id>/`.

Each run writes a one-slice PR plan, a full PR diff, `review_lint` scan
artifacts, preship-review artifacts, optional QA-repair artifacts, collected
GitHub issue/review comments, comment-posting results, CI output, optional
local-check output, `report.md`, and `summary.json`. The summary status is one
of:

| Status | Meaning |
| --- | --- |
| `ready_for_human_review` | Preship review, deterministic QA scan, repair queue, CI, and local check are clean. |
| `ready_for_human_review_with_warnings` | Blocking findings are clean; warning-only findings remain visible in artifacts because `--advisory-warnings` or `--allow-lower-score-repairs` explicitly permits them. |
| `manual_review_required` | Non-deterministic preship rejects remain, but they are posted or already present as PR comments for human judgment. |
| `needs_repair` | Deterministic QA errors, strict warning findings, unresolved repair items, false positives, or lower-score repair dispositions remain. |
| `blocked` | A scan, CI check, local check, or infrastructure step failed. |

`--run-agents` runs `qa-repair` for deterministic findings and preship findings
that have a concrete file. Draft QA is strict by default: warning findings are
queued with `--repair-warnings`, remaining warnings block ready status, and
`clean_lower_score` repair results remain `needs_repair` unless
`--allow-lower-score-repairs` is set. `--advisory-warnings` restores advisory
warning behavior for intentionally loose local checks, and
`--no-repair-warnings` keeps warnings blocking without queueing warning-only
files. The command repeats the preship/scan/repair loop up to
`--max-repair-rounds` (default 2). Because live repairs edit the local checkout,
`--run-agents` also includes the current worktree in later diffs; operators can
pass `--include-worktree` explicitly for manual fixes before commit/push. The
command does not commit or push repair edits.

`--comment-unresolved` posts one GitHub comment per unresolved finding after the
repair loop. Each comment includes a hidden marker derived from the finding
source, path, line, rule, standard, and message, so reruns skip already-posted
findings. The command tries an inline review comment when the finding has a
file and line, then falls back to a top-level PR comment if GitHub rejects the
inline location. Strict draft QA includes warning findings in the unresolved
comment set; `--comment-warnings` also includes warnings when advisory mode is
enabled.

`--wait-ci` runs `gh pr checks --watch`; without it, the command snapshots
`gh pr checks`. `--skip-ci` bypasses GitHub checks for local dry runs.
`--local-check-command` runs a final shell gate with placeholders
`{repo_root}`, `{state_dir}`, `{output_dir}`, `{run_id}`, `{pr}`,
`{base_ref}`, and `{head_ref}`. The make wrapper uses the same command:

```bash
make pr-draft-qa PR=2704
```

## Dashboard Handoff Controls

The UI server wraps the same operator commands for PR preparation:

| UI Action | Underlying behavior |
| --- | --- |
| `Pause Intake` | Drains the managed process and marks the run `paused`, which prevents `start`, `tick`, `worker`, and `run-loop` scheduling until the run is resumed. |
| `Checkpoint` | Runs the checkpoint handoff logic and writes checkpoint artifacts under the run state directory. |
| `Run QA` | Runs `regression-check` with `--require-pr-promotion` enabled by default, plus `--promotion-min-unmatched-improvement-bytes` from the project's improvement byte floor so improvement-only handoffs can still promote. |
| `Plan PRs` | Runs `pr-split-plan` with the selected base ref, group mode, branch prefix, title prefix, worktree/untracked options, the latest checkpoint for match/improvement lane splitting, and the latest ship-status filter when Prepare produced one. |
| `Prepare` | Runs pause, upstream sync/rebase, baseline rebuild, branch QA, checkpoint, rework requeue, QA repair, split planning, ship-set verification, reconcile/replan when needed, PR-record sync, and a ship save point. |

The UI stores split-plan artifacts under
`state_dir/pr_handoff/<run_id>/split_plans/<timestamp>/`. Regression-check
artifacts stay under `state_dir/regression_checks/<run_id>/<timestamp>/`, and
checkpoint artifacts stay under
`state_dir/runs/<run_id>/checkpoints/<timestamp>/`. QA repair artifacts stay
under `state_dir/qa_repairs/<run_id>/<timestamp>/` and are surfaced in the
Ship details panel as the latest QA repair report/summary link.

## Knowledge Maintenance

`run-loop` can run `kg-maintain` in the background. Live runs default to a
five-minute maintenance interval; dry-run agents default to disabled. Use
`--no-knowledge-maintenance` to disable it, or
`--knowledge-maintenance-interval-ms <n>` to tune it.

Maintenance does not require the main loop to inspect individual PRs. The PR
postmortem command uses pending-only discovery to find PRs in the active corpus
that do not have `postmortem/postmortem.json` yet. Live run-loop maintenance queues up to
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
- [UI implementation](../ui/00-overview.md)
- [Agent runtime](../agents/30-runtime.md)
