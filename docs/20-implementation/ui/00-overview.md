---
covers: Dashboard server, React UI, process controls, and PR handoff controls
concepts: [ui, dashboard, process-controls, pr-handoff, checkpoint, regression-check, pr-split-plan]
code-ref: decomp-orchestrator/apps/dashboard, decomp-orchestrator/apps/dashboard-server/src
---

# UI: Overview

The UI is the operator dashboard for live runs. It combines a Bun HTTP server
with a React app so an operator can inspect progress, manage the long-running
process, checkpoint runs, and prepare PR handoff artifacts without switching to
the shell.

## File Tree

```text
apps/
+-- dashboard/
|   +-- index.html
|   +-- src/
|   |   +-- components/
|   |   +-- hooks/
|   |   +-- lib/
|   |   +-- main.tsx
|   |   +-- styles.css
|   +-- vite.config.ts
+-- dashboard-server/
    +-- src/
        +-- server.ts
        +-- trusted-report.ts
```

## Server

`apps/dashboard-server/src/server.ts` serves built static assets from
`apps/dashboard/dist/` and exposes JSON endpoints under `/api/`.
`ORCH_UI_PORT` selects the port, defaulting to `8787`. The module exports a
fetch handler for non-listening validation and starts Bun only when run as the
server entrypoint.

The server keeps a small in-process process record for the managed babysit
process and also reads saved process files from
`state_dir/ui-processes/*.json`. This lets the dashboard reconnect to a saved
process record even after a browser refresh or UI server restart. Saved process
records include the selected project summary, repo root, state directory, graph
database path, and command array.

All dashboard routes resolve paths through the project resolver. `/api/config`
returns available projects, the default project id, selected project summary,
project defaults, and default repo/state/graph paths. Request query strings and
POST bodies send `projectId` by default; raw repo/state/graph paths are applied
only when `usePathOverrides` is true.

Dashboard data comes from the resolved project context. It combines:

- SQLite run, queue, lease, event, report, checkpoint, and handoff state.
- Current board/report measures from the selected project checkout.
- Trusted `report_changes.json` data when the report is fresh for the run.
- Recent worker reports, touched files, active files, queue rows, and process
  logs.

The dashboard stream endpoint sends server-sent events at
`ORCH_UI_DASHBOARD_INTERVAL_MS` cadence. It emits the full dashboard payload
when stable state changes and compact tick payloads for elapsed-time updates.

## Layout

The React app has three regions:

- Left controls rail: five panels that all share one shape — a title row with
  right-aligned status meta, always-visible primary content, and at most one
  disclosure for secondary detail. In order: Status (campaign pill plus
  readiness rows: run/leases, workers, upstream rebase position, baseline
  freshness, checkpoint lanes, QA verdict, plan lanes, with artifact paths
  behind the disclosure), Actions (every operator button in one panel,
  sectioned Run / Handoff / Session, grayed by flow position with the
  blocking reason as the tooltip and the recommended next action
  highlighted), Project, Run Setup, and Process. See the
  [operator runbook](10-operator-runbook.md) for how a full cycle reads.
- Center work area: progress metrics, the match-verification ladder, and
  active/queued work. The ladder is three tabs: **Confirmed** (new exact
  matches in the trusted `report_changes.json` — byte-level truth vs the
  baseline), **Tentative** (runner-validated worker match claims newer than
  the current report; each report rebuild either confirms them into the first
  tab or clears them), and **Improvements** (report-level fuzzy gains plus
  fresh worker gains since the report). Workers add tentative rows between
  report builds; epoch boundaries and QA rebuild the report and settle them.
- Right details rail: `Run`, `Agents`, and `Logs` tabs — the view into the
  system, while the left rail stays controls-only. The Logs tab opens with an
  operation activity card: the server tracks the one long-running dashboard
  operation (sync, prepare handoff, checkpoint, QA, plan PRs, reconcile, fresh
  run) as named steps with per-step status and elapsed time, exposed as
  `process.operation` in the dashboard payload. The card shows which step is
  running, keeps the last result (including the failing step and error) until
  the next operation starts, and sits directly above the live command output
  it summarizes. Triggering any of these operations auto-opens the details
  rail on the Logs tab, and while one runs (or after one fails) a slim
  clickable strip across the top of the center column shows the operation,
  its current step, and elapsed time even when the rail is collapsed.

