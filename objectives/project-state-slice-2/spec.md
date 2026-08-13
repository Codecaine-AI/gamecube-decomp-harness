# Slice 2 — Run State (implementation spec)

Authority: docs/40-new-features/20-project-state-and-events/30-run (render with
`bun packages/docs-framework/packages/docs-cli/src/index.ts render <bundle-dir>`),
plus 10-authority-and-actions (action inventory) and 70-events (event rules).
Slice 1 conventions are in force and their code is the pattern to reuse:
objectives/project-state-slice-1/spec.md, core/project-state/ (CAS + one event
per accepted transition in the same tx), core/project-session/timeline.ts,
storage/migrations/ (runner + rebuildTable helper). Where spec and contract
disagree, the contract wins — stop and report.

Ground rules unchanged from slice 1: tracing through everything; no automation
the contract does not specify; loud failure; no timers; never git
checkout/stash/restore; never touch .decomp-orchestrator-state or projects/
(live migrations are run by the coordinator, not by build tasks).

## Deliverable R1 — the run_id rename (migration 005)

Seven tables carry a `session_id` column that actually holds a RUN id:
epochs, epoch_targets, target_claims, worker_state, worker_checkpoints,
write_set_widenings, worker_output_integrations (see
run-state/status.ts which binds run.id to session_id for all seven).

- Migration 005 rebuilds each table with the column renamed to run_id
  (rebuildTable helper; preserve all data, indexes, and uniques; keep
  column order otherwise). Idempotent like 002-004.
- Update ddl.ts legacy CREATE TABLE statements, schema.ts Drizzle mirrors,
  and every query/type that says sessionId/session_id in run-scoped code
  (run-state/, phases/running/, phases/pr/ where it leaks). The TS field
  becomes runId. No compatibility aliases — this is the cutover; the
  compiler finds the call sites.
- The REAL session uuid lives in project_sessions.session_uuid and
  session_timeline_entries.session_uuid — do not touch those.
- Tests: migration converges on a legacy-shape DB with data in all seven
  tables; a spot query per table proves data survived; full existing
  run-state test suite passes after the cutover.

## Deliverable R2 — RunState contract shape and transitions

- runs table (same migration or 006): add envelope columns revision INTEGER
  NOT NULL DEFAULT 0, trace_id TEXT, caused_by_event_id TEXT, blockers_json
  TEXT NOT NULL DEFAULT '[]'; add head_revision TEXT (mirror of the owning
  session head), session_uuid TEXT (owning session container — populate for
  the active session's runs where derivable via project_sessions.active_run_id,
  else NULL), inputs_json TEXT (RunInputs snapshot: base_revision,
  policy_revision, starting_knowledge_revision, configuration_snapshot —
  base_revision immutable after activation), stop_request_json TEXT,
  terminal_reason TEXT, scheduler_condition TEXT.
- Status vocabulary cutover in shared/types/run.ts and everywhere consumed:
  "draft" | "ready" | "active" | "draining" | "paused" | "completed" |
  "failed" | "cancelled". Migration maps legacy values: active→active,
  paused→paused, failed→failed, complete→completed. New runs start draft/ready
  per the creation flow; existing creation paths that go straight to active
  must pass through ready (gates validated) in the same command.
- New module core/run-state-machine/ (or extend run-state/runs.ts — follow
  the codebase's grain): every accepted run transition goes through a CAS
  primitive (revision compare, exactly one project event same-tx,
  caused_by_event_id). Status tables double as the transition catalog; the
  run's dispatch-lease interaction stays in core/project-state (active run
  holds the lease; draining run stops admission — already wired in slice 1).
- scheduler_condition ("idle"|"planning"|"dispatching"|"waiting"|"boundary"|
  "blocked") written by the scheduler loop at its existing decision points —
  a mirror for observability, not a new control mechanism; condition changes
  are NOT accepted transitions and emit no events (contract puts them in
  RunScheduling state, not the status enum).

## Deliverable R3 — in-place recovery + integration crash-window closure

- run.recover operation (operator action, confirm-gated): valid when the run
  is failed or its lease is stale; settles or cancels orphaned claims and
  operations (reuse recoverActiveClaims as the worker sub-lease layer), emits
  run.recovered with recovery_reason + cancelled claim ids + cancelled
  operation ids + resulting status, moves failed → paused on the SAME run id.
  Only completed and cancelled are terminal. recoverDispatch integration:
  when the run held a stale lease, break it in the same operation (reuse
  core/project-state recoverDispatch).
- run.hard_stop (confirm): active/draining → recover-or-cancel in-flight
  work → paused. run.cancel (confirm): paused/failed → cancelled (terminal,
  blocked by unsettled claims). run.pause/resume: as wired in slice 1 via
  drain; ensure they emit their transition events through the new primitive.
- Carried finding 2 (slice 1 review): epoch integration currently commits to
  git early and records lineage in SQLite later; a crash between leaves a
  commit without lineage. Fix with a durable prepare/finalize protocol:
  before the git integration commit, write a pending_integrations row
  (epoch id, run id, expected commit info, created_at) in its own tx; the
  epoch-close tx that records epoch_completed also deletes the pending row.
  On process start (and run.recover), reconcile: pending row with an
  existing commit → complete the lineage transactionally (epoch_completed +
  run.epoch_integrated, same rules as live); pending row whose commit never
  landed → delete the row and emit the failure path loudly (epoch boundary
  failed). Startup reconciliation runs where recover-claims already runs on
  restart (process-control/runtime.ts) — an existing hook, not a new timer.

## Deliverable R4 — actions, read model, UI

- Action inventory rows (10-authority-and-actions): run.start, run.pause,
  run.resume (no confirm, blocker-gated), run.hard_stop, run.cancel,
  run.recover (confirm). Server-side ActionProjection entries in the
  projectState read-model block with enabled/blocked_by/expected_transition/
  confirmation_required, wired through the existing command routes.
- projectState.run summary: status, scheduler_condition, active epoch,
  admitted/claimed/running counts, progress (baseline/confirmed score,
  tentative/confirmed/regressed changes) — derive from existing queries
  (status.ts) rather than new bookkeeping.
- Frontend: run card renders the new summary + the six actions with the
  confirm tiers; recovery point prominent in history (the contract requires
  recovery not blend into normal history — a visible run.recovered marker in
  the timeline/run view).

## Deliverable R5 — docs re-point (after R2/R3 land)

- docs/10-system-design/20-running (director loop page especially) and the
  run-related parts of docs/10-system-design/03-state-and-events: present-state
  truth for the RunState shape, the eight-status vocabulary, scheduler
  conditions, drain-based pause, in-place recovery, and the
  pending-integration reconciliation. Follow writingstyle.md (Design
  Narrative, join test, dated decision-record callouts mirroring the
  contract's run decisions). Validate render+audit 0/0 + links check.

## Verification (coordinator runs before gate)

1. Full server + frontend suites (known pre-existing failures excluded:
   agent-kernel-boundaries, 2× pr-preship-review).
2. Migration dry-run on a copy of projects/melee/state, then live (both dirs).
   The legacy status mapping must show in the copy (complete→completed).
3. Trace demo extended: reconstruction covers failed → recover → paused →
   resume with run.recovered naming cancelled subjects.
4. Adversarial review pass over the slice diff before repairs/gate.
