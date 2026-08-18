# Problem

## Why sandboxes

- The operator's primary motivation (interview, 2026-08-18): CPU scale-out — worker builds get
  their own vCPUs off the host instead of contending on one machine. Secondary: the design docs'
  host-footprint case (592 GB worktree debris, per-claim provisioning churn, shared-filesystem
  coupling between workers and the cycle checkout).
- The unified-job-queue objective (complete, merged `190f9bb4`) shipped the dispatch layer this
  feature plugs into: `jobs` table + kernel, per-kind consumers, ClaimToken write fencing, and an
  executor port. Two problems were deliberately punted to this objective: `task_spec.json` carries
  host-absolute paths, and the worker child writes durable state through its own SQLite handle.

## The architecture fork (resolved)

The design bundles at `docs/40-new-features/10-daytona-sandbox-execution/` (decisions dated
2026-08-13, predating the queue merge) and the queue objective described different architectures:

- Docs: worker agent process stays host-side; the sandbox is a remote command/file surface behind
  the injectable bash-operations seam (`kernel-pi-runner.ts:611`) and the `runCommand` chokepoint.
- Queue objective: a Daytona `WorkerExecutor` adapter submits the whole worker child into the
  sandbox, routed by `execution_class`.

Operator ruling (2026-08-18, interview decision 1): **host agent + remote exec** — the docs'
model. Under it the two punted problems mostly dissolve: the child keeps its host SQLite handle,
ClaimToken, codex-lb (127.0.0.1:2455), and kernel Postgres (127.0.0.1:55432) exactly as today;
`task_spec.json` paths stay host-consumed except `worktree_path`, which becomes a sandbox
workspace reference. The full child I/O map that informed this ruling is in
`02_implementation_scope.md`.

## Verification findings that shape the plan

Verified 2026-08-18 against the shipped system (full session record in the interview transcript):

1. The docs predate the ClaimToken layer. Fenced writes verify a per-job lease that the HOST
   consumer heartbeats (`consumer.ts:126-137`, `worker-state.ts:81-84`, `kernel.ts:204-224`);
   docs speak only of the dispatch lease. Sandbox labels and orphan rules had to be re-anchored
   (decision 5).
2. "Claim creation creates the sandbox" cannot hold: claim creation runs inside a synchronous
   `immediateTransaction` (`worker-job.ts:74-96`). Provisioning moved to `buildWorkerTask`
   (decision 4).
3. The queue reap lane (`reapWorkerJobs`, `worker-job.ts:250-292`) is a recovery path the docs do
   not know about; sandbox deletion must ride it.
4. Image groundwork (`toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/`, committed
   `2b12b637`) is stale: `projects/` -> `games/` rename breaks `build_image_bundle.sh` on first
   `require_file`; the Linux musl objdiff-cli it requires does not exist (only Mach-O arm64 at
   `games/melee/state/tools/objdiff-cli-3.6.1-score/`); objdiff README references retired
   `ORCH_PROJECT_STATE_DIR` (now `ORCH_GAME_STATE_DIR`). Golden wibo exists and is verified:
   `games/melee/state/tools/wibo-1.2.0-opt1/wibo-linux-i686`.
5. Daytona facts the docs missed: default `executeCommand` timeout is 10 s (must always be
   overridden); inactivity auto-stop ignores running background processes; volumes are S3-FUSE
   and slow (drove the MWCC-cache decision 3); standard sandboxes cap at 4 vCPU / 8 GiB / 10 GiB;
   secrets are proxy-substituted headers-only.
6. Everything else load-bearing in the docs checked out: bash seam, `excludeBuiltinTools`
   (`worker-cycle.ts:1579`), `runCommand` (`run-command.ts:12`), jobserver
   (`global-compile-jobserver.ts`), per-epoch ninja slot dirs (`change-validation.ts:319-398`),
   tier quotas, stop billing semantics, warm-pool restrictions.
