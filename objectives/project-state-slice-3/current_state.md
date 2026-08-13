<current_state>
<last_updated>2026-08-13</last_updated>

<status>
- Deliverables S1 and S2 are complete and treated as fixed dependencies.
- Deliverable S3 is complete under the operator's five standing rulings and the authorized terminal-event derivation below.
- Deliverable S4 is complete under the operator's ruled `sync.start` drain-handoff semantics.
- Deliverable S5 is complete: server read model/action projections, projection-only workspace sync card, action wiring, and focused verification all pass.
- Adversarial-review findings 1, 2, and 10 are repaired: control/session/staging roots are distinct, raw publishing is recoverable from a durable intent, and publication/cancel/compensation cover recursive submodules.
- Review findings 4, 5, 6, 7, 8, 9, and 11 are repaired and pass the explicit server/frontend verification cluster. No schema or migration change was required.
- Deliverable S6 remains out of scope and no documentation bundle was edited.
</status>

<completed>
- Read the full slice specification and rendered the sync, project-session, run, knowledge, and events contracts.
- Amended S1 mechanically: `sync.boundary_published` records the durable `publishing -> publishing` boundary and distinct `sync.published` owns the final `publishing -> published` CAS. The state primitive independently requires durable pushed records for every reconciled PR series.
- Amended S2 only to retain exact session and PR-series auto-resolved paths in durable staging state.
- Added migration 012 with revision-CAS push records, upstream anchors, explicit invalidations, monotonic knowledge revisions, sync-owned knowledge jobs, and run `remote_application_ids_json` linkage. Fresh/idempotent/partial migration coverage passes; repeated content-stable knowledge revisions are allowed.
- Implemented `recordRemoteApplicationInTransaction` and its wrapper. The boundary event, session timeline/head CAS, active-run `run.remote_applied` CAS/linkage, prior-save-point staleness, knowledge revision, upstream anchor, invalidations, and pending push records commit atomically.
- Implemented confirm-gated publication with final upstream recheck, non-fast-forward session repoint, safe compensation only from the exact clean published head, durable-boundary-first semantics, event-backed idempotent force-with-lease PR pushes, post-boundary retry without staging, final lease release, and no run auto-resume.
- Implemented sync-owned staged knowledge adapters with deterministic artifacts/manifests, durable job revision CAS and one same-transaction event per status transition, loud failure/blocking, cancel/discard cleanup, ingest recovery (including succeeded-artifact requeue after manifest/artifact failure), transactional knowledge revision publication, and a knowledge-only pass that changes no source/session/run/upstream-anchor state.
- Added real-git and transactional tests for success, staleness, dirty-worktree preservation, compensation, push retry with missing staging, knowledge-only publication, source-moving/knowledge-only knowledge recovery, all-succeeded manifest recovery, missing-artifact recovery, save-point staleness, durable invalidation identities, forged push rejection, trace/causation reconstruction, CAS rollback, and migration invariants.
- Adversarial review found and repaired unsafe compensation, staging-dependent post-boundary retry, forged pushed flags, stuck knowledge failures, missing save-point staleness, source-moving ingest recovery, and post-success manifest/artifact recovery. The final re-review found no remaining blocker/high S3 defect.
- Verification: 62 tests passed across seven touched files with 476 assertions; `bunx tsc --noEmit -p apps/server/tsconfig.json` and `git diff --check` pass.
- Added the S4 sync runtime and local command ActionDecision projection. A free lease acquires sync authority and advances `requested -> ingesting`; a run-held lease returns enabled-with-consequence, queues the real sync id, and invokes the existing run pause/drain handoff without advancing sync early.
- Added the settlement activation hook: run release atomically promotes the queued sync lease and records exactly one `sync.ingesting` transition before the run records `paused`. The babysit supervisor continues the already-authorized sync phase after settlement; observation remains request-only and no timer starts work.
- Rewired staged merged-PR/corpus processing into the sync-owned ingest/reconcile/validate runtime, retained blocked/validated sync authority, and moved the `boundarySavePoint('sync')` anchor after successful publication and its durable remote-application entry.
- Added API command routes and blocker/confirmation decisions for `sync.start`, `sync.resolve_conflict`, `sync.publish`, `sync.cancel`, and `sync.recover`, retaining `/api/project/sync` as a compatibility alias for operator start. Cancel/discard atomically release sync authority; queued cancellation clears its handoff without releasing the draining run.
- Removed the preparing-runtime hard lock and monolithic `syncProjectIntake`; removed the PR-handoff `syncMergedPrIntakeForPrepare` second intake route. The campaign-status observation loop was not changed.
- Added regression coverage for free-lease activation, enabled queued drain handoff, acquire-then-ingest event order, prior staged-sync blocking, queued cancellation, action routes, and the removed legacy paths. Verification: 91 tests passed across ten focused files with 551 assertions; `bunx tsc --noEmit -p apps/server/tsconfig.json` and `git diff --check` pass.
- Added `projectState.sync` to the dashboard read model with intake counts/batches, staging epoch/conflict progress, PR reconciliation counts, publish preview, durable publication record, and staleness/re-validation metadata. The latest terminal sync remains visible after publish.
- Added all five sync ActionProjections to `available_actions` by calling the S4 `projectSyncAction` decision function directly, preserving route/read-model parity for drain consequences, blockers, and confirmation requirements.
- Replaced the Overview page's legacy client-gated Sync button with a projection-only sync card. It renders staging progress, one server-gated action per conflict path, validated publish/cancel controls with consequence-specific confirmations, proactive staleness, crash recovery, and the post-publish record.
- Added frontend action/endpoint constants and central dispatcher wiring for start, resolve, publish, cancel, recover, and the stale-candidate cancel/new-sync path. Synthetic `sync:new:<project>` projection subjects are not sent as durable sync IDs.
- S5 verification: 19 server tests and 15 frontend tests pass (182 assertions total); server TypeScript, `ui:check`, `ui:build`, and `git diff --check` pass. The UI build reports only the existing runtime-font resolution and chunk-size warnings.
- Finding 1 repair keeps the descriptor `repoRoot` as the control checkout and resolves `sessionWorktreePath` from the owning durable `ProjectSession`, using its persisted preparation path or the centralized `(projectDir, session_uuid)/worktrees/sessions/<session_uuid>/current` convention. Engine session inspection/validation/cancel and publication repoint/timeline/save-point paths now require that session root; the babysit handoff re-resolves the control descriptor.
- Added a real-git runtime end-to-end fixture with distinct control, session, and sync-staging worktrees. Reconciliation and validation stay in staging, publication/save-point advance the session only, control remains at its own HEAD, and a second cancel preserves the session snapshot byte-for-byte.
- Finding 2 repair adds migration 013 `sync_publication_intents`. The exact prior/new heads, session path, serialized boundary plan, and recursive prior/target worktree states commit in the same transaction as `validated -> publishing`, before Git mutation. The boundary event id joins that intent in the atomic boundary transaction; final publication deletes it in the same transaction as `sync.published` and lease release.
- Publication is split into durable seams for prepare, recursive repoint, boundary commit, push start, and reconciliation. A fresh store with no boundary compensates idempotently and records `publishing -> blocked`; a fresh store with the boundary resumes durable pushes/finalization. Startup and operator recovery invoke the same reconciler, and a missing legacy intent blocks loudly without mutating Git.
- Kill-point coverage reopens SQLite from disk after the publishing CAS, after repoint, after a forced boundary transaction rollback, after a deliberately half-completed recursive compensation, after boundary commit, and after the remote accepted a push while its durable row remained `pushing`. These tests do not depend on the caught exception path.
- Finding 10 repair captures initialized recursive gitlink/checkout heads and per-repository cleanliness, initializes/validates staging submodules, fetches target submodule objects without checking out the session early, repoints with `reset --hard --recurse-submodules`, and compensates parent-first one repository at a time so a process death between steps is resumable. Cancel/discard recovery events include sorted recursive submodule pointers.
- Repair verification: 79 tests passed across explicit touched paths with 585 assertions, including all 12 publication tests split into bounded explicit invocations; `bunx tsc --noEmit -p apps/server/tsconfig.json` and `git diff --check` pass.
- Finding 4 now projects observed-versus-validated upstream server-side, refreshes the durable observation from the production dashboard observation path, and blocks stale `resume`/adoption. Both ordinary upstream movement and return to the original anchor persist a cancellable blocker; the UI maps the former re-validation affordance to cancel/new-sync so the old candidate cannot loop through validation.
- Finding 5 now records the latest published `knowledge-N` in new run inputs with the existing `kg-<digest>` fallback and activates sync-stage artifacts through the revision row committed at publication. The canonical sync knowledge read/query APIs exported by the sync phase select and verify that latest committed revision; publish-to-createRun and publish-to-query coverage pass.
- Findings 6 and 11 now fence every start/post-request SyncState mutation on the matching active sync lease. Confirmed-orphan ingest recovery owns the three-valued process-liveness plus stale-lease check and performs knowledge-job requeue plus the safe-stage CAS in one transaction; the public blocked-sync job helper cannot bypass that evidence gate. Recovery coverage closes and reopens the real temporary store.
- Findings 7 and 8 now select PR series solely from non-terminal durable PR records, exclude lingering terminal split branches, parse rename/copy `--name-status -z` records with both old/new paths, and invalidate active `epoch_targets` alongside legacy targets.
- Finding 9 now has one idempotent publication-finalization anchor keyed by `remote_application_id`, always bound to `publication.new_head`, shared by initial/recovered completion, and committed before `sync.published` and lease release. Final verification: 82 server tests passed with 570 assertions across explicit paths; 13 frontend tests passed with 71 assertions; server TypeScript and `ui:check` pass.
</completed>

