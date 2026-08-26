<current_state>
<last_updated>2026-08-26</last_updated>

<status>
- Objective created after Ford froze all running pending flow redesign.
- Phase 0 COMPLETE: all design decisions made by Ford 2026-08-26 (canonical
  7-step flow + conflict/librarian/requeue mechanism + draft-PR naming +
  stable-state definition). Recorded in context/03_working_plan.md.
- Phase 1 IMPLEMENTED and gate-passed 2026-08-26: boundary-sync module wired
  into runEpochBoundary behind config flag; typed save points
  (baseline/epoch_finish/pr_sync); branch-scoped displacement detection;
  dry-run verb. Gate evidence: dry-run vs real worktree found drift
  (anchor 89d8368d -> upstream 861a69b7), 9 upstream-taken files, 33 displaced
  targets w/ prior scores + ledger notes, no mutations. Tests 994/995 (known
  routes.test.ts:390 only failure).
- Everything is stopped: no scheduler, no worker processes, zero Daytona
  sandboxes (all 30 deleted 2026-08-26 ~14:2xZ). No runs until Phase 1–2 land.
</status>

<completed>
- 2026-08-26 ramp validated 32-wide sandbox execution (14 exacts banked,
  committed per-accept on the cycle branch) — see memory
  sandbox-32-ramp-and-run-staging-seams and objectives/sandbox-tool-exec.
- Staging/scheduler fixes pushed to main (harness fb3b8a50, kernel ba25400):
  createRun at cycle head, init-run uses cycle worktree, epochs migration 002,
  sandbox delete retries + periodic reconciliation.
- Cycle worktree report rebuilt at 91.0803% matched (14:08Z), so the last
  staged board excluded already-banked wins.
- This bundle authored: problem, constraints, scope, phase plan, validation.
- 2026-08-26 later: Ford's canonical 7-step flow captured verbatim in
  context/00_problem.md; goal/constraints/scope updated to match (sync every
  boundary, mergeability not rebase, KG rebuild + requeue on change, three
  graph markers, docs chapter added as scope item 6).
</completed>

<in_progress>
- Nothing running by operator instruction. Do not start runs until Phase 0 is
  approved and at minimum Phase 1–2 are implemented.
</in_progress>

<next_actions>
- Phase 2: three-tier score projection (read-model) + frontend, per
  context/02 scope items 3 (backfill: yes) and 5.
- Phase 3: draft-PR job. Phase 4: supervised live validation (needs Ford go).
</next_actions>

<risks_or_open_questions>
- Rebase vs merge choice affects worktree/PR mechanics everywhere downstream.
- cycleDraftPrEnabled flag's current behavior is unaudited.
- Equal-score conflict precedence needs an explicit rule.
- ~700 stale queued worker jobs from ramp runs still drain via claim-drop noise.
</risks_or_open_questions>

<important_paths>
- objectives/epoch-flow-redesign/ (this bundle)
- apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts
- apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts
- apps/server/src/application/dashboard/read-model.ts
- games/melee/worktrees/cycles/02a80f9b-1045-481b-88cf-d32b7a673afe/current
- games/melee/state/orchestrator.sqlite
</important_paths>

<active_runs>
- None. All runs paused/terminal; all sandboxes deleted; server (bun
  apps/server/src/server.ts, port 8787) is the only live process.
</active_runs>
</current_state>
