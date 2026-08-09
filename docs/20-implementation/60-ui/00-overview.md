---
covers: Dashboard server, React UI, session setup, process controls, PR handoff controls, and workspace style controls
concepts: [ui, dashboard, project-session, session-setup, process-controls, pr-handoff, checkpoint, regression-check, pr-split-plan, style-controls, visual-effects]
code-ref: decomp-orchestrator/apps/frontend, decomp-orchestrator/apps/server/src
---

# UI: Overview

The UI is the operator dashboard for live runs. It combines a Bun HTTP server
with a React app so an operator can inspect progress, prepare a session
baseline, manage the long-running process, checkpoint runs, and prepare PR
handoff artifacts without switching to the shell.

## File Tree

```text
apps/
+-- frontend/
|   +-- src/
|   |   +-- components/
|   |   +-- hooks/
|   |   +-- lib/
+-- server/
    +-- src/
        +-- server.ts
        +-- api/routes/
        +-- core/session-runtime/phases/
        +-- infrastructure/dashboard/
            +-- server.ts
            +-- read-model.ts
            +-- project-context.ts
```

## Server

`apps/server/src/server.ts` is the stable Bun entrypoint shim. The dashboard
server implementation lives in `apps/server/src/infrastructure/http/server.ts`;
it serves built static assets from `apps/frontend/dist/` and exposes JSON
endpoints under `/api/`.
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

- SQLite run, epoch target, target claim, worker state, checkpoint, event, and
  handoff state.
- Current board/report measures from the selected project checkout.
- Trusted `report_changes.json` data when the report is fresh for the run.
- Recent worker states, validation checkpoints, touched files, active claim
  files, and process logs.

The dashboard stream endpoint sends server-sent events at
`ORCH_UI_DASHBOARD_INTERVAL_MS` cadence. It emits the full dashboard payload
when stable state changes and compact tick payloads for elapsed-time updates.

## Layout

`apps/frontend/src/components/SessionWorkspace.tsx` is the main project and
session shell. It derives a client-side session view model from the existing
dashboard payload rather than requiring a durable session-store migration. The
view model maps selected project, run status, process state, handoff artifacts,
PR records, campaign/save-point data, epochs, and run details into one active
session with a mode verdict: `Run Mode`, `PR Mode`, or `No Active Session`.

The React app has three regions:

- Left project/session navigation rail: selected project, active session label,
  current mode verdict, and workspace buttons for Overview, Standards,
  Knowledge, Sessions, Agents, Trace, and Settings. The rail is the navigation
  and orientation surface; it does not show every operator control at once.
- Center focused page: the selected page owns the primary work surface. Project
  Home shows the active-session gate and recommended next page. When a
  canonical preparing, running, or PR session exists, Project Home recommends
  opening that concrete session instead of starting another one; the New
  Session action remains gated until the active session is complete. Project
  Access shows project paths, config health, knowledge sources, validation
  defaults, and PR defaults. Active Session shows mode evidence and key artifacts.
  Sessions > Prepare shows setup readiness for the visible session:
  configuration, sync intake, missing PR indexing, knowledge refresh, baseline,
  and the worker-start gate. Run Mode shows run controls, run setup, process
  state, progress, epochs, worker states, active claims, checkpoints, and
  report measures. PR Queue shows
  handoff status, QA and repair rounds, ship-set/split-plan artifacts, PR rows,
  draft-opening controls, and review/blocker status. Session History shows save
  points, epochs, PR intake, and carry-forward state from available artifacts.
  Agents is the prompt-preview and agent-catalog migration anchor. Trace is the
  kernel-container and trace-viewer migration anchor for the selected active
  session.
- Right details rail: `Run`, `Agents`, and `Logs` tabs remain available for
  deep inspection. The Logs tab opens with an operation activity card: the
  server tracks the one long-running dashboard operation (sync, prepare
  handoff, checkpoint, QA, plan PRs, reconcile, fresh run) as named steps with
  per-step status and elapsed time, exposed as `process.operation` in the
  dashboard payload. Triggering any long-running operation auto-opens the
  details rail on the Logs tab.

