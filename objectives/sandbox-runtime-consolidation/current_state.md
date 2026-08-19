<current_state>
<last_updated>2026-08-19</last_updated>

<status>
- SIGNED OFF 2026-08-19: operator launched an execution session against goal.md (launch is the
  sign-off, per precedent). Implementation in progress, phase 1 (knowledge lane decoupling).
- Working-tree note at start: uncommitted prior-session work present (docs system-design reorg;
  process-lifecycle refactor touching run-loop.ts/settle-supervised-run.ts/
  managed-process-controller.ts, babysit.ts deleted). This objective layers on top; commits must
  be scoped deliberately.
</status>

<completed>
- PHASE 5 GATE: PASS (2026-08-19). Fleet-10 disposable run with sleep active (debounce 250 ms):
  10 concurrent claims ignited cleanly; 8 succeeded, 3 hit the 3600 s agent timeout and
  requeued routinely. Cost: billed $0.2558 vs $0.8516 like-for-like always-run = 30.0%
  (gate <= ~30% PASS; replay predicted 28.8%); mean $0.0320/claim = 0.395x the sweep's $0.081
  always-run baseline; 766 wakes. Close-to-delete 2-7 s on every settlement delete (raw event
  pairs); reconciliation swept consumer-less claims incl. a STOPPED orphan; ZERO remote
  sandboxes after the run. Host footprint (operator questions answered, fleet10_report.md):
  fleet processes ~4.6 GB RSS / ~47% of one core / 58 TCP conns; workers 450-700 MB + 0.2-8%
  CPU each; net 6.9/1.1 Mbps mean whole-interface; 8-9 of 10 sandboxes STOPPED during
  thinking; RAM is the binding host dimension (~16-22 GB at 32 workers). Artifacts:
  examples/phase5/{fleet10_report.md,fleet10_cost_report.json,fleet10_footprint.jsonl,
  sleep-run-report.py,footprint-summary.py,host-footprint-sampler.sh}. Docs:
  20-stop-while-thinking amended as-built (debounce decision, measurement contract, wake
  failure rule); docs:audit at pre-existing baseline (10 E6 + 1 W1), docs:links 0 stale.
- PHASE 4 GATE: PASS (2026-08-19, operator accepted wiring-level live proof without waiting for
  the final claim to complete). Unit suite 1120/0. Debounce 250 ms
  (examples/phase4/debounce_decision.md: live bench stop~1.01s/wake-to-exec~1.02s median +
  53-session replay; T=0 raw winner 73.25% but 250 ms protects replay-invisible intra-tool
  gaps for 2.1 pp; projected ~71% savings, ~8% added wall). Live proof: claim 1 SUCCEEDED with
  42 stop/start cycles (stoppedMs 222958/469 s session, 0 transition failures,
  sandbox_sleep_stats.json artifact); sleep cycling observed directly on later claims (STOPPED
  during model turns, STARTING caught mid-wake); teardown proven on all three paths live —
  settlement, provision_failure, reconciliation (including sweeping a STOPPED orphan);
  stopped+live-claim correctly retained. Close-watcher seconds-level delete PROVEN LIVE in the
  fleet-10 run: worker close 20:04:52.672Z -> sandbox.deleted 20:04:56.908Z = 4 s (was 271 s
  via settlement pre-fix).
  Live defects found+fixed this phase: provisioning forced checkout, onPoll stale payload,
  worker-task child linger (SDK timeout handle) → explicit exit.
- PHASE 3 GATE: PASS (2026-08-19). `bun test` 1107 pass / 0 fail (local-path tests deliberately
  removed/rewritten; net -23 vs phase 2); frontend production build + typecheck PASS. Sandbox is
  the only worker runtime: worker enqueue executionClass=sandbox (epochs.ts); local branch of
  buildWorkerTask/WorkerTaskFile/worker-cycle runtime split deleted; provisionWorkerWorktree +
  worker worktree/shell-guard/tool-seeding helpers deleted; localWorkspaceExec deleted and
  WorkspaceExec.executionClass dropped; worker ninja slots deleted (+ toolpack python mirror);
  compile-jobserver wrap removed from sandbox exec/agent-bash (module + host lanes stay);
  tool-concurrency mechanism fully removed (concurrency-config.ts, process-control env
  injection, /api/config gameDefaults, cycle workerConfig snapshot, frontend Tool
  slots UI/types/persistence, toolpack worker_tool_slot incl. the .worker-tool-slots checkdiff
  host-path bug; permuter keeps prior default cap of 1). Deferred host-FS reads resolved via
  sandbox probes: prompt exists-attributes (batched bash -lc existence probe → Set into prompt
  hydration), QA lint --repo → host repoRoot for policy (worker-scoped; scan-diff semantics
  untouched for host lanes), mwcc-debug probe once per session → ToolRuntimeContext boolean.
  Removal scans empty: ORCH_WORKER_TOOL_CONCURRENCY|worker-tool-slots|toolConcurrency|
  ORCH_WORKER_COMPILE_CONCURRENCY, provisionWorkerWorktree|localWorkspaceExec|ninja slots.
  Kernel enqueue default stays "local" (integration/knowledge_absorption/sync_publication are
  host jobs); JobExecutionClass union + DB column stay.
