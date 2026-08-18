# Constraints

## Operator-locked decisions (interview, 2026-08-18)

All eleven are binding. Deviating from any of them requires explicit operator sign-off first.

1. **Architecture: host agent + remote exec.** The worker child stays a local process (own
   SQLite handle, ClaimToken, codex-lb, kernel Postgres, telemetry — all unchanged). The sandbox
   replaces only the workspace and command execution, reached via a `sandboxBashOperations(claim)`
   implementation of the injectable bash-operations seam and sandbox routing inside worker-scoped
   `runCommand` call sites. The `WorkerExecutor` port stays `LocalProcessExecutor` for the child;
   `execution_class: "sandbox"` routes provisioning and command execution, not process placement.
   Rationale: CPU scale-out without solving the six-item host-coupling surface; per-call latency
   accepted.
2. **Workspace delivery: image + git-bundle seed.** Baked game image with a fully-built tree at a
   pinned revision; per-claim seed = git bundle (image baked rev -> claim base rev) + the three
   report artifacts (`report.json`, `baseline.json`, `report_changes.json`) + per-session env.
   The image repo must be a shallow clone at the baked rev with real SHAs so bundles fetch
   cleanly. Periodic re-bakes as head drifts.
3. **MWCC cache: baked warm + sandbox-local.** Pre-warm the object cache at image bake (the full
   build populates it); `MWCC_CACHE_DIR` points at sandbox-local disk. No persistent volume
   (S3-FUSE latency on the hottest path). MANIFEST.md must be amended (it currently mandates a
   volume).
4. **Provisioning lives in `buildWorkerTask`.** A `provisionSandboxWorkspace()` beside
   `provisionWorkerWorktree()` in `core/job-queue/provisioning.ts`, selected by
   `job.executionClass`. Host creates the sandbox, stamps labels, pushes the seed, writes the
   sandbox reference into `task_spec.json` (replacing `worktree_path` for sandbox claims), then
   spawns the local child. Provisioning failure = job failure with existing backoff/requeue.
5. **Orphan authority: job ClaimToken `leaseId`.** A sandbox is live only while its labeled job
   leaseId matches the jobs row's current unexpired lease (same predicate as the write fence,
   `kernel.ts:204-215`). All ids get stamped as labels regardless: game_id, run_id, claim_id,
   job_id, job lease_id, dispatch lease_id, worker_state_id, trace_id. Dispatch lease and claim
   status are secondary sweep keys for startup reconciliation.
6. **Evidence hand-back: per attempt, contract unchanged.** Each attempt's write-set diff and
   each checkpoint's patch download into the host `artifact_dir` when produced; checkpoint
   `patch_path`/`diff_path` semantics stay byte-identical to local execution; integration is
   untouched. Build outputs stay in the sandbox. Evidence survives sandbox loss mid-claim.
7. **Idle policy: always-run in v1.** Sandbox runs for the claim's whole life; wall-clock TTL set
   past the claim deadline as backstop; platform inactivity auto-stop disabled. Stop-while-
   thinking is a follow-up phase gated on the PoC's measured stop->start wake latency.
8. **Events: mint `sandbox.*` game events.** Durable lifecycle events (created/deleted, plus
   reap-path deletions) in `game_events` alongside the `job.*` family — a deliberate deviation
   from design bundle 50's "no new event kinds" ruling; amend that bundle. Per-operation exec and
   file-transfer latency still traces as spans under the worker state's `trace_id` (correlation =
   owning workflow, causation = triggering call). Sandbox id also persists on the job payload via
   `attachJobPayload`.
9. **Sizing: 2 vCPU / 4 GiB / 5 GiB default, configurable.** Expose the resource class as a
   config knob (game/runtime options) so it can be raised without code changes.
10. **PoC staging: experiment, then live worker.** Phase-gated: bake-and-time platform experiment
    (pure SDK, zero harness integration) answers the four unknowns first — wibo-i686-on-runner is
    the falsification gate — then the harness seams, then one live worker claim end-to-end on a
    disposable test run.
11. **Corpus tools: fetch inputs first.** Corpus-backed tools that read workspace files
    (`m2c_decompile` and whatever the audit finds) stay host-side; their wrappers download the
    specific workspace files a call needs into a host temp mirror before running. Each tool gets
    audited during phase 2 for actual read paths. Build-coupled toolpack scripts run sandbox-side
    from the image (per design bundle 20).

## Residual defaults (plan-resolved; operator may override)

- Canonical tool-path verification moves in-sandbox: provisioning acceptance runs the check via
  exec instead of host-side stat (host verification would misreport, per design bundle 70).
- Stale ClaimToken remains fatal to the child, matching shipped behavior (`kernel.ts:213`); no
  retry protocol added.
- Snapshot two-week deactivation: the runbook gets a keepalive/reactivation step (phase 4).
- Epoch-boundary full report build stays on the host, unchanged (per design bundle 70).
- Fleet compile admission: host jobserver token acquisition (`ORCH_GLOBAL_COMPILE_SLOTS` FIFO)
  wraps remote exec of build commands — valid because the acquiring process is host-side under
  decision 1. Per-epoch `.worker-ninja-slots` dirs retire for sandbox-class claims only.

## Environment and process constraints

- Never touch live state: `games/melee/state`, dashboard on :8787 is production. PoC uses a
  disposable state dir and test run.
- Run `bun test` from `apps/server/` (repo-root scans EMFILE on the game trees).
- Docs amendments owed by this objective: design bundle 30 (ClaimToken layer, provisioning point,
  reap lane), bundle 50 (`sandbox.*` events), bundle 20 + MANIFEST.md (cache placement,
  `games/` paths, `ORCH_GAME_STATE_DIR`).
- Daytona operational hard rules learned in verification: always pass an explicit exec timeout
  (default is 10 s); never rely on inactivity auto-stop (ignores background processes); local
  snapshot pushes must be linux/amd64; no secrets, corpora, or model access in any image layer.
