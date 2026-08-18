# Daytona Sandbox Execution

Move worker-claim command execution and workspaces into per-claim Daytona sandboxes, with the
worker agent process and all authority/state staying host-side. Ends at a live one-worker PoC.

- `goal.md` — objective contract (pseudo-XML, /goal-compatible).
- `current_state.md` — resume point; check sign-off status before doing anything.
- `context/00_problem.md` — why, plus the 2026-08-18 verification findings.
- `context/01_constraints.md` — the eleven operator-locked decisions. Binding.
- `context/02_implementation_scope.md` — seam map with file:line references.
- `context/03_working_plan.md` — phases 0-4 with gates.
- `context/04_validation_and_handoff.md` — commands, artifacts, safety rules.

Related: `objectives/unified-job-queue/` (shipped dispatch layer this builds on),
`docs/40-new-features/10-daytona-sandbox-execution/` (design bundles; older than the interview —
where they disagree with `context/01_constraints.md`, the constraints win).
