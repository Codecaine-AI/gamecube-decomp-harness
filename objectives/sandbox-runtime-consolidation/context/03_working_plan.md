# Working Plan

Phase-gated. Do not start a phase before the prior gate passes and is recorded in
current_state.md. Every phase: `bun test` from apps/server/ green (modulo the known
qa-repair environmental flake) before the gate is called.

## Phase 1 — Knowledge lane decoupling

- Objective: settlement/teardown never wait on knowledge work; librarian calls time out.
- Inputs: run-loop knowledge/librarian call sites; existing knowledge_absorption job kind.
- Process: move librarian condensation + knowledge maintenance off the settlement path into an
  independent host-side lane (job-queue consumers preferred — the kind exists); add per-call
  LLM timeout with logged, non-fatal expiry; fix or document the ledger-path state-dir override
  gap while in the code.
- Outputs: unit tests proving settlement completes with a hung/slow librarian (fake timer);
  timeout coverage.
- Gate: a simulated hung librarian call cannot delay job completion; suite green.
- Failure handling: if decoupling reveals ordering deps (e.g. absorption reads claim rows
  pre-settlement), document and sequence within the lane — never back onto the worker path.

## Phase 2 — Close-time teardown + zombie heartbeat fix

- Objective: sandbox deleted seconds after worker_state close; dead children lose their lease.
- Process: host-observes-close deletion (settlement reason), idempotent vs reap/reconciliation/
  TTL; heartbeat verifies child liveness before renewal.
- Outputs: FakeSandboxProvider tests (close -> immediate delete; job-settlement later is a
  no-op delete); zombie test (kill fake child -> lease lapses -> reap recovers + deletes).
- Gate: both tests green; a dry-run round trip shows deletion timestamped at close, not at
  settlement.
- Failure handling: if close observation needs a new hook in worker-state write paths, keep the
  write-fence/authority semantics untouched (out of scope) — observe, don't extend authority.

## Phase 3 — Sandbox-only workers; limits + UI removal

- Objective: one worker runtime; the local path and its scaffolding are gone.
- Process (reviewable slices): (a) enqueue class -> sandbox everywhere + local branch removal in
  buildWorkerTask/provisioning; (b) ninja slot dirs + worker jobserver wrap retirement;
  (c) tool-concurrency env/slots/UI removal (discovery-driven); (d) deferred host-FS read
  resolutions; (e) test-suite reshaping (local-path tests removed/rewritten deliberately).
- Outputs: suite green with the local path deleted; --dry-run-agents round trip on the fake;
  rg proves no ORCH_WORKER_TOOL_CONCURRENCY / worker-tool-slots / worker localToolPaths remain.
- Gate: all of the above + dashboard builds/serves without the removed settings surface.
- Failure handling: anything that turns out to be load-bearing for non-worker lanes (PR/QA,
  epoch) is left intact and recorded — the removal is worker-scoped.

## Phase 4 — Run-and-sleep engine

- Objective: sandboxes stopped during model turns, woken on tool calls, correctly not-dead.
- Process: provider stop/start; agent-runtime stop-on-model-turn/start-on-tool-call triggers;
  debounce decision from a micro-benchmark (candidates: always-stop vs T-ms silence threshold;
  measure added wall-clock + wake count on a single live claim per candidate); stopped-aware
  liveness in reap/reconciliation/close-watcher; stop/start spans + per-claim stopped-seconds
  and wake-count accounting.
- Outputs: fake-provider lifecycle tests (stop/start ordering, races with close/teardown,
  evidence download vs stop); one live single-claim run per debounce candidate with timings.
- Gate: live claim completes correctly with sleep active; no spurious reap of stopped
  sandboxes; chosen debounce recorded with its measurements.
- Failure handling: platform stop/start latencies far off the measured 0.85 s, or races that
  can't be closed cleanly, go back to the operator before fleet validation.

## Phase 5 — Live validation + close-out

- Objective: prove the cost win at small fleet scale; finish docs.
- Process: disposable run, N>=5 sandbox workers, sleep active, caffeinated host; measure
  sandbox-hours/claim, wakes/claim, added wall-clock; compare against the always-run sweep
  baseline ($0.081/claim, examples/scale/scale_sweep_report.md); verify zero orphans by label
  sweep; amend docs/40-new-features/20-stop-while-thinking/ to as-built (docs:audit stays at
  its pre-existing baseline); close current_state.md.
- Gate: measured cost <= ~30% of always-run baseline per claim (target ~11%); no orphans; docs
  clean; operator review.
- Failure handling: if savings underperform because of debounce losses, record the measured
  curve and return to the operator with options rather than tuning silently.