The Standards page loads `GET /api/standards` for the selected project,
displays the project-owned knowledge root/source root/graph path, edits
`projects/<id>/knowledge/sources/injectable/decomp_standards/data`, and posts
saves back through the same project-scoped API route.

## Style Workspace

The Style workspace is a client-side appearance control surface for the
operator dashboard. Settings live in `localStorage` under `styleSettings.v1`
and are normalized by `apps/frontend/src/lib/styleSettings.ts` when loaded, so
missing or out-of-range fields fall back to safe defaults. The reset action
restores the complete style stack.

The app shell applies style settings as CSS custom properties on
`apps/frontend/src/components/app/index.tsx`, which lets the same controls
affect dashboard pages, rails, and details panels without server state. The
grain and normal-map layers are rendered by
`apps/frontend/src/components/app/_components/GrainOverlay.tsx` as fixed,
pointer-transparent SVG overlays above the workspace.

Style controls are grouped by effect:

- Global Grain controls the existing procedural grain overlay: enabled state,
  opacity, frequency, contrast, and blend mode.
- Softening Mix splits the visual softening percentage across backgrounds,
  font, borders, and icons. Background softening scales overlay opacity and
  surface color mixing; font softening adjusts text color mixing and glow;
  border softening adjusts line/status-border color mixing; icon softening
  uses the shared `app-icon` class applied by `apps/frontend/src/icons/index.tsx`.
- SVG Normal is an opt-in native SVG lighting pass using turbulence plus
  diffuse lighting. It exposes opacity, texture frequency, depth, light angle,
  and light height controls.
- CSS Bevel is an opt-in native CSS relief pass. It maps strength, depth,
  highlight, shadow, and text relief settings into inset shadows on bordered
  surfaces and subtle text-shadow offsets on the app shell.

Both side rails are collapsible. The navigation rail persists its collapsed
state in `localStorage` as `sidebarCollapsed`; the details rail persists
`detailsCollapsed` and `detailsWidth`.

## Agent And Trace Anchors

`apps/frontend/src/routing.ts` includes `agents` and `trace` as first-class
workspace sections. `apps/frontend/src/components/SessionWorkspace.tsx`
mounts the shared kernel viewer packages in those sections:

- Agents fetches `GET /api/kernel/agents` from the dashboard server and renders
  the returned kernel `AgentCatalogViewer` definitions. The server builds that
  payload through the real `apps/server/src/core/agent-catalog` prompt builders
  and kernel catalog conversion, so sample prompt rendering stays aligned with
  the runtime prompt contract. The page also shows recent agent-run identity when the mounted
  kernel read API has trace rows.
- Trace fetches the app-mounted kernel read API under `/kernel/trace-sessions`
  and `/kernel/trace-sessions/:id`, builds viewer spans with
  `@agent-kernel/viewer-core`, and renders `KernelTraceViewer` from
  `@agent-kernel/viewer-shell`. It honors `traceId` and `containerId` URL
  selections only inside the selected workspace scope. The list is first
  filtered to the selected project id and, when a canonical project session is
  active, narrowed to that session id or its stored kernel trace pointers
  (`app_session_id`, `root_container_id`, or `active_container_id`). The viewer
  then renders setup, baseline, run, PR, and publication containers inside the
  selected session root instead of exposing unrelated kernel validation or
  historical project rows as peer sessions.

The dashboard server exposes kernel runtime status at
`GET /api/kernel/status` and forwards the app-mounted kernel read API under
`/kernel/...`. It uses `ORCH_AGENT_KERNEL_DATABASE_URL` or
`AGENT_KERNEL_DATABASE_URL` when configured, otherwise the local default
Postgres kernel database on `127.0.0.1:55432`; `ORCH_AGENT_KERNEL_DISABLED=1`
opts out. Startup upserts the Melee kernel registration and starts the Melee
trace tailer against `.pi-sessions` only from the real server lifecycle.
Imported fetch-handler validation can still probe routes without starting file
watchers. Status responses include the DB source, redacted URL, and tailer
status when it has been started; the dashboard server does not own the database
process lifecycle.

