# Slice 3 — Conflict-Safe Sync (implementation spec)

Authority: docs/40-new-features/20-project-state-and-events/50-sync (render via
`bun packages/docs-framework/packages/docs-cli/src/index.ts render <bundle>`),
plus 60-knowledge (source classification), 20-project-session
(remote_application timeline rules), 30-run (runs survive sync), 70-events.
Slices 1-2 conventions and primitives are in force: core/project-state
(lease, queued requests, drain handoff, STALE_DISPATCH_LEASE_MS),
core/orchestrator-state/run-envelope-cas.ts, core/project-session/timeline.ts
(remote_application schema exists, writer lands HERE), storage/migrations
runner. Contract wins over this spec — stop and report disagreements.

Ground rules unchanged: tracing through everything; one event per accepted
transition same-tx; no automation the contract does not specify (sync is
OPERATOR-INITIATED — observation may record a request, nothing starts
without the operator); loud failure; no timers; never git
checkout/stash/restore in the shared worktree (staging workspaces are
separate worktrees the sync engine owns); never touch
.decomp-orchestrator-state or projects/ (coordinator runs live migrations).

Existing sync landscape: phases/preparing/subphases/git-intake.ts
(syncProjectGitAndFindMergedPrs, merged-PR discovery), preparing/runtime.ts
syncProjectIntake (~L1530+, operator-triggered, currently drains the run via
slice-1/2 handoff), upstream-current detached worktree
(preparing/subphases/worktrees.ts), campaign-status.ts freshness math.
NOTE: phases/pr/pr-sync.ts is GitHub PR-record sync — unrelated, do not touch.

## Deliverable S1 — SyncState machine

- Table sync_state (migration 011, idempotent): envelope columns (sync_id PK,
  project_id, session_uuid, revision, status, trace_id, caused_by_event_id,
  blockers_json, created_at, updated_at, latest_event_sequence) + intake_json
  (upstream_from, upstream_to, merged_pr_ids, corpus_batch_ids,
  knowledge_only), staging_json (workspace_id, epochs_total, epochs_applied,
  minor_conflicts_resolved, conflicts_awaiting_operator), pr_reconciliation_json
  (per open PR series: series id/branch, result clean|auto_resolved|
  needs_operator, pushed), publication_json (remote_application_id, prior_head,
  new_head, knowledge_revision, invalidated_ids) — null until publish.
- Status vocabulary exactly per contract: requested | ingesting | reconciling |
  validating | validated | publishing | published | blocked | cancelled.
  Terminal: published, cancelled. blocked keeps the lease and staging.
- Module core/session-runtime/phases/sync/ (new phase area): state machine
  through a CAS primitive (one event per accepted transition, same tx —
  reuse the run-envelope-cas pattern generalized or a sibling sync CAS).
- Events: sync.requested (observation records upstream movement/corpora —
  state only, no lease), sync.reconciliation_blocked, sync.recovered,
  sync.cancelled, sync.boundary_published, plus status-transition events per
  the one-event rule. knowledge.job_enqueued / knowledge.revision_advanced
  for the knowledge stages.
- At most one non-terminal sync per project (partial unique index).

## Deliverable S2 — staged reconciliation engine

- Staging workspace: an isolated git worktree under the state dir (e.g.
  <stateDir>/sync_staging/<sync_id>/) created from the current session head;
  the session worktree and head are NEVER mutated pre-publish.
- Reconciliation (status reconciling): fetch upstream, identify the complete
  change set (reuse git-intake discovery), rebase the session history —
  through its completed epoch integration commits — onto the new upstream
  revision INSIDE staging. Minor mechanical conflicts auto-resolve (rerere/
  trivial three-way; count minor_conflicts_resolved). Conflicts beyond that:
  route through the existing integration-resolver agent machinery IF it is
  directly reusable under the sync lease; otherwise (or when the agent is
  not confident) the sync blocks: status blocked, blocker
  conflict_needs_operator naming the conflicting paths, event
  sync.reconciliation_blocked. sync.resolve_conflict (operator action) marks
  the operator's resolution recorded in staging and returns blocked →
  reconciling.
- Open PR series branches (from pr_records/split branches — the PrCampaign
  object arrives in slice 4; read what exists today) rebase alongside in
  staging; per-series result recorded in pr_reconciliation_json; pushes
  STAGED, not executed, until publish.
- Validation (validating): revalidate the reconciled staging state without
  rebuilding everything — reuse the existing gate/report validation the
  repo already runs for baselines where directly reusable; record validation
  evidence in staging_json. Then status validated: sync RESTS — no
  automatic publish, upstream movement after validation surfaces as a
  staleness blocker with re-validation available.
- Cancel (sync.cancel, any pre-publish status): discard the staging worktree,
  emit sync.cancelled (discarded workspace id, untouched session head),
  terminal; the session must be byte-identical to before sync started.
- Crash recovery (sync.recover): resume from the last durable stage or
  discard staging at the operator's choice; sync.recovered records which.

## Deliverable S3 — atomic publish + knowledge pass