<standing_rulings>
- Ruling 1: publication may non-fast-forward repoint the session worktree/head to rebased staging history, with compensation restoring the prior worktree/head if the durable boundary transaction fails.
- Ruling 2: the durable boundary remains `publishing`; push attempts/results are durable and idempotent during `publishing`; only successful completion advances to `published`, now through `sync.published`.
- Ruling 3: migration 012 owns durable push records, the canonical upstream anchor, explicit invalidations, monotonic knowledge revisions, and run-to-remote-application linkage.
- Ruling 4: sync owns staged knowledge by adapting the existing merged-PR/corpus intake machinery; a knowledge-only pass advances knowledge without a remote-application boundary.
- Ruling 5: amend S2 only as needed to retain exact auto-resolved conflict paths in staging state.
</standing_rulings>

<in_progress>
- No repair-cluster implementation remains in progress. Findings 1/2/10 and repairs P/Q remain landed dependencies.
</in_progress>

<next_actions>
- Coordinator-only broader suites and any live/frozen real-project migration remain separate; this repair will not write `.decomp-orchestrator-state` or `projects/`.
- Deliverable S6 remains a separate documentation pass.
</next_actions>

<risks_or_open_questions>
- The worktree still contains unrelated in-progress knowledge, agent, docs, and project changes; S4 preserved them.
- Sync/publication files remain part of the larger uncommitted slice-3 worktree; this repair preserved unrelated changes. The concurrent unregistered `0XX-pr-campaign` placeholder remains untouched; migration 013 is registered, so that future placeholder must choose the then-next migration number when coordinated.
- No implementation conflict remains. The run-held authority row is applied through the contract's queued ActionDecision semantics: enabled with the consequence `requested -> ingesting after run drains`, never early ingest or observation-triggered drain.
- The two remaining `syncProjectIntake` strings are inert kernel-adapter test fixture operation names; no production symbol or route reaches the removed monolith.
- S5 found no unmerged paths and did not modify S1-S4 sync core, migrations, live state, or documentation. The server's aggregate conflict command remains one action rendered beside each durable conflict path.
- Header-dependency expansion for finding 8 remains a TODO blocker: no reusable dependency/include map exists in current server code, so this repair did not build the prohibited new dependency analyzer.
- This repair made no schema change, added no migration module, touched no storage/migration file, ran no repository git operation, and found no ownership conflict.
</risks_or_open_questions>

<important_paths>
- objectives/project-state-slice-3/spec.md
- objectives/project-state-slice-3/current_state.md
- apps/server/src/core/project-session/timeline.ts
- apps/server/src/core/session-runtime/phases/sync/publication.ts
- apps/server/src/core/session-runtime/phases/sync/engine.ts
- apps/server/src/core/session-runtime/phases/sync/state.ts
- apps/server/src/core/session-runtime/phases/sync/git.ts
- apps/server/src/core/session-runtime/phases/sync/knowledge.ts
- apps/server/src/core/session-runtime/phases/sync/runtime.ts
- apps/server/src/core/session-runtime/run-state/runs.ts
- apps/server/src/core/orchestrator-state/storage/migrations/013-sync-publication-intents.ts
- apps/server/src/core/session-runtime/phases/sync/activation.ts
- apps/server/src/api/routes/sync.ts
- apps/server/src/application/dashboard/read-model.ts
- apps/server/src/core/session-runtime/phases/running/run-control.ts
- apps/server/src/core/orchestrator-state/storage/migrations/012-sync-publication.ts
- apps/frontend/src/pages/workspace/overview/SyncStateCard.tsx
- apps/frontend/src/components/app/_lib/projectedSyncControls.ts
</important_paths>
</current_state>
