# Implementation Scope

All paths under apps/server/src unless noted. Anchors verified 2026-08-18/19 during the prior
objective; re-verify line numbers before editing.

## Seams that already exist (build on, do not redesign)

- SandboxProvider/SandboxHandle + DaytonaSandboxProvider + FakeSandboxProvider:
  core/job-queue/sandbox.ts. Lifecycle events: sandbox-events.ts. Teardown paths:
  core/job-queue/sandbox-lifecycle.ts (settlement/reap/reconciliation, shared write-fence
  predicate from kernel.ts).
- Provisioning: provisionSandboxWorkspace in core/job-queue/provisioning.ts, branched in
  buildWorkerTask (core/cycle-runtime/phases/running/workers/worker-job.ts).
- Exec routing: infrastructure/shell/workspace-exec.ts (local/sandbox WorkspaceExec),
  sandbox agent tools in infrastructure/agent-runtime/sandbox-agent-tools.ts, host-safe cwd in
  worker-cycle.ts (artifact_dir/host-cwd).
- Evidence: per-attempt download already keeps everything needed on the host at close.

## Phase 1 — knowledge lane decoupling

- Run-loop: knowledge maintenance + kg-librarian-condense currently execute inside the loop
  (core/cycle-runtime/phases/running/scheduler/run-loop.ts; look for knowledge_maintenance /
  librarian invocations) and serialize against job completion processing. Move to an
  independent lane: either the existing job-queue (knowledge_absorption consumers already
  exist) or a detached worker pool; settlement must not await it.
- Add a per-call LLM timeout to the librarian invocation (the sweep saw one call hang >25 min).
- The librarian writes: knowledge_librarian output dirs under the state dir + the game ledger
  (games/<game>/knowledge/ledger/learnings.jsonl). NOTE: ledger path does not respect state-dir
  overrides (observed in the PoC) — fix or document while in here.

## Phase 2 — close-time teardown + zombie fix

- Host-observes-close: the consumer (worker-job.ts completion path or a watcher on
  worker_state.ended_at) deletes the sandbox as soon as the child's worker_state closes,
  emitting sandbox.deleted(reason=settlement) — do not wait for onWorkerJobComplete/knowledge.
- Zombie heartbeat: heartbeatJob currently renews the lease unconditionally while the consumer
  process lives; verify child liveness (executor handle) before renewing so a dead child lets
  the lease lapse and reapWorkerJobs recovers the claim.

## Phase 3 — sandbox-only workers + limits/UI removal

- Enqueue: core/cycle-runtime/run-state/epochs.ts (~:500) hardcodes executionClass "local" —
  becomes "sandbox". kernel.ts enqueue default likewise.
- Remove the local worker branch in buildWorkerTask + provisionWorkerWorktree's worker-path
  usage (worktree creation, state-tools seeding, orig symlinks for workers). Epoch worktree
  provisioning is separate and stays.
- Retire per-epoch ninja slot dirs (core/agent-catalog/agents/running/worker/
  change-validation.ts) and the jobserver token wrap around sandbox builds
  (infrastructure/shell/global-compile-jobserver.ts call sites in the worker path). The
  jobserver itself remains for host builds.
- Tool-concurrency removal: ORCH_WORKER_TOOL_CONCURRENCY* env handling, the tool-slot
  mechanism (the /…/.worker-tool-slots scheme — also the source of the checkdiff
  host/remote-path bug found in the PoC), and the dashboard/settings UI that configures
  per-worker tool limits (process-control API toolConcurrency input,
  phases/running/process-control/runtime.ts, and the UI surface that posts it). Discovery
  required: rg ORCH_WORKER_TOOL_CONCURRENCY, toolConcurrency, worker-tool-slots.
- Sweep the three deferred host-FS reads from phase 2 of the prior objective (prompt
  exists-attributes, QA scanner --repo policy, MWCC-debug capability probe) — with local gone,
  each needs a real answer, not a fallback.

## Phase 4 — run-and-sleep engine

- SandboxHandle grows stop()/start() (SDK: sandbox.stop(timeout)/start(timeout)); Fake mirrors.
- Stop trigger: the agent-runtime knows when a model turn begins (after the last tool result is
  submitted / before awaiting the model stream — kernel-pi-runner / pi-agent seam). Start
  trigger: first tool call needing exec/fs. Debounce: skip stop when the turn is predicted
  short; simplest v1 = stop only after T ms of model silence (T configurable, default from
  measurements) or stop always and accept 0.85 s wakes — decide in-phase with a micro-benchmark.
- Stopped != dead: reconciliation/reap and the phase-2 close-watcher must treat STOPPED
  sandboxes with a live claim as healthy; liveness checks route through provider state, not
  exec success.
- Events/spans: record stop/start as spans under the worker trace (no new event kinds needed);
  count wakes + stopped-seconds per claim for the cost report.

## Phase 5 — live validation

- Disposable run, N>=5, sleep active; compare sandbox-hours/claim against the always-run sweep
  baselines (examples/scale/scale_sweep_report.md: $0.081/claim at ~1756 s mean lifetime).
  Reuse the prior objective's run recipe + helpers.