- sync.publish (operator, confirm-gated; valid only from validated; staleness
  blocker if upstream moved after validation): one atomic boundary —
  1. fast-forward/point the session worktree and head_revision to the
     reconciled staging result,
  2. write the remote_application timeline entry transactionally with the
     boundary commit (entry exists iff commit exists — the slice-1 rule;
     writer is core/project-session/timeline.ts recordRemoteApplication,
     to be implemented now): prior head, new head, resolved conflicts,
     score delta, referenced by the interrupted run when one exists
     (runs.remote_application_ids per contract — add storage if missing),
  3. advance the canonical upstream revision + knowledge revision,
  4. mark invalidated targets/checkpoints/PR snapshots explicitly
     (invalidated_ids — derive from what the rebase changed; reuse existing
     invalidation concepts where they exist),
  5. push reconciled PR series branches to their upstream PRs,
  6. emit sync.boundary_published and run.remote_applied (when a run exists),
  7. release the sync lease; a paused/draining run may then resume by the
     OPERATOR (no auto-resume).
  Failure anywhere before the durable commit step aborts loudly with staging
  preserved (blocked); after the boundary commit is durable there is no
  abort — remaining steps (pushes) retry idempotently and block loudly on
  persistent failure.
- Knowledge-only pass: when upstream did not move (knowledge_only=true),
  skip reconciliation/rebase entirely; process staged corpora + merged-PR
  evidence into staged knowledge (reuse the existing intake/kg machinery
  invoked by today's syncProjectIntake), advance ONLY the knowledge
  revision, record NO remote_application boundary. Introduce the monotonic
  knowledge revision now: knowledge_revisions table (same migration or 012)
  with monotonic id + digest (supersedes the kg- digest as the canonical
  value; runs keep recording their starting digest), advanced only here and
  by the background worker-evidence materializer if one exists (do not build
  a materializer — only classify; background sink continues as today).
- Knowledge source classification per 60-knowledge: merged upstream PRs and
  staged corpora are sync_stage — their processing happens inside sync only.
  Worker-result evidence stays background as today. No scheduled intake.

## Deliverable S4 — operator flow + hard-lock removal

- sync.start (operator, one click, blocker-gated): valid when the operator
  initiates it — upstream movement or staged corpora may exist but are NOT
  required. If the run holds the lease: the activation performs the explicit
  drain handoff (slice-1/2 machinery: beginDrain on the run with target
  sync; run active→draining→paused; sync acquires on release). The
  hard-lock refusal at preparing/runtime.ts (~L1540 'Sync is hard-locked
  while a run is active') is REMOVED — replaced by the drain path. requested
  → ingesting under the sync lease.
- Rewire today's syncProjectIntake flow into the new sync phase: discovery/
  observation (git-intake) records sync.requested + intake_json WITHOUT the
  lease; the operator's sync.start begins ingesting; the old monolithic
  intake operation's stages map onto ingesting (knowledge staging) →
  reconciling → validating; its boundarySavePoint('sync') call becomes the
  publish-boundary save-point anchor AFTER the remote_application entry.
- The 10-minute campaign-status fetch loop stays observation-only (it may
  refresh sync.requested staleness data; it must not create or advance sync
  workflows beyond recording the request).

## Deliverable S5 — actions, read model, UI

- ActionProjections: sync.start (no confirm), sync.resolve_conflict (no
  confirm), sync.publish (confirm), sync.cancel (confirm), sync.recover
  (confirm) — enabled/blocked per the contract's inventory rows (start
  blocked when another workflow holds the lease or prior staging awaits a
  decision; publish blocked by staleness/missing validation; cancel blocked
  once publish is committing).
- projectState.sync summary: status, intake (upstream from/to, merged PR
  count, corpus batches, knowledge_only), staging progress (epochs applied/
  total, conflicts), pr_reconciliation summary, publication record.
- Frontend: sync card (status, staging progress bar, conflict list with
  resolve action, validated resting state with publish/cancel, staleness
  badge), wired from the server projection only. The run card already shows
  drain state during handoff.

## Deliverable S6 — docs re-point (after S3/S4)

- Re-point the sync narrative in docs/10-system-design/10-intake-and-sessions
  (session-operating-flow's sync/remote-application sections now describe
  the implemented staged workflow) and any other system-design page
  describing the old in-place sync intake. Present-state truth, writingstyle
  compliance, dated decision callouts mirroring contract decisions 1/2/8
  where the pages state them. Render+audit 0/0 both bundles + links check.
- Do NOT touch docs/10-system-design/40-knowledge (Ford's active stream).

## Verification (coordinator)

1. Full server + frontend suites (3 known pre-existing failures excluded).
2. End-to-end staged-sync test walked by me: seeded upstream movement →
   request → start (with active run: drain handoff) → reconcile (one
   auto-resolved + one operator-blocked conflict) → validate → rest at
   validated → publish → remote_application entry + run.remote_applied +
   head advance + staleness of old save points → cancel path on a second
   sync leaves the session byte-identical.
3. Migration dry-run on a fresh copy of the REAL projects/melee/state DB
   (frozen-fixture rule: real DB is the fixture), then live (both dirs).
4. Trace reconstruction: one correlation covers requested → drain → acquire
   → reconcile → blocked → resolved → validated → published with every
   caused_by_event_id resolving.
5. Adversarial review + repair round before the report.
