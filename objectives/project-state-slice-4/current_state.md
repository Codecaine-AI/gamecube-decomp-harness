<current_state>
<last_updated>2026-08-13</last_updated>

<status>
- Deliverables C1 through C5 are implemented and locally verified.
- PR campaigns now expose one server-owned dashboard projection for campaign state, source anchor, status-grouped series, next-batch validation, pending feedback, activation state, and all operator actions.
- The PR workspace renders that projection directly, including per-series upstream links, confirm-gated batch publication, feedback work, activation/release, terminal controls, recovery, and legacy adoption.
</status>

<completed>
- Confirmed the exact campaign, series, and work-item status vocabularies.
- Confirmed one event per accepted transition and per-series event subjects correlated under the campaign.
- Finalized and registered migration `apps/server/src/core/orchestrator-state/storage/migrations/014-pr-campaign.ts`.
- Added the three-table migration, campaign/series/work-item state machines, stable named-save-point open gate, background-safe feedback ingestion, observation transitions, and the `pr.*` event vocabulary.
- Added `pr.activate` free acquisition plus the standard run queue/drain handoff; run settlement activates the promoted durable campaign lease atomically.
- Added `pr.release` fixer-settlement gates and paired acquire/release `pr_phase` rows in `campaign/timeline-writer.ts`, reusing the campaign transition event in the same transaction.
- Added confirm-gated `pr.publish_batch`, validation/source-anchor and sync-invalidation gates, persistent campaign-lease reuse of the existing PR push/`gh` machinery, per-series PR-number persistence, and `pr.batch_published`.
- Added explicit `pr.adopt_legacy` for `pr_records.json` plus `codex/split-*` branches, with observed status mapping, deterministic identities, evidence preservation, and repeat-safe skips.
- Added campaign operator API routes and focused fixtures covering free/drained activation, timeline rollback durability, temporary bare-remote publication, blockers, real-shape adoption idempotency, and legacy publication compatibility.
- Validation: 110 focused tests passed across 16 explicit paths; `cd apps/server && bunx tsc --noEmit` passed.
- Completed C3 remote-observation mapping onto durable series transitions and immediate background-safe feedback work-item ingestion.
- Added `projectState.pr` in `application/dashboard/read-model.ts`: campaign/source anchor, publication policy and blockers, full series plus `series_by_status`, upstream PR numbers, the next batch and its validation blockers, pending work-item queue/count, and held/queued activation state.
- Added all C4 projections: `pr.open_campaign`, `pr.activate`, `pr.publish_batch`, `pr.release`, `pr.close_campaign`, `pr.abandon_campaign`, `pr.campaign_recover`, and `pr.adopt_legacy`, preserving the documented confirmation policy and blocker decisions.
- Added the eight-command `api/routes/pr.ts` surface with blocker-decision responses; retained `pr-campaign.ts` as a compatibility re-export and wired the new route into the HTTP server.
- Added runtime orchestration for open/close/abandon/recover and the no-existing-campaign legacy-adoption path; terminal and recovery commands preserve campaign events, dispatch release, and paired `pr_phase` evidence atomically.
- Added the frontend PR campaign card and projection-driven controls. Legacy `PrModeActions` publication now calls `pr.publish_batch`, retaining confirmation and listing the projected batch series.
- C4 validation: 57 server tests passed across 8 explicit files; 20 frontend tests passed across 4 explicit files; server TypeScript, `bun run ui:check`, and `bun run ui:build` passed.
</completed>

<in_progress>
- None for Deliverable C4.
</in_progress>

<next_actions>
- Run the coordinator's full-suite and real-database migration/trace verification before live rollout.
</next_actions>

<risks_or_open_questions>
- The contract describes one activation entry while C2 explicitly requires an acquire/release pair; C2 uses distinct `pr-phase:<lease>:acquired|released` entry IDs grouped by one lease ID.
- Sync invalidations are immutable history, so publication blocks only invalidations newer than the series validation timestamp and accepts either series ID or branch legacy identity.
- Legacy external publication cannot roll back; retry reads the preserved PR record first so an already-opened upstream PR is adopted rather than duplicated.
- Concurrent protected-file work was not edited. Integration should re-run focused tests after those changes settle.
- `pr.adopt_legacy` is projected only when legacy split records exist without an open campaign; execution opens and activates the anchored campaign before importing the records in one durable transaction.
- `pr.campaign_recover` treats a blocked PR lease as failed and a heartbeat older than the shared dispatch staleness threshold as stale; recovery returns the campaign to `in_review` and releases the lease with timeline evidence.
- `ui:build` retains the existing local-font resolution and large-chunk warnings; neither warning fails the build.
</risks_or_open_questions>

