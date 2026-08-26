# Phase 3 Codex Spec — Draft PR at Stable States

Align the EXISTING publisher `apps/server/src/core/cycle-runtime/phases/running/
epochs/cycle-draft-pr.ts` (already invoked from scheduler/epoch-boundary.ts when
`cycleDraftPrEnabled`, default on) with the decided contract in
`context/03_working_plan.md` Phase 0 decisions and `context/02_implementation_scope.md`
item 4. Do not build a second mechanism. Do not start servers or runs; do not
push branches or create PRs during implementation — tests use mocked gh/git
runners like the existing cycle-draft-pr tests (if none exist, add them with a
mocked command runner).

Changes:

1. **Sequencing = stable state.** The publisher must run AFTER the Phase 1
   boundary sync completes (post pr_sync save point), so the pushed branch is
   "up to date with current remote, our changes on top, theoretically directly
   mergeable." Verify epoch-boundary.ts ordering (Phase 1 inserted boundary
   sync before the publisher — confirm and add a regression test on ordering).
   Skip publishing (with a logged reason) when the boundary sync failed.
2. **Naming/description contract.** Title: "GCD decomp session <cycle-short>"
   (cycle-short = first 8 of cycle uuid). Body boilerplate first line: "Work in
   progress — AI decomp session." followed by: epoch ordinal, the three tier
   scores (baseline / confirmed / tentative — reuse the Phase 2 `scoreTiers`
   projection; import the projection helper, do not recompute), confirmed
   matches (symbol, unit, score) and improvements (symbol, delta) since
   baseline. Keep branch naming as-is (orchestrator/cycle/<uuid>) unless the
   publisher already parameterizes it — do NOT rename existing branches.
3. **Refresh semantics.** First stable state: create draft PR (existing find-or-
   create is fine). Later stable states: push + `gh pr edit` body/title update.
   Failures to reach GitHub are warnings recorded on the dashboard artifact,
   never epoch blockers (existing posture — keep).
4. **Tests.** Mocked-runner tests covering: title/body content includes tiers +
   win lists; ordering after boundary sync; skip-on-sync-failure; edit-vs-create
   paths. `cd apps/server && bun test` green except known routes.test.ts:390.

Out of scope: any live gh calls (I run the live gate separately), frontend,
docs.