Dashboard-owned workflow operations also submit app-sourced kernel trace
events for non-agent phases. Creating a canonical project session writes the
root session container and a `New session started` event before the heavier
fresh-run preparation begins. Fresh Run writes a `prepare` container under the
session root, then nests setup children below it: Sync Intake writes the
setup/sync-intake container for upstream fetch, canonical upstream-current and
session-current worktree setup, merged-PR discovery, and the PR-index debt
snapshot. Git Sync emits separate app events for start, git/worktree
completion, PR-index debt measurement, final completion, and failure, all under
the same Sync Intake container. Session-current setup reuses a clean
already-checked-out session branch worktree when one exists, including the
legacy `sessions/<sessionUuid>/source` layout, and reports the actual reused
path in project-session state. PR Index writes the
PR-index container for newly merged and missing PR postmortem indexing,
knowledge graph maintenance writes the knowledge-refresh container, and
report-baseline reset writes the baseline container. Draft PR opening writes a
publication container under the PR tree.
When a workflow event does not supply an explicit session id, the server
resolves the active canonical project session UUID before falling back to a
legacy run id. Successful event submission updates the project session's
`kernel_trace_json` with the kernel app session id, root container id, active
container id, and Trace URL. These events use the same root app session ids as
agent spawns so the Trace workspace can render prepare/setup, baseline,
run/agent, PR, repair, and publication lineage in one tree.
The Trace page reads `/api/project-session` for durable project-session rows,
selects the active session by default, then scopes the raw kernel list to the
selected project and selected session id. If the selected session has no
kernel rows yet, the page keeps the session anchor and shows an empty session
state instead of falling back to validation or legacy traces. Trace detail
rendering passes the read API's container summaries into the viewer span
builder, so app-sourced workflow events without PI sessions still appear under
the persisted session, prepare, and subphase containers.
App-session read resolution prefers the root session container when expanding
`/kernel/trace-sessions/:appSessionId`.

The target flow for the underlying runtime and container/event model lives in
[../../10-system-design/01-session-operating-flow.md](../../10-system-design/01-session-operating-flow.md).

## Session Phase Stepper

The active session page renders a four-stage stepper from
`apps/frontend/src/routing.ts`: Prepare -> Run -> PR -> Done. The current route
drives the highlighted stage, while the recommended stage comes from the
session view model. Prepare covers setup and readiness work; PR covers handoff
packaging and review.

The focused page shell uses `SessionWorkspace` for the primary mode verdict and
keeps sync intake locked while a run is active, workers are alive, active claims
exist, or another long-running dashboard operation is in progress. The server
independently rejects locked sync operations so the lock is hard, not UI-only.

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
| `Force Stop` | `POST /api/process/stop` | Stops the process group and runs `recover-claims --force` by default. |
| `Report Now` | `POST /api/report/run` | Runs the trusted report refresh flow through `forceReportRun`. |
| `Fresh Run` | `POST /api/run/fresh` | Optionally checkpoints the current run, resets the report baseline, initializes a new run, and refreshes PR knowledge. |

Run Setup exposes scheduling as a size preset plus epoch controls. The dashboard
server derives `--max-workers`, `--queue-target-size`, `--queue-low-watermark`,
`--candidate-limit`, `--candidate-window`, `--epoch-size`,
`--epoch-ready-queue-size`, fast refresh cadence, and boundary maintenance mode
from form state and project defaults. The managed process name remains the
project process name, which is `melee-live` for the Melee dashboard run.

| Preset | Workers | Default epoch | Worker slots |
| --- | ---: | ---: | ---: |
| Small | 4 | 16 | 16 |
| Medium | 8 | 32 | 32 |
| Large | 16 | 64 | 64 |
| XL | 32 | 128 | 128 |

