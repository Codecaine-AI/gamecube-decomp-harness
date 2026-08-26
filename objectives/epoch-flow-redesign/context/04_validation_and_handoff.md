# Validation and Handoff

## Commands

- Server tests: `cd apps/server && bun test` (known pre-existing failure:
  `src/api/cycle/routes.test.ts:390` — ignore).
- Frontend tests: `cd apps/frontend && bun test`.
- Report rebuild (manual fold-in, also the Phase 1 dry-run harness):
  `bun apps/server/src/job-runner.ts --game melee --repo-root <cycle worktree>
  --state-dir games/melee/state report-run`.
- Server run recipe: `ORCH_SYNC_INGEST_CONCURRENCY=12 ORCH_AGENT_KERNEL_REQUIRED=1
  bun apps/server/src/server.ts` (restart server AND scheduler after any
  migration change — mixed-version processes silently stall dispatch).

## Evidence to record per phase

- Phase 1: dry-run reconciliation plan against real upstream drift; precedence
  unit-test matrix (upstream-exact vs local-better vs equal).
- Phase 2: screenshot-equivalent of the three tiers + stepped chart for cycle
  02a80f9b; proof a restage leaves tiers unchanged.
- Phase 3: links to the scratch draft PR and the cycle draft PR across two
  boundary updates.
- Phase 4: epoch timeline (save points), reconciliation log, draft PR history.

## Live-state cautions for whoever picks this up

- Cycle 02a80f9b holds ~15 worker-integration commits ahead of anchor
  89d8368d; report.json in the cycle worktree was rebuilt 2026-08-26 14:08Z at
  91.0803% matched.
- Paused ramp runs (2e145304, a04228ad, 710c92b1, e2d6b499, a57a392e) and four
  stale READY runs predate the staging fixes — do not resume them; stage fresh.
- Old-run queued worker jobs (~700) drain via stale-claim drops; phantom
  running jobs were lease-expired manually 2026-08-26.
- Everything through the 2026-08-26 fixes is pushed: harness fb3b8a50,
  agent-kernel ba25400.

## Handoff

Update `current_state.md` at every phase gate. If a supervised run is active at
handoff, record run id, width, scheduler pid, and the stop commands
(`/api/process/stop`, `/api/run/hard-stop` with confirmed:true) there.
