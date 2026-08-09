---
covers: D-Comp Orchestrator server-owned job modules and operator command surface
concepts: [server-jobs, commands, init-run, tick, worker, integration-resolve, scheduler, run-loop, babysit, recovery, checkpoint, regression-check, qa-ship-gate, qa-repair, pr-split-plan, pr-draft-qa, pr-preship-review, ui]
code-ref: decomp-orchestrator/apps/server/src/job-runner.ts, decomp-orchestrator/apps/server/src/application/jobs/job-runner.ts, decomp-orchestrator/apps/server/src/core/session-runtime/phases
---

# Server Jobs: Overview

The operator job surface is owned by `apps/server`. `apps/server/src/job-runner.ts`
is a stable executable shim. `apps/server/src/application/jobs/job-runner.ts`
parses global project/runtime options, loads project-local env, and dispatches
to phase-owned job modules or shared core/infrastructure helpers. The deleted
standalone command app is not a runtime boundary.

`--project <id>` selects `projects/<id>/project.json`, applies ignored
`projects/<id>/local.project.json` when present, then applies explicit
`--repo-root`, `--state-dir`, and command-level `--graph-db` overrides. Project
mode carries the resolved project id, checkout root, state directory, graph
database, descriptor path, and local override path through server jobs. Raw path
mode remains available when `--project` is omitted.

## File Tree

```text
apps/server/src/
+-- job-runner.ts
+-- application/
|   +-- jobs/
|   |   +-- job-runner.ts
+-- core/
|   +-- project-registry/
|   |   +-- runtime-options.ts
|   |   +-- runtime-defaults.ts
|   +-- session-runtime/
|   |   +-- run-state/
|   |   +-- phases/
|   |   |   +-- preparing/
|   |   |   +-- running/
|   |   |   |   +-- service/init-run.ts
|   |   |   |   +-- scheduler/tick.ts
|   |   |   |   +-- scheduler/run-loop.ts
|   |   |   |   +-- integration/integration-resolve.ts
|   |   |   |   +-- workers/worker-cycle.ts
|   |   |   |   +-- jobs/babysit.ts
|   |   |   |   +-- jobs/recover-claims.ts
|   |   |   |   +-- epochs/epoch-run.ts
|   |   |   +-- pr/jobs/
|   +-- validation/jobs/
|   +-- knowledge/jobs/
+-- infrastructure/
    +-- env/
    +-- persistence/sqlite/
    +-- shell/
```

## Jobs

| Job | Owner | Purpose |
| --- | --- | --- |
| `init-run` | `core/session-runtime/phases/running/service` | Creates run state, stores the run checkpoint goal, loads board data, admits initial epoch target candidates, and writes the initial board snapshot. |
| `tick` | `core/session-runtime/phases/running/scheduler` | Handles one unhandled wake event with the deterministic scheduler, epoch target admission, and worker wake logic. |
| `worker` | `core/session-runtime/phases/running/workers` | Claims one epoch target, runs the worker session, validates checkpoints, and closes worker state with runner-owned lifecycle state. |
| `integration-resolve` | `core/session-runtime/phases/running/integration` | Spawns the running-phase `integration-resolver` agent for one worker-output integration conflict queue item supplied by `--item-file`. |
| `run-loop` | `core/session-runtime/phases/running/scheduler` | Resting deterministic scheduler loop that handles wake events, keeps epoch work moving, starts workers up to capacity, and sleeps when the board is quiet. |
| `babysit` | `core/session-runtime/phases/running/jobs` | Guardian wrapper for the run loop and detached project process lifecycle. |
| `recover-claims` | `core/session-runtime/phases/running/jobs` | Closes interrupted or expired active target claims and their worker state as runner-owned errors after operator confirmation. |
| `epoch-run` | `core/session-runtime/phases/running/epochs` | Runs one epoch checkpoint cycle: commit validated work, rebuild the report in the epoch worktree, save a boundary point, and route regressions back through epoch target admission. |
| `regression-check` and `report-run` | `core/validation/jobs` | Run saved-baseline report/objdiff validation, QA scan integration, and report artifact generation. |
| `checkpoint-run`, `qa-repair`, `pr-split-plan`, `pr-draft-qa`, `pr-preship-review`, `reconcile`, `save-point` | `core/session-runtime/phases/pr/jobs` | Own checkpoint, QA repair, PR split/review, reconcile, and campaign save-point workflows. |
| `kg-*` | `core/knowledge/jobs` | Own knowledge source status, maintenance, graph rebuild/search, PR indexing, file-card, and ranking jobs. |

Run a job with:

```sh
bun run server:job -- --project melee status
bun run server:job -- --project melee init-run --desired-workers 16 --goal-kind matched_code_percent --goal-value 72
bun run server:job -- --project melee babysit --max-workers 16 --idle-sleep-ms 5000
```

`qa-repair` is the resolver runtime for QA repair queue items. The job builds
`queue.json`, and `--run-agents` launches the `qa-repair` agent over queued
items; `--item-id <id>` narrows the launch to a single queue item while
`--max-items <n>` bounds a batch. The dashboard PR-mode manual handoff actions
call `/api/pr/qa-repair`, which maps to the same runtime and opens the
operation log while the resolver runs.

`integration-resolve --item-file <path>` is the pre-PR worker-output conflict
resolver runtime. It consumes an explicit integration conflict queue item JSON,
optionally a `--queue-summary-file`, and launches role `integration-resolver`
with kernel kind `worker-integration`. It writes parsed output and summary
artifacts under `state_dir/integration_resolver/`; the runner owns queue status
mutation and epoch acceptance after the agent returns.

## Boundaries

Server jobs are debuggable entrypoints over phase-owned workflow code. They do
not own business logic separately from the server app; running work stays under
the running phase, PR handoff work stays under the PR phase, shared knowledge
and validation helpers stay under `core`, and raw IO adapters stay under
`infrastructure`.

Project resolution is a core project-registry concern. Jobs consume
`globals.repoRoot`, `globals.stateDir`, optional `globals.graphDbPath`, and
optional project metadata from `runtime-options.ts`.

The run loop is deliberately not a Pi agent. It is a thin evented loop over
durable SQLite state: handle unhandled events with deterministic scheduler
ticks, start worker sessions for open slots, then rest until state changes. The
babysit job wraps the decomp system process, records guardian artifacts, runs
claim recovery when appropriate, and restarts the child when policy allows.