The active scheduler epoch is a fixed admitted target set. Active claims are
the subset of admitted targets that workers currently own. Operators can
choose preset epoch sizes (`32`, `64`, `128`, `256`, `512`, or `full`), tune the
worker-slot target independently, enable or disable fast run-evidence refresh, set the
fast interval/report-count triggers, and choose boundary maintenance mode
(`full`, `no-tool-runners`, or `skip`). Dashboard status surfaces active epoch
admitted, claimed, finished, and remaining counts from durable state.

The `New Session` action creates the canonical project session through
`POST /api/project-session/new` and opens `/sessions/<sessionUuid>/prepare`.
It does not run setup work automatically. The Prepare page then drives explicit
operator gates: `POST /api/project-session/preparing/sync-git` fetches and
syncs the configured upstream base into
`projects/<id>/worktrees/upstream-current`, creates or reuses
`projects/<id>/worktrees/sessions/<sessionUuid>/current`, and discovers
newly merged PRs from the old-to-new base range. The Git Sync card reads the
persisted sync envelope and shows the upstream head SHA, whether upstream
moved, newly discovered merged-PR count, and compact upstream-current and
session-current paths; after completion the action is labeled `Resync` while
remaining locked under the same active-operation/process/claim rules. The sync
envelope also carries a local PR-index debt snapshot, so the next card can show
agent-indexing debt even when upstream did not move. `POST
/api/project-session/preparing/pr-index` runs PR indexing for newly merged and
missing local PR records and refreshes knowledge; its card separates the
git-discovered PR count from merged PRs that still need agent postmortems and
knowledge indexing. `POST
/api/project-session/preparing/baseline` resets and reports the baseline from
the canonical upstream-current worktree. Start Run initializes the run from the
session current worktree with the selected worker config, marks preparing
complete, advances the canonical session to running, starts the managed worker
process, and opens the Run page. If the project-session endpoint returns an
active-session conflict, the UI opens the returned active session and surfaces
the gate message instead of treating the conflict as a successful new session.

The server coordinator for this path is
`apps/server/src/core/session-runtime/phases/preparing/runtime.ts`. Focused
subphase modules under `phases/preparing/subphases/` own Git intake,
PR indexing, knowledge refresh, and baseline/report steps so each trace child
maps to a clear implementation unit. Git intake is limited to upstream fetch,
canonical worktree setup, and merged-PR discovery. It does not rebase PR
branches or the control checkout in the New Session prepare path. PR indexing
owns both fetched merged PR postmortems and missing PR record sync. The past-PR
wrapper commands accept and forward the Agent Kernel database URL through to
`build_pr_postmortems.py` when PI-backed postmortem indexing is enabled.

## Session Prepare

The Sessions > Prepare page is the setup page for a concrete project session.
It renders setup cards for the session id, setup status, baseline, and branch,
then shows left-to-right gates for Git Sync, PR Intake, Baseline, and Worker
Config. Git Sync is limited to upstream fetch, canonical upstream-current and
session-current worktree setup, and merged-PR discovery. The frontend model
accepts canonical sync fields (`upstreamWorktreePath`,
`sessionCurrentWorktreePath`) and legacy compatibility fields
(`mainWorktreePath`, `sessionWorktreePath`) so older active sessions still show
useful paths. PR Intake runs postmortem/missing-record indexing and knowledge
refresh, and the card uses the persisted PR-index debt snapshot for merged PRs
that still need agent indexing. The git-discovered count remains visible as a
separate signal. Baseline resets and reports from the canonical upstream-current
worktree. Worker Config edits the run size, epoch size, and worker-slot target before
Start Run initializes the run from the session current worktree and starts the
managed process. Future worker
worktrees belong under `sessions/<sessionUuid>/epochs/<epoch>/workers/<id>/source`
so each epoch owns the source trees, logs, artifacts, and integration evidence
it spawned. Preparation buttons are locked while workers are live, target claims
are active, or another operation owns the dashboard operation slot. Handoff
packaging controls stay in PR Queue.

## PR Queue Handoff Controls

The PR Queue handoff section is the UI-facing sequence for stopping autonomous
worker scheduling, keeping the current run durable, running final QA, and
producing reviewer-sized PR plan artifacts.