<important_paths>
- `objectives/project-state-slice-4/spec.md`
- `apps/server/src/core/orchestrator-state/storage/migrations/014-pr-campaign.ts`
- `apps/server/src/core/session-runtime/phases/pr/campaign/`
- `apps/server/src/core/session-runtime/phases/pr/runtime.ts`
- `apps/server/src/core/session-runtime/phases/running/run-control.ts`
- `apps/server/src/application/dashboard/read-model.ts`
- `apps/server/src/api/routes/pr.ts`
- `apps/server/src/api/routes/pr-campaign.ts`
- `apps/frontend/src/pages/workspace/sessions/active/subphases/pr/components/PrCampaignCard.tsx`
- `apps/frontend/src/components/app/_lib/projectedPrCampaignControls.ts`
</important_paths>

<repair_findings_1_2_4>
- Batch publication freezes the campaign id, batch index, complete ordered series ids, and command idempotency key in `pr_batch_publications` before external work. Per-series progress is durable in `pr_batch_publication_series`; batch and series ownership use revision CAS so concurrent publish commands cannot both execute.
- Retries resume the incomplete frozen reservation, skip series already committed as published, and finalize one complete `pr.batch_published` event transactionally with reservation completion. A completed retry using the same idempotency key returns the original result without advancing to another batch.
- Immediately before each remaining series is handed to external publication, one transaction rereads the active lease, campaign status/blockers, current series revision/status/validation, and latest series-or-branch sync-invalidation watermark, then CAS-reserves that series. A mid-batch blocker or invalidation leaves later series uncalled.
- `openPrForSliceUnderLease` queries open GitHub PRs by base branch and head branch, verifies the fork owner from returned metadata, and adopts the exact match before considering `gh pr create`.
- Campaign-authoritative frontend state hides per-card `Open Draft`; app-level legacy `openPr`, `openDraftBatch`, and `openAllPrs` dispatches are rewritten to projected `pr.publish_batch` before confirmation and endpoint selection.
- Registered `apps/server/src/core/orchestrator-state/storage/migrations/015-pr-batch-publication-reservations.ts` as migration 15 and aligned the DDL/schema mirrors and convergence coverage.
- Repair verification: 20 focused server tests passed across explicit `campaign/publication.test.ts` and `pr/runtime.test.ts`; 3 focused frontend tests passed; server `bunx tsc --noEmit` and root `bun run ui:check` passed.
</repair_findings_1_2_4>

<repair_worker_f3_f5_f6_f8_f10_f12>
<status>
- Complete: findings 3, 5, 6, 8, 10, and 12 are repaired within the assigned campaign runtime, lease, route, and campaign-card surfaces.
- Fenced work-item claim/resolve/decline/revise commands now require explicit project and current PR lease identities; QA repair routes through the campaign fence with `lease_id` threaded to the existing job runtime.
- Recovery uses server time, returns interrupted items/series to pending/changes_requested when consistent, records reconciliation blockers otherwise, and reports all interrupted identities in `cancelled_subject_ids`.
- Terminal commands cancel queued PR dispatch/handoff state before campaign CAS; lease settlement and activation both reject terminal campaign promotion.
- Legacy adoption retries recognize the deterministic anchored campaign at route projection time; empty campaign creation/closure is rejected while server derivation consumes passed final split plans or PR records.
- Active campaigns project `pr_already_active`, and the campaign card omits the redundant Activate control.
</status>
<validation>
- 90 focused tests passed across 11 explicit server paths (530 assertions).
- `cd apps/server && bunx tsc --noEmit` passed.
- Repo-root `bun run ui:check` passed.
</validation>
<coordination>
- Did not edit concurrently owned `campaign/publication.ts`, `phases/pr/runtime.ts`, `adoption.ts`, `observation.ts`, `pr-sync.ts`, or `PrStageCard.tsx`.
- Minimal live-path wiring edits were required in `apps/server/src/infrastructure/http/server.ts`, `apps/frontend/src/components/app/index.tsx`, and the nearby dashboard/read-model test; preserve concurrent edits in those already-shared files during integration.
</coordination>
</repair_worker_f3_f5_f6_f8_f10_f12>
</current_state>
