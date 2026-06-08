---
covers: Dashboard server, React UI, process controls, and PR handoff controls
concepts: [ui, dashboard, process-controls, pr-handoff, checkpoint, regression-check, pr-split-plan]
code-ref: decomp-orchestrator/src/ui
---

# UI: Overview

The UI is the operator dashboard for live runs. It combines a Bun HTTP server
with a React app so an operator can inspect progress, manage the long-running
process, checkpoint runs, and prepare PR handoff artifacts without switching to
the shell.

## File Tree

```text
src/ui/
+-- server.ts
+-- trusted-report.ts
+-- app/
|   +-- components/
|   |   +-- App.tsx
|   |   +-- DetailsRail.tsx
|   |   +-- ProgressPanel.tsx
|   |   +-- Sidebar.tsx
|   |   +-- WorkTables.tsx
|   |   +-- primitives.tsx
|   +-- hooks/
|   +-- lib/
|   +-- types.ts
+-- static/
```

## Server

`server.ts` serves built static assets from `src/ui/static/dist/` when present,
falls back to `src/ui/static/`, and exposes JSON endpoints under `/api/`.
`ORCH_UI_PORT` selects the port, defaulting to `8787`.

The server keeps a small in-process process record for the managed babysit
process and also reads saved process files from
`state_dir/ui-processes/*.json`. This lets the dashboard reconnect to a saved
process record even after a browser refresh or UI server restart.

Dashboard data comes from `runDashboard(repoRoot, stateDir)`. It combines:

- SQLite run, queue, lease, event, report, checkpoint, and handoff state.
- Current board/report measures from the Melee checkout.
- Trusted `report_changes.json` data when the report is fresh for the run.
- Recent worker reports, touched files, active files, queue rows, and process
  logs.

The dashboard stream endpoint sends server-sent events at
`ORCH_UI_DASHBOARD_INTERVAL_MS` cadence. It emits the full dashboard payload
when stable state changes and compact tick payloads for elapsed-time updates.

## Layout

The React app has three regions:

- Left controls rail: project paths, run/process controls, and PR handoff
  controls.
- Center work area: progress metrics, trusted report or worker-score movement,
  improved files/symbols, and active/queued work.
- Right details rail: worker report filters, full run details, and process
  logs.

Both side rails are collapsible. The open left controls rail uses the same
responsive track as the open right details rail, `minmax(440px, 560px)`, so
handoff controls have enough horizontal space. Collapsed rails use a `44px`
icon strip and persist their collapsed state in `localStorage` as
`sidebarCollapsed` and `detailsCollapsed`.

## Process Controls

The Run section manages the long-running decomp process:

| UI Action | Endpoint | Behavior |
| --- | --- | --- |
| `Start` | `POST /api/process/start` | Starts the managed babysit process for an active run. The server refuses to start workers for a paused, complete, or failed run. |
| `Stop` | `POST /api/process/drain` | Requests a soft drain: child workers receive `SIGTERM`, and the supervisor is stopped so no new workers are introduced. |
| `Force Stop` | `POST /api/process/stop` | Stops the process group and runs `recover-leases --force` by default. |
| `Report Now` | `POST /api/report/run` | Runs the trusted report refresh flow through `forceReportRun`. |
| `Fresh Run` | `POST /api/run/fresh` | Optionally checkpoints the current run, resets the report baseline, initializes a new run, and refreshes PR knowledge. |

Fresh Run has a `Checkpoint before fresh` option enabled by default. This
preserves PR candidates and carry-forward work before the next baseline/session
is created.

## PR Handoff Controls

The PR Handoff section is the UI-facing sequence for pausing new work, keeping
the current run durable, running final QA, and producing reviewer-sized PR plan
artifacts.

| UI Action | Endpoint | Behavior |
| --- | --- | --- |
| `Pause Intake` | `POST /api/pr/pause` | Drains the managed process and marks the run `paused`. Worker and trigger commands reject non-active runs, so no new worker edits can be introduced until the run is resumed. |
| `Resume` | `POST /api/pr/resume` | Marks the run `active` again so scheduling can continue. |
| `Checkpoint` | `POST /api/run/checkpoint` | Calls `createRunCheckpoint` for the current run and writes `checkpoint.json`, `pr_candidates.md`, and `carry_forward.md`. |
| `Run QA` | `POST /api/pr/qa` | Runs `regression-check --require-pr-promotion` by default and returns the generated summary/report artifact paths even when the gate fails. |
| `Plan PRs` | `POST /api/pr/split-plan` | Runs `pr-split-plan` and writes a Markdown plan plus `summary.json` under the handoff artifact directory. |
| `Prepare` | `POST /api/pr/prepare` | Runs the combined pause, checkpoint, QA, and split-plan sequence. Split planning runs only if QA passes. |

The section also exposes the key QA and split-plan inputs:

- QA target, default `changes_all`.
- QA report row limit, default `300`.
- PR promotion requirement, enabled by default.
- Split base ref, default `origin/master`.
- Split group mode, `melee-subsystem` or `top-dir`.
- Maximum files per suggested PR.
- Branch/title prefixes.
- Whether to include untracked files or restrict to committed changes.

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
