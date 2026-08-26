# Phase 2 Codex Spec — Three-Tier Scores + Frontend

Implement scope items 3 and 5 of `context/02_implementation_scope.md`, honoring
`context/01_constraints.md`. Read `00_problem.md` first — the score-tier
definitions and the screenshot failure modes are the contract. Do not start
servers or runs; games/melee/state is read-only for manual verification only.

## Read-model (apps/server/src/application/dashboard/read-model.ts + helpers)

Expose a `scoreTiers` projection with three named tiers, each from its OWN
source, never from a staged run's board artifacts:

- `baseline`: the cycle upstream anchor (game_upstream_anchors) + the save
  point/report measures at that anchor — the cycle-start (or last pr_sync)
  ground truth.
- `confirmed`: the latest boundary-validated report of the cycle branch
  (typed save points from Phase 1: epoch_finish / pr_sync; fall back to the
  latest save point for pre-Phase-1 history). Include the delta vs baseline
  and the per-symbol list of confirmed wins: reuse the Phase 1 branch-scoped
  worker-integration commit parser (anchor..HEAD) so Confirmed always means
  "state of our worktree vs the actual melee branch" — matches (symbol, unit,
  score) and improvements (symbol, delta), each flagged in_branch vs
  in_upstream once a pr_sync has folded upstream in.
- `tentative`: open-epoch wins not yet integrated+reported — from
  worker_checkpoints/checkpoint_items of the ACTIVE run's open epoch only;
  empty when no run is active (never a placeholder error string).

Chart series: the cycle's save-point timeline with a `kind` per point
(baseline / epoch_finish / pr_sync / legacy), so the graph steps per epoch and
survives run restages. Backfill (decided: yes): map cycle 02a80f9b's existing
save points into the series using their trigger/label fields (init → baseline,
others → legacy/epoch_finish as derivable) so history renders immediately.

Remove the projection paths that feed these tiles from run board artifacts
(`initial`/`current` board measures stay available for other consumers but must
not drive the score header/panes).

## Frontend (apps/frontend/src)

- Score header: three tiers labeled Baseline / Confirmed / Tentative with the
  stepped chart (marker style per kind).
- Confirmed pane: matches + improvements lists from `scoreTiers.confirmed`,
  each row showing vs-upstream state; kill the "saved report was generated
  before the current run" dead-end (cycle-lineage keyed, run-agnostic).
- Tentative pane: from `scoreTiers.tentative`; empty state is a plain "no
  tentative wins yet this epoch" message.

## Verification

- Unit tests for the projection over a fixture store (anchor + typed save
  points + integration commits + open checkpoints), including: restaging a run
  changes nothing in scoreTiers; empty-tentative when no active run.
- `cd apps/server && bun test` green except known routes.test.ts:390.
- `cd apps/frontend && bun test` green.
- Manual: print the projection for the real cycle (small script or test
  harness reading games/melee/state read-only) showing baseline 90.8x /
  confirmed 91.08 with the ~15-commit win list.

Out of scope: draft PR (Phase 3), boundary behavior changes, docs.
