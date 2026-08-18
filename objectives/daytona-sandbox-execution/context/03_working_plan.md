# Working Plan

Phase-gated. Do not start a phase before the prior gate passes and is recorded in
current_state.md. Implementation begins only after operator sign-off on this bundle.

## Phase 0 — Groundwork repair

- Objective: make the committed image groundwork buildable on the current tree.
- Inputs: `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/{MANIFEST.md,
  build_image_bundle.sh}`, objdiff score-fork sources, `games/melee/state/tools/`.
- Process: fix `projects/` -> `games/` paths in both files; amend MANIFEST cache section
  (decision 3: baked-warm cache, sandbox-local `MWCC_CACHE_DIR`, drop the volume mandate) and its
  shallow-clone-at-baked-rev requirement (decision 2); build the musl objdiff-cli
  (`cargo build --release --target x86_64-unknown-linux-musl`, cross-compiled or in a Linux
  container) and place it where the bundle script expects; fix `ORCH_PROJECT_STATE_DIR` ->
  `ORCH_GAME_STATE_DIR` in the objdiff README.
- Outputs: passing `build_image_bundle.sh` run producing the `.tar.zst` bundle + SHA-256s;
  updated MANIFEST.md.
- Gate: bundle builds cleanly; MANIFEST acceptance checks runnable locally (Linux container) all
  pass, including the networking-disabled one-TU rebuild + objdiff READY score.
- Failure handling: if the musl objdiff build fights the score-fork patch, fall back to a static
  glibc build and record the deviation; if acceptance checks fail on wibo, stop — that
  invalidates phase 1's premise and goes back to the operator.

## Phase 1 — Bake and platform experiment (bake-and-time)

- Objective: answer the four platform unknowns before any harness code exists.
- Inputs: phase 0 bundle; Daytona account (API key host-side in `local.env`); design bundle 70's
  experiment spec.
- Process: register the image as a Daytona snapshot (linux/amd64; CLI push or declarative
  builder from the bundle); scripted round trip with pure SDK calls — create (2 vCPU/4 GiB/5 GiB,
  labels stamped, TTL set) -> push seed bundle -> fetch/checkout base rev -> one-TU incremental
  ninja build -> objdiff score -> download verdict + diff -> delete — timing every step with
  explicit exec timeouts and session-based execution for the build.
- Outputs: `objectives/daytona-sandbox-execution/examples/poc_timings.json` (create, upload,
  checkout, build, score, download, delete, stop->start wake); byte-identity comparison of the
  sandbox-built .o against the local golden build; uncompressed image size vs the 10 GiB cap.
- Gate (falsification-first): MWCC-under-wibo runs on the runner kernel and the .o is
  byte-identical; image fits the cap with headroom for build state; exec RTT compatible with
  tool-loop use. Wake latency is recorded but does not gate (informs the deferred
  stop-while-thinking phase).
- Failure handling: wibo failure (32-bit exec unsupported or behavioral divergence) halts the
  objective for an operator decision (candidate fallbacks: Linux VM class instead of container,
  qemu-user, upstream wibo variants); cap overflow -> trim image layers per MANIFEST priorities.

## Phase 2 — Harness seams

- Objective: sandbox-class claims execute through the harness with the local path untouched.
- Inputs: phase 1 measurements; seam map in `02_implementation_scope.md`; locked decisions 4-9, 11.
- Process (reviewable slices, each `bun test` green from `apps/server/`):
  1. Daytona client wrapper + `sandbox.*` game events + config knobs (resource class, API key).
  2. `provisionSandboxWorkspace()` in provisioning.ts, branched in `buildWorkerTask` on
     `executionClass`; sandbox ref into `task_spec.json`; labels per decision 5.
  3. `sandboxBashOperations(claim)` + file-tool re-registration; worker-scoped `runCommand`
     routing; jobserver token acquisition wrapping remote build exec.
  4. Validation path: remote build/score, per-attempt diff/patch download into `artifact_dir`
     (decision 6), in-sandbox canonical-tool-path verification.
  5. Corpus-tool audit + fetch-first shims (decision 11); `m2c_decompile` first.
  6. Reaping: sandbox deletion in `reapWorkerJobs`, claim settlement, and startup reconciliation
     keyed on job leaseId (decision 5).
- Outputs: unit tests per slice (executor-style fakes for the SDK wrapper); a dry-run-agents
  sandbox-class worker completing against a fake sandbox.
- Gate: full suite green; a `--dry-run-agents` sandbox-class job round-trips through claim ->
  provision -> child -> close -> reap with the fake; zero behavior change for `local`-class jobs
  (existing tests are the regression net).
- Failure handling: slices are independently revertable; any fence/authority change discovered to
  be necessary goes back to the operator (touching worker-state.ts authority semantics is out of
  scope).

## Phase 3 — Live one-worker PoC

- Objective: one real worker claim end-to-end on a sandbox, on a disposable test run.
- Inputs: phase 2 harness; phase 1 snapshot; a disposable state dir + test run config (never
  `games/melee/state`).
- Process: start a run with worker concurrency 1 and execution_class sandbox for one admitted
  target; let the worker run a full claim (agent session host-side, all exec/files remote);
  observe checkpoint recording, close, integration outcome, knowledge job, sandbox deletion.
- Outputs: run artifacts + `examples/live_poc_report.md` — timings, evidence paths, `sandbox.*`
  event trail, and a parity comparison against a local-execution worker on the same target
  (checkpoint score, patch shape, evidence completeness).
- Gate: claim settles cleanly; patch integrates (or conflicts route normally); sandbox deleted at
  settlement (verified by list-by-label); no orphan sandboxes after run end; parity evidence
  recorded.
- Failure handling: mid-claim sandbox death must be observed to fail safe (claim recovery +
  requeue + no dangling sandbox) — if it does not, fix before calling the gate; PoC re-runs are
  cheap by design.

## Phase 4 — Docs amendments and close-out

- Objective: design bundles and MANIFEST reflect what was built and decided.
- Process: amend bundle 30 (ClaimToken layer, provisioning point, reap lane), bundle 50
  (`sandbox.*` events decision), bundle 20 + MANIFEST (cache, paths); add the snapshot keepalive
  step to the runbook; write the stop-while-thinking follow-up as a named future objective seed
  with the phase 1 wake-latency number attached; close out current_state.md.
- Gate: doc.json referential-integrity checks pass; operator review.
