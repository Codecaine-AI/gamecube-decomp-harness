<current_state>
<last_updated>2026-08-19</last_updated>

<status>
- Bundle authored 2026-08-19 from the operator's runtime-placement rulings and the completed
  daytona-sandbox-execution objective + scale sweep. NOT signed off.
- Implementation starts when the operator launches an execution session against this bundle's
  goal.md (that launch is the sign-off, per precedent).
</status>

<completed>
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

<in_progress>
- None. Awaiting operator review + launch.
</in_progress>

<next_actions>
- Ford: review this bundle (esp. context/01_constraints.md rulings and the phase gates in
  context/03_working_plan.md); amend or launch a session against goal.md to begin phase 1.
</next_actions>

<risks_or_open_questions>
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
