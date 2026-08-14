# Common rules — every Slice 6 lane

- Baseline commit c3ca54af (slices 1-5). The tree carries unrelated uncommitted changes
  (see context/preexisting_dirty.txt). Never revert, reformat, stage, or commit them.
- NEVER run git write commands (add/commit/stash/checkout/restore/clean/mv/rm). Read-only
  git (status/diff/log/show) is fine. The orchestrator owns staging and the single commit.
- Edit ONLY files inside your lane's ownership list. Other lanes run concurrently in this
  same tree. If you believe an out-of-scope edit is required, do NOT make it — record the
  need in your lane report and finish the rest.
- Do not edit `packages/agent-kernel` (external symlinked worktree).
- Do not start the UI server (`bun run ui`, `ui:server`, `ui:dev`). The dashboard process
  name `melee-live` must not change or become configurable.
- Read contracts/docs ONLY via the docs CLI:
  `bun packages/docs-framework/packages/docs-cli/src/index.ts render <docs path>`
  `bun packages/docs-framework/packages/docs-cli/src/index.ts grep <term> [prefix]`
  Never read doc.json directly. The rendered contract wins.
- State remains authoritative; events are accepted-fact history, not replacement state.
  All operator authority is server-owned. Preserve manual operator control and full
  event/trace lineage. Do not weaken Slice 5 dispatch, event, actor, or tracing contracts.
- Validation is FOCUSED ONLY: run the specific test files/dirs named in your spec plus
  the named TypeScript check. Never run the full repository suite or `bun run check`.
- Split your own work into parallel sub-tasks wherever independent.
- Finish by writing your lane report (path in your spec): changed files, exported
  APIs/seams, exact test commands with pass/fail counts, deviations and blockers.