| UI Action | Endpoint | Behavior |
| --- | --- | --- |
| `Drain Workers` | `POST /api/pr/pause` | Drains the managed process and marks the run `paused`. Worker and trigger commands reject non-active runs, so no new worker edits can be introduced until the run is resumed. |
| `Resume Run` | `POST /api/pr/resume` | Marks the run `active` again so scheduling can continue. |
| `Checkpoint` | `POST /api/run/checkpoint` | Calls `createRunCheckpoint` for the current run and writes `checkpoint.json`, `pr_candidates.md` (match and improvement lanes), and `carry_forward.md`. |
| `Run QA` | `POST /api/pr/qa` | Runs `regression-check --require-pr-promotion` by default (plus the project's improvement byte floor as `--promotion-min-unmatched-improvement-bytes`) and returns the generated summary/report artifact paths even when the gate fails. |
| `Resolve QA Repair` | `POST /api/pr/qa-repair` | Runs the QA repair resolver runtime over queued QA repair items. The server maps optional `qaRepairItemId` to `qa-repair --item-id` and defaults to `--run-agents`, so the same path can resolve one item or the current repair batch. |
| `Reconcile` | `POST /api/pr/reconcile` | Runs the reconcile agent in `ship-validate` mode against the latest QA summary to fix regressions before handoff. Rejected while the run is `active`. |
| `Plan PRs` | `POST /api/pr/split-plan` | Runs `pr-split-plan` with the latest checkpoint for lane splitting, the project's PR split strategy, and writes a Markdown plan plus `summary.json` under the handoff artifact directory. |
| `Prepare Handoff` | `POST /api/pr/prepare` | Runs the full ship pipeline: drain workers -> fetch upstream and index merged PR knowledge -> rebuild production baseline (worktree at the base SHA, cached per SHA) -> QA vs the new baseline -> checkpoint (regressed symbols forced to `needs_rework`) -> lane-aware split plan. Stops with the QA hint as the error if the gate fails; the checkpoint still lands. Any carry-forward branch rebase is an explicit handoff/repair action rather than implicit New Session setup. |

Checkpoint, QA, QA repair, split planning, and Prepare Handoff refuse to run
while a worker process is alive (server-side `assertHandoffIdle`); the
dashboard disables the matching buttons until workers are stopped and active
target claims are closed. Drain Workers and Resume Run stay available because
they move the run between active worker scheduling and handoff review.

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

PR mode also reads `dashboard.prs`, a compatibility PR ledger from
`state_dir/pr_handoff/pr_records.json`. The server normalizes legacy rows with
session/run provenance plus additive `local`, `validation`, `batch`, and
`github` subobjects. `POST /api/prs/sync` seeds the ledger from the current
split plan, imports existing GitHub PRs whose heads match the local split-series
branches, and discovers local `codex/split-##-*` branches/worktrees so local
PRs appear before publication. Planned rows can be prepared locally before
publication: `POST /api/prs/prepare-local` prepares one slice in a persistent
worktree under `state_dir/pr_workspaces/<run_id>/`, while locally discovered
worktrees are tracked in place, and
`POST /api/prs/prepare-local-batch` prepares the next three unprepared slices.
`POST /api/prs/open-batch` opens the next three local-ready slices as GitHub
drafts by generating a patch from each persistent worktree's committed diff,
re-verifying it, and pushing the local branch. `POST /api/prs/open-all` remains
as the legacy all-planned path.

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
| PR ledger | `state_dir/pr_handoff/pr_records.json` |
| Local PR worktrees | `state_dir/pr_workspaces/<run_id>/<branch-slug>/` |
| Local PR publish patches | `state_dir/pr_handoff/local_patches/<branch-slug>.patch` |

## Related

- [Server jobs overview](../20-server-jobs/00-overview.md)
- [State implementation](../40-state/00-overview.md)
- [Score integration and PR handoff](../../10-system-design/60-score-and-pr-handoff.md)
