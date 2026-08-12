# Slice 1 — Session Container + Dispatch Lease (implementation spec)

Authority: docs/40-new-features/20-project-state-and-events (render with
`bun packages/docs-framework/packages/docs-cli/src/index.ts render <bundle-dir>`).
Read pages 10-authority-and-actions, 20-project-session, 70-events before coding.
This spec maps that contract onto the existing code. Where this spec and the
contract disagree, the contract wins — stop and report, do not improvise.

Ground rules (from Ford, non-negotiable):
- No automation the contract does not specify. Manual operator control bias.
- Tracing through everything: every durable object carries trace_id; every
  accepted revision has caused_by_event_id; every event carries
  correlation_id, causation_id, trace_id, span_id, actor.
- One event per accepted transition, written in the SAME transaction as the
  state change.
- Never run git checkout/stash/restore in the shared worktree.
- Out of scope: Daytona/sandbox runtime, sync behavior change (the hard-lock
  at phases/preparing/runtime.ts:~1546 stays; it now ALSO requires the lease),
  PR campaign objects, renaming epochs.session_id, full ProjectStateView.

## Existing landscape (verified)

- SQLite store: apps/server/src/core/orchestrator-state/storage/
  (store.ts openState/immediateTransaction/withBusyRetry, ddl.ts executed DDL,
  schema.ts Drizzle mirror — keep both in sync). No migration system beyond
  additive ensureColumn.
- Live DB: .decomp-orchestrator-state/orchestrator.sqlite (backed up; safe to
  migrate).
- project_sessions table (ddl.ts ~L396): one row per session,
  session_uuid, active_run_id, base_ref/base_sha, four phase JSON blobs,
  process_state_json, kernel_trace_json; partial unique index = one
  active/blocked session per project.
- Run-scoped events table (ddl.ts ~L268) is a scheduler WORK QUEUE — leave it
  alone.
- Save points: phases/pr/state/save-points.ts (save_points table, campaigns
  singleton), phases/pr/save-points-runtime.ts boundarySavePoint returns null
  on failure (silent) — ~10 call sites in preparing/runtime.ts and pr/runtime.ts;
  epoch variant in phases/running/epochs/cycle.ts (~L887-977).
- Existing blocker plumbing: core/project-session/state.ts
  (ProjectSessionBlocker, projectSessionGates).

## Deliverable 1 — migration system

apps/server/src/core/orchestrator-state/storage/migrations/
- schema_migrations table: version INTEGER PK, name TEXT NOT NULL,
  applied_at TEXT NOT NULL.
- Numbered migration modules 001-*.ts…, each { version, name, up(db) };
  runner applies in order inside immediateTransaction, records row per
  migration. Version 001 = baseline marker (records that legacy ensureSchema
  DDL is present; no-op on schema).
- ensureSchema keeps running the legacy CREATE IF NOT EXISTS first, then the
  runner. Provide a rebuildTable(db, name, newDdl, copySql) helper for future
  table rewrites (slice 2 needs it).
- Tests: fresh DB path and legacy-DB path (create a DB with legacy ensureSchema
  only, then open with migrations; both converge).

## Deliverable 2 — project event log

New table project_events (migration 002):
- sequence INTEGER PRIMARY KEY AUTOINCREMENT  (monotonic project-local order;
  one project per state dir)
- event_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1, project_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL, causation_id TEXT NOT NULL,
  trace_id TEXT NOT NULL, span_id TEXT NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN
    ('operator','runner','agent','guardian','external_observer')),
  occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}'
- Indexes: (subject_kind, subject_id, sequence), (event_type, sequence),
  (correlation_id, sequence).

Module apps/server/src/core/project-state/events.ts:
- appendProjectEvent(db, envelope) — called INSIDE the caller's transaction;
  returns {eventId, sequence}.
- listProjectEvents / eventsForSubject / latestSequence read API.
- Event ids: `event-` + monotonic-safe unique suffix (crypto random is fine).

