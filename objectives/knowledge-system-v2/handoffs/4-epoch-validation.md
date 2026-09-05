# Thread 4 — Validate the live librarian loop end to end, as if running an epoch

Repo: `~/Github Repos/Codecaine/gamecube-decomp-harness`. Read `AGENTS.md` first. This runs AFTER
threads 2 (consumer lane + pilot) and 3 (backfill) have landed — confirm with `git log` and
`git status` and coordinate around anything still in flight; never commit without my go. Run
`bun test` from `apps/server`, NEVER from the repo root. Fixes go through `codex exec …
"<inline prompt>" < /dev/null` (low effort); if codex stalls, fix directly with a Fable subagent.

## What "as if running an epoch" means here
The V2 loop has every link built; nobody has yet run them as one chain. Prove this sequence on real
machinery with sample data, and validate every call site the chain touches:

1. A worker run closes → the worker-summarizer job (`--worker-summary` flag) writes the
   `worker_run` + `submission` rows and `run_narrative`, advances the attempt watermark, enqueues a
   `run_closed` index task (`apps/server/src/core/knowledge-v2/summarizer-job/`).
2. The librarian consumer lane (`--librarian-consumer` flag, built by thread 2) claims the task,
   assembles the run_closed context, spawns librarian-v2, applies the proposal through the validated
   apply layer, stamps `subject_index_state`, completes the task.
3. The next worker on that target (or a neighbour) receives the V2 knowledge card
   (`apps/server/src/core/knowledge-v2/card.ts`, injected in
   `core/cycle-runtime/phases/running/workers/worker-cycle.ts` / `agents/running/worker/context.ts`)
   showing the new facts with confidence, inferred names marked as guesses, ledger first.
4. The sync phase lands a PR / Discord export / wiki sync → importers enqueue `pr_imported` /
   `archival_ingest` (chunked ≤40 messages) → the consumer drains them.
5. A boundary regression inserts an `event` + `regression` task; a new report revision triggers
   reconciliation + `drift_recheck` → both consumed (fixtures are fine for these two; they have no
   live producer yet — report what IS wired and what isn't).

## How to run it
- Use a disposable run/state dir, not the live `melee-live` process, unless I say otherwise.
  Ask me at the start which: a dev run against the real store with both flags on, or the live run.
- Drive each step with real commands (job-runner arms, the run loop with the flags, the CLIs), and
  verify each hand-off by querying the store read-only after it: rows written, tasks claimed and
  completed, stamps set, the card rendered. Capture artifacts at every step.
- Inventory and exercise every call site/flow the librarian participates in: run-loop lanes (both
  flags on and off — off must be provably zero-footprint), job-runner arms (`kg2-*`), the dashboard
  agents view (`GET /api/kernel/agents` renders 4 agents warning-free with real previews), the
  kv2 tool roster (each of the 10 librarian tools invoked at least once against real data), the
  apply layer's rejection paths (feed a proposal with an out-of-scope fact, a bad locator, a 1.0
  confidence — verify reject/clamp), the kill switches, and dry-run modes.

## Then retire the last legacy worker surfaces
Once V2 facts exist for real targets: remove `ledger_search` from the worker profile
(`apps/server/src/core/tools/profiles/defaults.ts`) and stop injecting the old graph card where the
V2 card is present, per the worklist's "retires at migration" note — with tests, and with a
before/after of what a worker actually receives.

## Definition of done
A written validation report: each step above with the command run, the store evidence, and
pass/fail; every gap found either fixed (tests green from `apps/server`, typecheck no new errors)
or listed with a cause; the legacy worker surfaces retired; worklist updated by hand (never codex).
Commit only when I say.
