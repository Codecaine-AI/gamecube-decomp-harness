---
name: run-operator
description: Operate, resume, pause, or diagnose a continuing GameCube decomp harness using its persisted intent, epoch boundaries, Sync state, and Agent Kernel evidence.
---

# Run Operator

Operate the requested game and directive. The durable harness worktree and
state persist across epochs, Sync, pauses, and process restarts.

## Establish Current State

- Read `games/<id>/game.json` and referenced configuration. Paths are game-relative.
  Melee's maintained worktree is `games/melee/workspace/checkout`, its state is
  `games/melee/runtime/state`, and its process name is `melee-live`.
- Read `GET /api/harness?gameId=<id>` for current state and timeline. Use the
  returned `identity.revision` for commands. Inspect the separate dispatch
  lease and run/epoch records before diagnosing liveness.
- Assume the UI server is managed by the user. Do not start or restart it
  unless explicitly requested. A detached scheduler can outlive the server.

## Apply the Directive

1. For Run, send `POST /api/harness/run` with `gameId`, a stable `commandId`,
   `expectedRevision`, and only requested setting changes. The server retains
   intent while readiness or Sync blocks admission and reconciles it after
   those gates clear. A queued response is not proof that a process started.
2. For Pause, send `POST /api/harness/pause` with the same identity fields.
   Verify claims drain and the epoch/Sync boundary settles. Do not admit an
   extra epoch to implement a pause.
3. For bootstrap/manual Sync, use `/api/sync/start` and its returned action
   projections. Publish validated manual staging only within the user's
   authorization. Recovery and cancellation use their canonical Sync routes.
4. Require ready build, source, sandbox, and evidence gates before Run.
   `validate-sandbox --game <id> --sandbox-profile <name>` creates a real Daytona
   sandbox and compares reports; use it only when execution is authorized.

## Observe Boundaries and Recover

The host serially integrates worker patches. Each epoch records its result and
save point before automatic Sync; Sync records completion even without a source
change. The next epoch uses the accepted post-Sync head and refreshed board.
Automatic Sync retains the fenced Run lease and long-lived run identity.

Use the dashboard timeline and Agent Kernel traces first. Required process
stdout/stderr and report files remain evidence referenced by their owning
records. Do not create a parallel log authority or interpret missing evidence
as zero progress. Compare scores only at the same target scope and build inputs.

When a stage fails, preserve its worktree, commit, operation identity, and
artifact paths. Read the implementation and failed evidence before retrying.
Do not reset accepted work, bypass readiness, mutate lease rows manually, or
push an arbitrary historical PR branch. Resolve claims, dispatch ownership,
and pending source publication before restarting a dead scheduler.

Keep interventions in the active objective's `current_state.md`. Report the
resulting accepted head, run, epoch, desired state, and concrete blockers.
For detailed contracts, use the structured Docs corpus under
`10-system-design/20-harness`, with project setup in
`10-system-design/10-game/20-registration-and-setup`.