Both side rails are collapsible. The open left controls rail uses the same
responsive track as the open right details rail, `minmax(440px, 560px)`, so
handoff controls have enough horizontal space. Collapsed rails use a `44px`
icon strip and persist their collapsed state in `localStorage` as
`sidebarCollapsed` and `detailsCollapsed`.

## Session Phase Stepper

`apps/dashboard/src/components/PhaseStepper.tsx` derives the operating phase of
the session cycle from durable dashboard state — run status, active lease
count, process liveness, sync activity, and handoff artifacts — and renders a
six-step stepper (Sync & Intake → Baseline & Init → Run → Checkpoint & Validate
→ Ship PRs → Resync) at the top of the left rail. No new state is stored; the
phase is recomputed from each dashboard payload.

The same derivation produces the sync lock: while the run is `active`,
`Intake Merged PRs` is disabled with the lock reason as its tooltip, and the
server independently rejects `POST /api/project/sync` so the lock is hard, not
UI-only. The full design rationale lives in
[../../sidebar-flow-design.html](../../sidebar-flow-design.html).

## Campaign Strip And Save Points

The center column opens with a where-we-are strip driven by the dashboard's
`campaign` block: latest save point (commit, trigger, matched percent, age),
current head (sha, branch, dirty), and the count of commits not yet merged into
the base ref. When the checkout has moved past the save point the strip shows a
staleness banner instead of silently presenting old numbers. The `Save Point`
button posts to `POST /api/save-point`; the server also records automatic save
points after init, pause, checkpoint, QA, sync, and fresh-run boundary actions.

## Epoch Checkpoints

The dashboard payload carries an `epochs` array: save points with trigger kind
`epoch`, oldest first, each with matched-code percent, measures, regression
counts, and repair results. The Progress panel renders them as an "Epoch
checkpoints" table — per-epoch matched percent, delta against the previous
epoch, and regression/repair status — with the total delta since the first
epoch in the header. The run's starting position stays anchored to the
existing `initial` measures, so the start never moves while the current
position advances one epoch at a time.

## Process Controls

The Run section manages the long-running decomp process:

| UI Action | Endpoint | Behavior |
| --- | --- | --- |
| `Start` | `POST /api/process/start` | Starts the managed babysit process for an active run. The command includes `--project <id>` plus resolved repo/state/graph paths. The server refuses to start workers for a paused, complete, or failed run. |
| `Stop` | `POST /api/process/drain` | Requests a soft drain: child workers receive `SIGTERM`, and the supervisor is stopped so no new workers are introduced. |
| `Force Stop` | `POST /api/process/stop` | Stops the process group and runs `recover-leases --force` by default. |
| `Report Now` | `POST /api/report/run` | Runs the trusted report refresh flow through `forceReportRun`. |
| `Fresh Run` | `POST /api/run/fresh` | Optionally checkpoints the current run, resets the report baseline, initializes a new run, and refreshes PR knowledge. |

Run Setup exposes scheduling as a size preset plus epoch controls. The dashboard
server derives `--max-workers`, `--queue-target-size`, `--queue-low-watermark`,
`--candidate-limit`, `--candidate-window`, `--epoch-size`,
`--epoch-ready-queue-size`, fast refresh cadence, and boundary maintenance mode
from form state and project defaults. The managed process name remains the
project process name, which is `melee-live` for the Melee dashboard run.

| Preset | Workers | Default epoch | Ready queue |
| --- | ---: | ---: | ---: |
| Small | 4 | 16 | 16 |
| Medium | 8 | 32 | 32 |
| Large | 16 | 64 | 64 |
| XL | 32 | 128 | 128 |

The active scheduler epoch is a fixed admitted target set. The ready queue is
the subset of admitted targets that workers can lease immediately. Operators can
choose preset epoch sizes (`32`, `64`, `128`, `256`, `512`, or `full`), tune the
ready queue independently, enable or disable fast run-evidence refresh, set the
fast interval/report-count triggers, and choose boundary maintenance mode
(`full`, `no-tool-runners`, or `skip`). Dashboard status surfaces active epoch
admitted, queued, leased, completed, and remaining counts from durable state.

