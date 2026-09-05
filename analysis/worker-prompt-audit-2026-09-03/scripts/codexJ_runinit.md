# Task J: `/api/run/init` fails after creating the run — dispatch lease uses a workflow id that is not a run id

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Do not touch `games/melee/**`.

## Symptom (reproduced live, 2026-09-05)
`POST /api/run/init` with a valid config on active cycle `c66a1559…` returns
`{"error":"Durable run workflow run-init:c66a1559-2865-4602-96bf-c4907f200c4e was not found for dispatch"}`.
The CLI step succeeded first (run `74c57aa6-72b1-410b-9387-e3b44abb96bc` exists, status `ready`), but the post-step never ran: no boundary commit, no `init` save point, and `cycles.active_run_id` stayed NULL.

## Cause
`apps/server/src/core/cycle-runtime/phases/preparing/runtime.ts` (`initRun`, ~line 325–345) calls `withDispatchLease(init, { kind: "run", workflowId: \`run-init:${cycleUuid}\` … })`. `durableWorkflowTrace` in `apps/server/src/core/harness-state/lease.ts` (~line 360–385) resolves kind `"run"` by `SELECT … FROM runs WHERE id = ?`, so a `run-init:<cycle>` id can never be found. This regressed when the dispatch correlation was tightened (see `git log` on lease.ts: `15e4f633` / `056b71c7`).

## Fix
In `initRun`, resolve the created run id (`latestRunId(init.stateDir)` — already used below for `activeRunId`) BEFORE `withDispatchLease` and pass it as `workflowId` (kind `"run"`). Fail with a clear error if no run id can be resolved. Keep the rest of the post-step (boundary commit, save point, payload) unchanged. Check whether the same `run-init:`/`run-fresh:` pattern exists in `freshRun` or elsewhere (`grep -rn "run-init:\|run-fresh:" apps/server/src`) and fix those the same way.

## Also: cycle ↔ run linkage
Confirm where `cycles.active_run_id` is set for a newly initialized run (grep `active_run_id` in `apps/server/src/core/cycle-runtime`). If `initRun`'s post-step is what links it, make sure the fixed post-step does; if process start links it, leave it.

## Tests
Add a regression test for `initRun` that stubs `runCli` to create a run row and asserts `withDispatchLease` is called with the run id (not `run-init:*`), and that the save point + `activeRunId` are returned. Run `cd apps/server && bun test src/core/cycle-runtime/phases/preparing src/core/harness-state` — green. Print DONE with the diff summary.
