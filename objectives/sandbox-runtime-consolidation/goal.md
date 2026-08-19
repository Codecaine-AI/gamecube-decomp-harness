<goal>
- Implement the run-and-sleep + sandbox-only worker runtime specified in
  docs/40-new-features/20-stop-while-thinking/ (operator-confirmed 2026-08-19): sandboxes stop
  while the model thinks, wake on tool calls, and are killed the moment the worker closes;
  the sandbox becomes the ONLY supported worker execution path; knowledge/librarian becomes a
  decoupled host-side lane that never gates settlement or teardown; worker tool-concurrency
  limits, slot mechanisms, and their settings UI are removed.
</goal>

<context_refresh>
- Reread objectives/sandbox-runtime-consolidation/goal.md and current_state.md.
- Reread objectives/sandbox-runtime-consolidation/context/00_problem.md through
  04_validation_and_handoff.md.
- Skim docs/40-new-features/20-stop-while-thinking/doc.json (the design authority) and
  objectives/daytona-sandbox-execution/examples/scale/ (measurements: thinking_time_analysis.md,
  scale_sweep_report.md).
</context_refresh>

<working_strategy>
- Phase-gated per context/03_working_plan.md; each phase lands green (`bun test` from
  apps/server/) before the next starts:
  (1) knowledge-lane decoupling — librarian/absorption never gates job settlement; LLM-call
      timeout (fixes the live hang found in the 32-worker sweep);
  (2) teardown at worker close — host observes worker_state close and deletes immediately;
      reap/reconciliation + platform TTL stay as the net; also fix the zombie-claim heartbeat
      (consumer must verify child liveness);
  (3) sandbox-only workers — remove the local worker execution path outright (repo convention:
      zero backward compat), retire ninja slot dirs, the jobserver wrap on worker builds, worker
      worktree provisioning, and the tool-concurrency limits/slot mechanisms + their UI;
  (4) run-and-sleep engine — stop on model-turn start, start on next tool call, debounce policy
      measured-in; stopped state must never be confused with death by reap/reconciliation;
  (5) live validation — a disposable multi-worker run with sleep active, cost compared against
      the recorded always-run sweep baseline; docs close-out.
- All operator rulings in context/01_constraints.md are binding; deviations need sign-off.
- Never touch production state (games/melee/state, dashboard :8787). Live runs use a disposable
  state dir + the trimmed snapshot, as in the prior objective.
</working_strategy>

<success_metrics>
- P1: settlement latency independent of librarian queue depth; a hung librarian call times out
  without blocking any worker job.
- P2: sandbox.deleted lands within seconds of worker_state close in a live claim; zombie
  heartbeat test passes (dead child => lease lapses => reap).
- P3: suite green with the local worker path deleted; dry-run round-trip works on
  FakeSandboxProvider; no tool-concurrency knobs remain in worker config or UI.
- P4: a live claim shows stop/start cycles in events/spans; sandbox-hours for the claim drop
  roughly in line with the measured ~90% idle share.
- P5: disposable N>=5 run completes with sleep active; measured sandbox cost <= ~30% of the
  always-run baseline per claim (target ~11% per analysis, margin for debounce).
</success_metrics>

<non_goals>
- No fleet autoscaling, warm pools, or epoch-boundary sandbox builds (host epoch build stays).
- No PR/QA lane changes beyond what local-path removal forces.
- No changes to write-fence/ClaimToken authority semantics.
- No new Daytona resource classes or snapshot pipeline changes.
</non_goals>

<completion_criteria>
- All five phase gates recorded PASS in current_state.md with artifacts under examples/.
- Live validation run artifacts include the cost comparison vs the always-run sweep baseline.
- docs/40-new-features/20-stop-while-thinking/ amended to as-built; docs:audit at baseline.
- current_state.md closed out.
</completion_criteria>
</goal>