- PHASE 2 GATE: PASS (2026-08-19). `bun test` 1130 pass / 0 fail. Changes: kind-agnostic
  optional `descriptor.onPoll` hook in the job consumer poll loop; worker descriptor onPoll
  observes worker_state close (ended_at + claim closed) and fires deleteSandboxForJob
  (reason "settlement", fire-and-forget, once per job, alreadyDeleted-fenced) within ~1 poll
  tick of close — completion-path delete stays as idempotent backstop; reap/reconciliation
  untouched. Zombie fix: LocalProcessExecutor.poll verifies pid liveness (kill(pid,0),
  ESRCH=dead, EPERM=alive) when exitCode is null; collect() bounded for dead-pid entries
  (synthesizes exitCode 1); #entries leak fixed (removed on collect/cancel). Verified: child
  performs zero sandbox ops after closeWorkerState. Tests: close→delete-before-completion,
  active-claim no-delete, zombie no-heartbeat + fail path, executor entry cleanup.
- PHASE 1 GATE: PASS (2026-08-19). `bun test` 1126 pass / 0 fail (baseline was 1123; +3 new
  tests). Changes: librarian LLM call bounded (600 s default when --agent-timeout-seconds
  unset/0; hard Promise.race in kgLibrarianCondense since kernel timeoutMs is only a
  cooperative session.abort with no independent deadline); injectable runner DI seam;
  stopBackgroundKnowledge bounded (15 s default, abandoned jobs recovered via lease expiry +
  catchUpBackgroundKnowledge); run-loop finally uses bounded stop; ledger env-override caveat
  documented in ledger.ts. Investigations: settlement never structurally awaited knowledge
  (absorption already on its own inline consumer); librarian's second StateStore holds no
  transaction across the model call. Tests: hung-runner timeout (librarian.test.ts),
  hung-processor bounded shutdown (background.test.ts), hung-knowledge-doesn't-block-settlement
  (worker-job.test.ts).
- Design authority finished and committed: docs/40-new-features/20-stop-while-thinking/
  (lifecycle, placement map, sandbox-only consequences, tool-concurrency/UI removal,
  supersession of the run-scoped ruling recorded in 10-execution-boundary).
- Evidence base committed: objectives/daytona-sandbox-execution/examples/scale/
  (thinking_time_analysis.md — ~90% model-idle, 89% savings / 7.8% overhead;
  scale_sweep_report.md — N=5/10/32 rungs, costs, and the two live loop defects).
- Prior-objective seams available: SandboxProvider/Fake, sandbox-lifecycle teardown,
  workspace-exec routing, per-attempt evidence download, trimmed snapshot
  melee-sandbox-poc-20260818-trimmed ACTIVE at class 2/4/5.
</completed>

<status_addendum>
- OBJECTIVE COMPLETE 2026-08-19 pending final suite tally + operator review. All five phase
  gates PASS (recorded below). Working tree uncommitted (layered over the prior session's
  docs-reorg + process-lifecycle changes); commit split is an operator decision.
- No active runs: fleet loop exited, run 0966f77f auto-paused, zero remote sandboxes, sampler
  stopped. Disposable state preserved at /tmp/sleep-validation-state for inspection.
</status_addendum>

<in_progress>
- (historical) Phase 4: unit portion COMPLETE and green (1120 pass / 0 fail) — SandboxHandle stop()/start()
  (Daytona SDK w/ explicit 60 s timeouts; Fake stateful with tripwires), sandbox-sleep.ts
  idle-debounce controller (started/stopPending/stopping/stopped/starting/closed; shared
  starts; one bounded start retry; stats incl. stoppedMs of completed intervals), wired in
  worker-cycle around the single provider.get acquisition, task-spec fields sandbox_sleep +
  sandbox_sleep_debounce_ms (run-loop flags --no-sandbox-sleep / --sandbox-sleep-debounce-ms,
  default 1000 ms placeholder), stats artifact sandbox_sleep_stats.json at close;
  reconciliation keeps stopped+live-claim (regression test).
