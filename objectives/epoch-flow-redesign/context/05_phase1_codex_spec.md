# Phase 1 Codex Spec — Boundary Reconciliation Lane

Implement scope items 1–3 of `context/02_implementation_scope.md`, honoring
every rule in `context/01_constraints.md`. Read `00_problem.md` (canonical
flow) first. Work only in apps/server; do not start servers, schedulers, or
runs; do not touch games/melee/state or the live cycle worktree except via the
dry-run described below.

## Deliverables

1. **Audit** (`objectives/epoch-flow-redesign/audit-phase1.md`): before
   editing, map and record — the exact insertion points in
   `core/cycle-runtime/phases/running/scheduler/run-loop.ts` and
   `.../epochs/cycle.ts` (`runEpochBoundary`); how save_points/timeline rows
   are written and how a `kind`/label field can distinguish baseline /
   epoch_finish / pr_sync markers; what `cycleDraftPrEnabled` currently does;
   the sync intake's merged-PR indexing entry point reusable without
   publication gating; the kg librarian ledger append path
   (`games/melee/knowledge/ledger/learnings.jsonl` lane used by
   kg-librarian-condense) suitable for boundary override notes; the requeue
   path for an epoch target (`requeueJob` / epoch_targets status machinery);
   how the epoch board refresh for epoch N>1 sources its report.

2. **Boundary sync module** (new file under
   `core/cycle-runtime/phases/running/epochs/`, e.g. `boundary-sync.ts`):
   given store + globals + cycle worktree root + upstream anchor, performs:
   fetch origin; detect drift vs anchor; merge upstream into the cycle branch
   with conflicts resolved mechanically in upstream's favor (git merge -X
   theirs or equivalent per-file resolution — record exactly which files were
   taken from upstream); for every target whose unit/function upstream
   displaced: append a librarian ledger note (target key, our prior state:
   match/improvement + score, upstream landed sha, verdict
   "overridden_by_upstream_requeued") and requeue that target; trigger full KG
   rebuild + report recompute only when the merge changed anything; write a
   `pr_sync` save point; advance the cycle upstream-anchor record and
   `cycles.head_revision`. Infrastructure failures (fetch/merge/build/report
   crash) raise a loud epoch blocker; conflicts never do.

3. **Boundary wiring**: in `runEpochBoundary`, after the existing epoch-finish
   report/save-point (mark it `epoch_finish`), call the boundary sync (behind
   config flag, default ON), then ensure next-epoch admission reads the
   post-sync report (verify/fix the epoch board refresh source).

4. **Dry-run mode**: a job-runner verb `boundary-sync --dry-run --repo-root
   <worktree>` that fetches, computes drift, and prints the full plan (files
   upstream would take, targets that would be requeued, notes that would be
   written) WITHOUT mutating the branch, DB, ledger, or anchors. This is the
   Phase 1 gate harness.

5. **Tests**: unit tests for precedence/displacement detection (upstream-took-
   file → which targets requeue), typed save points, anchor advance, and the
   dry-run plan shape, using fixture repos/stores per existing test patterns
   in the codebase. `cd apps/server && bun test` must stay green except the
   known pre-existing failure `src/api/cycle/routes.test.ts:390`.

## Explicitly out of Phase 1

Draft-PR job (Phase 3), read-model/frontend tiers (Phase 2), docs chapter,
backfill. Do not implement them.
