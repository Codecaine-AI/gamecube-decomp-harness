# Working Plan

Phase-gated. No phase starts until its gate passes and Ford has signed off on
Phase 0's decisions.

## Phase 0 — Design decisions (Ford review required)

- Objective: settle the decisions that shape everything downstream.
- Inputs: this bundle; run-loop/epoch-boundary code; sync conflict/publication
  code; `cycleDraftPrEnabled` audit; game_upstream_anchors semantics.
- Decided by Ford 2026-08-26 (canonical-flow message):
  - Sync every epoch boundary (his step 4 is unconditional).
  - No full rebase — mergeability into the fresh sync is the bar.
  - Boundary sync includes upstream PR ingestion; on change: full KG rebuild +
    requeue of anything no longer matched.
  - Draft-PR branch pushed at stable states, refreshed each pass.
  - Graph carries three marker kinds per epoch: baseline, epoch-finish,
    PR-sync.
- Decided by Ford 2026-08-26 (second message) — Phase 0 COMPLETE:
  1. Draft PR naming is unimportant: branch/title along the lines of
     "gcd-decomp-session"; standard description "Work in progress — AI decomp
     session." CI is visibility only, never a gate.
  2. Conflict precedence: upstream (merged into the melee remote) is gospel
     and always wins at the boundary. When upstream overrides local work —
     especially a local new match — the target is REQUEUED with a knowledge
     entry: a librarian note for that target recording "locally matched /
     changed, upstream version landed and overrode it, requeued to
     re-resolve." No worker agents run during the boundary itself; the note +
     requeue hands the fix to the next normal worker attempt, which sees the
     history in the knowledge base.
  3. Backfill three-tier history for cycle 02a80f9b: yes.
  4. Stable state = end of every epoch after the boundary sync: up to date
     with current remote, our changes applied on top, theoretically directly
     mergeable. Push the draft-PR branch at every such state.
- Output: decisions recorded here; goal/constraints/scope updated to match.
- Gate: PASSED (Ford's 2026-08-26 messages).

## Phase 1 — Boundary reconciliation lane (scope items 1–2)

- Process: codex exec against the phase spec; unit tests for precedence logic
  and the anchor advance; dry-run mode that logs the would-be rebase without
  touching the branch.
- Gate: `bun test` (apps/server) green minus known routes.test.ts:390; dry-run
  on the live cycle worktree shows a correct plan against real upstream drift
  (1 upstream commit is currently pending — a real fixture).
- Failure handling: resolver-unsettleable conflicts must pause the epoch with a
  loud blocker; verify by fixture.

## Phase 2 — Three-tier scores (scope item 3) + frontend (scope item 5)

- Process: read-model first with tests over a fixture cycle (anchor + 2
  boundaries + open checkpoints); then frontend binding.
- Gate: dashboard shows three tiers and stepped chart for cycle 02a80f9b's
  existing save points; restaging a run does not change any tier.

## Phase 3 — Draft PR per epoch (scope item 4)

- Process: implement behind flag; first live test against a scratch branch/PR
  on the real remote before enabling for the cycle branch.
- Gate: draft PR opens on boundary 1 and updates on boundary 2 of a supervised
  run; PR body lists confirmed wins matching the read-model.

## Phase 4 — Supervised live validation

- Process: one run, modest width (8), two epochs minimum, with upstream drift
  present; watch reconciliation, scores, draft PR.
- Gate: success metrics in goal.md all observed; current_state.md updated with
  evidence; then hand back for normal 32-wide operation.