## Deliverable 3 — ProjectState + dispatch lease

New table project_state (migration 003), ONE row per project:
- project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
  active_workflow_json TEXT NULL, blockers_json TEXT NOT NULL DEFAULT '[]',
  trace_id TEXT NOT NULL, caused_by_event_id TEXT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL.
- active_workflow_json (the dispatch lease, canonical here):
  { kind: 'run'|'pr'|'sync', workflow_id, lease_id,
    status: 'acquiring'|'active'|'draining'|'blocked'|'releasing',
    acquired_at, heartbeat_at, requested_handoff?: {target_kind,
    target_workflow_id, reason, requested_at}, blockers: Blocker[] }
- Slot mirrors (session/run/pr/sync) are NOT stored — they are computed in the
  read projection from canonical objects. Only the lease is canonical here.

Module apps/server/src/core/project-state/ (index.ts, lease.ts, types.ts):
- requestDispatch(store, {kind, workflowId, reason, commandId, actor}) →
  acquire immediately when the lease is free (mint lease_id =
  'lease-'+random hex, status 'acquiring'→'active'); when occupied, QUEUE the
  request durably (contract: "Queue a workflow for the dispatch lease, or
  acquire immediately when the lease is free"): append {kind, workflow_id,
  reason, requested_at, requested_by} to a new queued_requests_json column on
  project_state (dedupe by kind+workflow_id) and return {queued:true,
  blockedBy: current holder}. project.dispatch_requested is emitted in both
  paths. Queued requests are surfaced state (ProjectStateView
  queued_dispatch_requests) — they NEVER auto-acquire on their own. The one
  contract-specified automatic step: when releaseDispatch completes and the
  lease carries requested_handoff (set by beginDrain), the handoff target
  acquires as part of the release ("queued transition that begins after the
  current owner settles"); its matching queued request is consumed.
- beginDrain(store, {leaseId, targetKind, targetWorkflowId, reason, ...}) →
  status 'draining' + requested_handoff recorded.
- releaseDispatch(store, {leaseId, handoffSnapshotId?}) → 'releasing' → null.
- recoverDispatch(store, {leaseId, recoveryReason, cancelledSubjectIds}) →
  break stale lease. Operator-only.
- checkLease(store, leaseId) / requireLease(store, leaseId) — fencing guard:
  throws typed StaleLeaseError when leaseId ≠ current. Every transition:
  revision++, caused_by_event_id set, ONE event appended in the same tx
  (project.dispatch_requested / _acquired / _drain_started / _blocked /
  _released; recovery uses project.dispatch_released with recovery payload
  plus the cancelled subjects — see contract event table).
- Transitions run inside immediateTransaction with revision compare
  (stale-write protection).

Fencing call sites (slice 1 wiring — replace/augment hasActiveProcess checks):
- Run start path (phases/running process start / process-control runtime):
  acquiring the lease as kind 'run' becomes part of starting; the running
  process holds lease_id; heartbeat_at refreshed on scheduler loop tick
  (piggyback existing loop; no new timers).
- preparing/runtime.ts sync_intake operation entry: must requestDispatch kind
  'sync' + requireLease around its mutation section, releasing on completion.
  Behavior is otherwise unchanged this slice.
- pr/runtime.ts publish/handoff entry points: same pattern, kind 'pr'.
- Worker dispatch (claim creation in run-state/worker-state.ts
  claimNextEpochTarget): add optional leaseId parameter threaded from the
  scheduler; enforce when provided (full enforcement everywhere would touch
  slice-2 surface; thread it where the scheduler already has context).

## Deliverable 4 — session container

Migration 004 on project_sessions: add head_revision TEXT NULL,
trace_id TEXT NULL, closing/closed added to allowed status values (existing
status vocabulary stays otherwise), closed_at TEXT NULL.
- head_revision initialized to base_sha for the active session.

New table session_timeline_entries (same migration):
- id INTEGER PK AUTOINCREMENT, session_uuid TEXT NOT NULL,
  entry_kind TEXT NOT NULL CHECK IN
    ('epoch_completed','remote_application','pr_phase','save_point'),
  entry_id TEXT NOT NULL, occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  caused_by_event_id TEXT NULL,
  UNIQUE(session_uuid, entry_kind, entry_id).

Module: extend apps/server/src/core/project-session/ with timeline.ts:
- recordEpochCompleted(...) — TRANSACTIONAL: written in the same sqlite tx
  that records the epoch integration result, and only after the integration
  commit exists; advances project_sessions.head_revision to the new commit;
  emits run.epoch_integrated. If any step fails, the whole boundary fails
  LOUDLY (throw; no warning-and-continue).
- recordSavePointAnchor(...) — evidence anchor: pins an EXISTING commit,
  never creates one; emits session.save_point_recorded.
- remote_application/pr_phase: schema + types only, writers land in slices 3/4.
- Session open/close: sessions already open via baseline flow (unchanged);
  session.close becomes an explicit command — valid only when lease is null;
  blocked when unshipped work would be orphaned (reuse gates/blocker
  plumbing: unshipped = worktree dirty beyond head or aheadOfBase without a
  named save point); emits session.closed. Confirm gate belongs to the UI
  tier (Deliverable 6), not extra server prompts.

## Deliverable 5 — save points become loud evidence anchors

- boundarySavePoint (phases/pr/save-points-runtime.ts) and the epoch-boundary
  save point in phases/running/epochs/cycle.ts: on failure they must
  (a) write a durable session blocker {code:'save_point_failed', recoverable:
  true, source_kind/source_id} via the project-session blocker plumbing,
  (b) raise a staleness flag readable by the dashboard,
  (c) emit session.save_point_failed (trigger kind, blocker code, staleness),
  and STILL not block the triggering boundary (contract rule).
  Success path additionally writes a save_point timeline entry
  (entry_kind 'save_point') + session.save_point_recorded event.
- Callers: no call-site may treat the failure path as invisible; the ~10
  `await boundarySavePoint(...)` sites keep control flow but the null return
  is replaced by a typed result {ok, savePointId|null, blockerRaised}.
- save_points.committed=false + "nothing to commit" vs "chose not to commit"
  ambiguity: record distinct reason in payload (contract evidence policy).

## Deliverable 6 — read model + UI (scoped)

Server (application/dashboard/read-model.ts): add `projectState` block:
{ revision, active_workflow (lease incl. status/blockers/requested_handoff),
  session: {session_uuid, head_revision, status, latest_save_point,
  save_point_stale: boolean, timeline: last N entries}, latest_event_sequence }.
API: expose session.close and session.save_point commands
(api/project-session/routes.ts routeCommand) with blocker-decision responses.
Frontend (apps/frontend/src/pages/workspace/):
- Authority chip: active workflow kind + lease status + drain/handoff, from
  the server block (NO client-side re-derivation).
- Session card: head_revision, latest save point + staleness badge, timeline
  list (newest first, entry kind labeled).
- Actions: "Record save point" (one click, blocker-gated) and "Close session"
  (confirmation dialog — confirm tier per contract action inventory).
Follow existing frontend patterns (_lib/model.ts types extended, not forked).

## Verification (before Ford sees it)

1. bun test on all touched server modules + new migration tests.
2. Migration runs against a COPY of .decomp-orchestrator-state first, then the
   live dir; integrity_check ok; legacy queries still work (status.ts paths).
3. Trace demo: script that walks project_events for one correlation_id and
   reconstructs: dispatch acquired → epoch integrated → save point → released;
   every revision's caused_by_event_id resolves.
4. bun run check passes at least as well as before slice 1 (pre-existing
   agent-kernel-boundaries failure is known and excluded).
5. Docs: 10-intake-and-sessions re-point (separate task) renders + audits 0/0.
