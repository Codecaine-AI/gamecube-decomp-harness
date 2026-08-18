# Implementation Scope

All paths under `apps/server/src` unless noted. File:line references verified 2026-08-18.

## Seams this objective builds on (do not redesign)

- **Bash tool injection**: `infrastructure/agent-runtime/kernel-pi-runner.ts:611` —
  `pi.registerTool(createBashToolDefinition(options.cwd, { operations: trackedBashOperations() }))`.
  `BashOperations` is `{ exec(command, cwd, options) }` (options carries env, signal, timeout).
  A `sandboxBashOperations(claim)` swaps in here with zero agent-visible change.
- **Shell chokepoint**: `infrastructure/shell/run-command.ts:12` (`runCommand`) — worker-scoped
  call sites (validation builds, objdiff scoring, git diff in the workspace) route to sandbox
  exec; host-scoped call sites are untouched.
- **File tools**: worker `read`/`edit`/`grep`/`glob` redirect via `excludeBuiltinTools` +
  re-registration under the same names (mechanism proven by `write` exclusion,
  `worker-cycle.ts:1579`). `read` = fs download; `edit` = download + host-side exact replace +
  upload (or a one-round-trip edit applier shipped in the image); `grep`/`glob` = in-sandbox
  ripgrep/find.
- **Provisioning hook**: `core/cycle-runtime/phases/running/workers/worker-job.ts:160-222`
  (`buildWorkerTask`) — currently calls `provisionWorkerWorktree` (`core/job-queue/
  provisioning.ts:152-170`) then writes `task_spec.json` (worker-job.ts:186-205). Sandbox path
  branches on `job.executionClass` here.
- **Write fence**: six functions in `core/cycle-runtime/run-state/worker-state.ts` (503-820) with
  `authority: ClaimToken | { host }`; verification `kernel.ts:204-224`. Untouched by this
  objective (child stays host-side).
- **Reap lane**: `worker-job.ts:250-292` (`reapWorkerJobs` -> `recoverActiveClaims`) — sandbox
  deletion wires in here, at claim settlement (`closeWorkerState` path), and in startup
  reconciliation.
- **Integration**: child enqueues the `integration` job for the best checkpoint
  (`worker-cycle.ts:2346-2367` -> `run-state/worker-output-integration.ts:93-109`,
  `integration_outcomes`); host applies `patch_path` from `artifact_dir`. Untouched, provided
  decision 6 (per-attempt evidence download) keeps `patch_path` populated as today.
- **Jobserver**: `infrastructure/shell/global-compile-jobserver.ts` — host FIFO under
  `/tmp/decomp-orchestrator-compile-jobserver-<uid>`; token acquisition stays host-side wrapping
  remote build exec.

## What changes for a sandbox-class claim (child perspective)

The child (`worker-cycle.ts:1401` `runWorkerCycleFromTask`) keeps: SQLite open/verify/write-back,
Pi session via codex-lb, kernel Postgres traces, knowledge context from host graph/corpora,
artifact_dir writes. What redirects: workspace existence check (1413, currently
`existsSync(worktree_path)` — becomes a sandbox liveness/workspace check), write-set diff capture
(`captureWriteSetDiff` — git runs in-sandbox, diff text returned), validation build + objdiff
scoring (remote exec), QA source snapshots (fetch-first), agent tool env (canonical tool paths
describe image paths; verification moves in-sandbox).

## Host-coupling surface (why decision 1 was taken; ranked)

1. Shared-file SQLite `orchestrator.sqlite` with per-write lease checks (child reads jobs/runs/
   cycles/claims/checkpoints; writes baseline score, pi_sessions, session ids, widenings,
   checkpoints, close, events; enqueues knowledge_absorption + integration jobs).
2. Git worktree on host object store + `build/compilers`/`build/binutils` symlinks into
   `<stateDir>/tools`, per-file `orig/` symlink tree.
3. Loopback services: codex-lb 127.0.0.1:2455, kernel Postgres 127.0.0.1:55432 (hard-required
   for non-dry spawns, `kernel-pi-runner.ts:495-508`).
4. `/tmp` FIFO jobserver + pid-liveness locks.
5. `artifact_dir` inside host stateDir (the child's whole evidence surface).
6. Full host env/secret inheritance in TaskSpec env (`executor.ts:40`).

Under decision 1 all six stay host-side and unchanged; only the workspace (item 2's *content*)
moves.

## Image groundwork (phase 0 targets)

- `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md` + `build_image_bundle.sh`:
  fix `projects/melee/...` -> `games/melee/...` throughout; amend cache section per decision 3.
- Build `objdiff-cli-linux-x86_64`: patched v3.6.1 score fork,
  `cargo build --release --target x86_64-unknown-linux-musl`; place per MANIFEST.
- `games/melee/state/tools/objdiff-cli-3.6.1-score/README.md`: `ORCH_PROJECT_STATE_DIR` ->
  `ORCH_GAME_STATE_DIR`.
- Golden wibo ready: `games/melee/state/tools/wibo-1.2.0-opt1/wibo-linux-i686` (static i686 ELF,
  all 2135 .o byte-identical, patch file alongside).

## New code surfaces (phase 2)

- `core/job-queue/sandbox.ts` (or similar): Daytona SDK client wrapper — create/label/seed/exec
  session/download/delete, explicit timeouts everywhere, `sandbox.*` game-event emission.
- `provisionSandboxWorkspace()` in `core/job-queue/provisioning.ts`.
- `sandboxBashOperations(claim)` + file-tool re-registrations in the agent-runtime layer.
- Fetch-first shims at the tool-wrapper layer (`core/tools/wrappers/`, `core/tools/resolver.ts:
  344-374`) for audited corpus tools.
- Config: resource class knob, Daytona API key via `local.env` (host-side only), execution_class
  selection policy (which claims go sandbox).