- Phase 4 live portion: debounce DECIDED at 250 ms (examples/phase4/debounce_decision.md;
  method deviation recorded: recorded-session replay over 53 sweep sessions parameterized by a
  live 10-cycle stop/start bench — stop complete median 1014 ms, start 561 ms,
  start-to-first-exec 1022 ms — instead of per-candidate live claims; T=0 wins raw replay at
  73.25% savings but inter-burst gaps never < 1.97 s while intra-tool ms-gaps are invisible to
  the replay, so 250 ms protects them for 2.1 pp).
- First live claim WITH sleep: SUCCEEDED, 42 stop/start cycles, stoppedMs 222958 of a 469 s
  session, 0 stop/start failures, zero orphans; reconciliation correctly kept the
  stopped/live-claim sandbox. TWO LIVE DEFECTS found and fixed (Codex, tests green):
  (a) close-watcher onPoll used the claim-time job record whose payload predates sandbox_id
  attachment → guard bailed every tick, deletion only at settlement (worker close 18:17:23Z,
  delete 18:21:54Z); fix: re-read payload_json from DB in onPoll; regression test added.
  (b) worker-task child lingered ~4m17s after closeWorkerState — leaked Daytona-SDK exec-timeout
  handle kept bun's event loop alive, delaying settlement; fix: explicit process.exit for the
  worker-task command after kernel-runtime close.
  ALSO fixed live: sandbox provisioning detached checkout now uses --force (baked image carries
  a dirty tracked configure.py; claim identity is baseRev; untracked tools preserved).
  Operator-error note: re-activating the run while a prior run-loop still held in-flight work
  caused a lease overlap — never reactivate while a loop is draining.
- Clean validation claim re-run IN FLIGHT (state dir /tmp/sleep-validation-state, run
  0966f77f-…, log /tmp/sleep-validation-runloop2.log, caffeinated, --max-iterations 2).
</in_progress>

<next_actions>
- Run sleep-latency bench (live Daytona, label poc=sleep-bench) + debounce replay; choose T;
  set default in code; one live single-claim validation run (disposable state, caffeinated,
  ORCH_GAME_KNOWLEDGE_ROOT set); record phase 4 gate; then phase 5 fleet run.
</next_actions>

<risks_or_open_questions>
- Live-run findings (2026-08-19, phase 4 validation setup): (1) PRE-EXISTING bug —
  startingKnowledgeRevision (runs.ts) opens graph.sqlite readonly; bun:sqlite fails with
  "unable to open database file" on a fresh WAL-mode copy without -shm/-wal sidecars (any
  read-write open first fixes it); surfaced by init-run on a fresh `.backup` graph copy.
  (2) Cloned knowledge root breaks kg pr_index (build_pr_postmortems.py ModuleNotFoundError
  'source_index' under the clone) — non-fatal knowledge-lane error only, workers unaffected.
  (3) The prior session's uncommitted settleRunOnExit pauses the run whenever run-loop exits;
  poc-activate re-activation issues a fresh lease. (4) --max-iterations counts loop
  iterations, not claims; an admission pass consumes one.
- Debounce policy for stop-while-thinking is deliberately undecided; phase 4 decides it with a
  micro-benchmark (mean model turn 10.8 s vs ~1.5 s stop+start round trip).
- Local-path removal reshapes the test suite; phase 3 budget includes deliberate test rewrites.
- Snapshot two-week deactivation clock: melee-sandbox-poc-20260818-trimmed last used 2026-08-19;
  reactivate/re-push if phase 5 slips past ~2026-09-02.
- Knowledge-lane decoupling may surface ordering dependencies (absorption reading pre-settlement
  rows); phase 1 failure handling covers it.
</risks_or_open_questions>

<important_paths>
- docs/40-new-features/20-stop-while-thinking/doc.json — design authority.
- objectives/daytona-sandbox-execution/examples/scale/ — measurements + sweep findings.
- objectives/daytona-sandbox-execution/examples/phase3/poc-{activate,release}.ts — live-run
  helpers.
- apps/server/src/core/job-queue/{sandbox.ts,sandbox-events.ts,sandbox-lifecycle.ts,
  provisioning.ts} and .../workers/{worker-job.ts,worker-cycle.ts} — the seams this objective
  edits.
</important_paths>
</current_state>
