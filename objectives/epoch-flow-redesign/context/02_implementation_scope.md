# Implementation Scope

Six surfaces, smallest-first. All implementation via `codex exec` (sol low,
xhigh only on failure), one Codex agent per worktree at a time.

## 1. Epoch boundary sequence (core)

`apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts` and
`.../epochs/cycle.ts` (`runEpochBoundary`). Insert after claim drain, mapping
Ford's steps 3–5 onto the boundary:

1. Epoch-finish re-baseline: rebuild + `forceReportRun`; validated tentative
   becomes confirmed; save point marked **epoch-finish**.
2. Boundary sync: `git fetch origin`; ingest newly merged upstream PRs (reuse
   the sync intake's PR indexing, without publication gating); make the cycle
   branch mergeable into the new upstream head (merge/mergeability check — no
   full rebase).
3. Conflict handling (decided): upstream wins mechanically, always. For each
   target upstream displaced: write a librarian knowledge entry (target key,
   what we had — match/improvement + score, what upstream landed, "overridden
   by upstream, requeued"), then requeue the target. No worker or resolver
   agents run inside the boundary. Wire the note through the existing
   kg-librarian ledger lane so the next worker attempt surfaces it.
4. If the sync changed anything: recompute the report, run the full
   knowledge-graph rebuild, and requeue every target no longer matched; save
   point marked **PR-sync**; update the cycle's upstream-anchor record
   (game_upstream_anchors).
5. Advance `cycles.head_revision`; next epoch admits from the post-sync board;
   workers base on the new boundary commit (existing baseRev CAS).
6. At stable states, push the branch to the draft-PR branch (see item 4
   below).

## 2. Board freshness

Next-epoch admission must read the post-reconcile report, not a staged
snapshot. Verify the per-epoch board refresh path reads the worktree
`report.json` produced in step 4 (the init-run fix of 2026-08-26 covers run
staging; this covers epoch N>1).

## 3. Three-tier score projection

`apps/server/src/application/dashboard/read-model.ts` plus a small state
reader: baseline from the upstream anchor + its save point; epoch-confirmed
from boundary save points (timeline already stores per-save-point measures);
tentative from open-epoch checkpoints (worker_checkpoints/checkpoint_items).
Expose as three named fields; delete the projection paths that read the run's
initial/current board artifacts for these tiles. Chart data = save-point
timeline, which survives restages by construction. Backfill (decided: yes) the
projection for cycle 02a80f9b from its existing save points so history renders
immediately.

## 4. Draft PR job

New boundary step (behind config flag, default on for melee): `gh pr create
--draft` on first stable state, `gh pr edit` + push on later ones. Stable
state (decided) = end of every epoch after the boundary sync: up to date with
the current remote, our changes on top, theoretically directly mergeable.
Branch = the cycle branch pushed to the fork/remote the PR phase already uses,
named along the lines of `gcd-decomp-session-<cycle-short>`; title
"GCD decomp session <cycle-short>"; description boilerplate "Work in progress —
AI decomp session." plus epoch ordinal, tier scores, confirmed matches
(symbol, unit, score) and improvements (symbol, delta) since baseline. CI on
the PR is visibility only, never a gate. Audit `cycleDraftPrEnabled` first —
extend it rather than duplicating. Failure to reach GitHub is a warning, not
an epoch blocker.

## 5. Frontend

`apps/frontend/src/pages/workspace/...` score header + Confirmed/Tentative
panes: bind to the three new fields; Confirmed pane lists vs-remote status per
symbol (in-branch vs in-upstream); kill the "saved report was generated before
the current run" dead-end by keying panes to cycle lineage, not run lineage.
Add the epoch-step rendering to the chart with three marker kinds per epoch:
baseline, epoch-finish, PR-sync (one point per typed save point).

## 6. Docs chapter

The canonical flow (context/00_problem.md) belongs in the system-design docs
(docs/10-system-design/50-workflows/), authored through the docs-writer lane as
a run/epoch lifecycle chapter once Phase 4 validates the behavior. Design-
narrative prose per repo docs style, not bullet atoms.
