# Validation and Handoff

## Validation commands

- Test suite: `cd apps/server && bun test` (never repo root — EMFILE). Known environmental
  flake: qa-repair.test.ts 5 s timeout (pre-existing; not a signal).
- Docs: `bun run docs:audit` (baseline: exactly 10 pre-existing E6 errors in 10-system-design,
  1 W1 warning) and `bun run docs:links` (0 stale).
- Removal proofs (phase 3): `rg -n "ORCH_WORKER_TOOL_CONCURRENCY|worker-tool-slots"` returns
  nothing in apps/server/src; `rg -n "executionClass.*local"` shows no worker enqueue path.
- Orphan check after any live run: `daytona sandbox list` filtered by labels must be empty when
  no claims are active. Stopped-with-live-claim is healthy; anything else is a bug.

## Live-run recipe (disposable, from the prior objective)

- State dir: fresh /tmp dir (orchestrator.sqlite self-initializes). Repo root: a disposable
  tree copy, never games/melee/checkout for repo-mutating flows. Private graph.sqlite via
  `sqlite3 <src> ".backup <dst>"`. Sandbox config: games/melee/local.game.json (snapshot
  melee-sandbox-poc-20260818-trimmed, baked rev 1e28b420..., class 2/4/5).
- Activation is API-only: helpers preserved at
  objectives/daytona-sandbox-execution/examples/phase3/poc-{activate,release}.ts (run from
  apps/server/ cwd). run-loop needs --lease-id; use --no-start-epoch for bounded experiments;
  wrap in caffeinate.
- Monitor pattern: poll orchestrator.sqlite jobs/game_events + run-loop log for error
  signatures; terminal condition on all jobs settled.

## Required artifacts (under objectives/sandbox-runtime-consolidation/examples/)

- phase4/: debounce micro-benchmark results (per-candidate: wakes, stopped-seconds, added
  wall-clock) and the chosen policy.
- phase5/: validation-run report — per-claim sandbox-seconds (running vs stopped), wakes,
  cost/claim vs the $0.081 always-run baseline, orphan sweep result, sandbox.* event trail.
- Gate verdicts recorded in current_state.md per phase, with deviations flagged.

## Hard safety rules

- games/melee/state and the :8787 dashboard are production — read-only, always.
- DAYTONA_API_KEY stays host-side (local.env); never in images, seeds, or sandbox env.
- Every sandbox exec passes an explicit timeout; every sandbox is created with wall-clock TTL
  past the claim deadline; platform inactivity auto-stop stays disabled (stops are OUR calls).
- Live experiment sandboxes carry a distinguishing label; sweeps key on it.

## Handoff rules

- Update current_state.md at each phase gate (verdict, artifact paths, deviations).
- The operator rulings in context/01_constraints.md travel with this bundle; do not re-derive
  from older docs (the 2026-08-18 run-scoped ruling is superseded).
- If a live run is in flight at handoff, record in <active_runs>: run id, lease id, state dir,
  loop pid/log path, monitor state, and the safe next action (usually: let claims settle, then
  poc-release the lease).
- Implementation starts when the operator launches an execution session against this goal.md
  (recorded in current_state.md as sign-off, per the prior objective's precedent).