Fresh Run (the `New Session` dock action) always checkpoints the current run
first, preserving PR candidates and carry-forward work before the next
baseline/session is created. There is no longer a UI toggle for skipping that
checkpoint; pass `checkpointBeforeFresh: false` to the endpoint directly for
the rare intentional-discard case.

## PR Handoff Controls

The PR Handoff section is the UI-facing sequence for pausing new work, keeping
the current run durable, running final QA, and producing reviewer-sized PR plan
artifacts.

| UI Action | Endpoint | Behavior |
| --- | --- | --- |
| `Pause Intake` | `POST /api/pr/pause` | Drains the managed process and marks the run `paused`. Worker and trigger commands reject non-active runs, so no new worker edits can be introduced until the run is resumed. |
| `Resume` | `POST /api/pr/resume` | Marks the run `active` again so scheduling can continue. |
| `Checkpoint` | `POST /api/run/checkpoint` | Calls `createRunCheckpoint` for the current run and writes `checkpoint.json`, `pr_candidates.md` (match and improvement lanes), and `carry_forward.md`. |
| `Run QA` | `POST /api/pr/qa` | Runs `regression-check --require-pr-promotion` by default (plus the project's improvement byte floor as `--promotion-min-unmatched-improvement-bytes`) and returns the generated summary/report artifact paths even when the gate fails. |
| `Reconcile` | `POST /api/pr/reconcile` | Runs the reconcile agent in `ship-validate` mode against the latest QA summary to fix regressions before handoff. Rejected while the run is `active`. |
| `Plan PRs` | `POST /api/pr/split-plan` | Runs `pr-split-plan` with the latest checkpoint for lane splitting and writes a Markdown plan plus `summary.json` under the handoff artifact directory. |
| `Prepare` | `POST /api/pr/prepare` | Runs the full ship pipeline: pause → pull upstream & rebase → rebuild production baseline (worktree at the base SHA, cached per SHA) → QA vs the new baseline → checkpoint (regressed symbols forced to `needs_rework`) → lane-aware split plan. Stops with the QA hint as the error if the gate fails; the checkpoint still lands. |

Checkpoint, QA, split planning, and Prepare refuse to run while a worker
process is alive (server-side `assertHandoffIdle`); the dashboard disables the
matching buttons until workers are stopped and all leases are released. Pause
and Resume stay available because pausing is how the operator stops intake.

QA and split-plan inputs (QA target, base ref, group mode, max files per PR,
branch/title prefixes, improvement promotion floors) are not editable in the
UI: they come from `projects/<id>/project.json`, with `local.project.json` as
the per-machine override.

Latest handoff artifacts are summarized in the dashboard under
`dashboard.handoff`:

- `checkpoint`: latest `run_checkpoints` row plus disposition counts.
- `qa`: latest `state_dir/regression_checks/<run_id>/<timestamp>/summary.json`.
- `splitPlan`: latest
  `state_dir/pr_handoff/<run_id>/split_plans/<timestamp>/summary.json`.

## Artifact Locations

| Artifact | Location |
| --- | --- |
| Checkpoint summary | `state_dir/runs/<run_id>/checkpoints/<timestamp>/checkpoint.json` |
| PR candidates | `state_dir/runs/<run_id>/checkpoints/<timestamp>/pr_candidates.md` |
| Carry-forward ledger | `state_dir/runs/<run_id>/checkpoints/<timestamp>/carry_forward.md` |
| QA summary | `state_dir/regression_checks/<run_id>/<timestamp>/summary.json` |
| QA PR report | `state_dir/regression_checks/<run_id>/<timestamp>/pr_report.md` |
| Split plan summary | `state_dir/pr_handoff/<run_id>/split_plans/<timestamp>/summary.json` |
| Split plan Markdown | `state_dir/pr_handoff/<run_id>/split_plans/<timestamp>/pr_split_plan.md` |

## Related

- [CLI overview](../cli/00-overview.md)
- [State implementation](../state/00-overview.md)
- [Score integration and PR handoff](../../10-system-design/60-score-and-pr-handoff.md)
