# Orchestration prompt — unified job queue build-out

Copy everything below the line into a fresh Claude Code session at the repo root.
Launching this prompt constitutes the phase-0 sign-off.

---

Execute the unified-job-queue objective in this repo. The execution contract is
`objectives/unified-job-queue/` — read `goal.md`, `current_state.md`, and `context/00` through
`context/04` before doing anything. Phase 0 (design lock) is signed off; start at phase 1 and
work through phase 5 in order, honoring every gate in `context/03_working_plan.md`.

## Delegation rules (hard)

- You are the orchestrator: plan, decompose, spec, review, integrate, own the gates. Every file
  edit — code, tests, schema, docs — is produced by Codex, never by you or a Claude worker:
  `codex exec -m gpt-5.6-sol -c model_reasoning_effort="low" --enable fast_mode "<prompt>"`
- Run codex invocations via background Bash with `</dev/null` and `-s workspace-write`. Run
  independent invocations in parallel, but NEVER two codex agents in the same worktree — give
  parallel workers disjoint file lists, or separate git worktrees.
- Default effort is `low` for everything. Escalate a slice to `xhigh` only after a `low` attempt
  fails your review (expected escalation candidates: the run-loop restage and worker-cycle
  restage in phase 2, steps 4–5).
- Every codex prompt must contain: (1) the relevant excerpts of
  `context/02_implementation_scope.md` and `context/03_working_plan.md` pasted inline, (2) an
  explicit file allowlist with "do not touch files outside this list", (3) the instruction
  "use sub-agents / parallel execution internally wherever the work splits — optimize for
  wall-clock speed", and (4) the repo test command for its slice.
- Review every codex diff yourself before accepting. Reject and re-spec rather than hand-patching.
  Track which codex invocation produced which changes.

## Phase execution

**Phase 1 — kernel (three parallel codex workers, disjoint files):**
- A: `jobs` table into `apps/server/src/core/orchestrator-state/storage/migrations/final-schema.ts`
  (DDL verbatim from context/02), update `baseline.test.ts`, fix the `/tmp/purge-compat-apply.js`
  error text in `migrations/index.ts`.
- B: `core/job-queue/{kernel,types,descriptor}.ts` + `kernel.test.ts` covering all 8 kernel
  invariants in `context/04_validation_and_handoff.md`. Pattern donor:
  `core/knowledge/background/index.ts` (claim/CAS/lease/backoff shape).
- C: `core/job-queue/{consumer,executor,provisioning}.ts` + tests — consumer pool, executor
  port, LocalProcessExecutor extracted from `run-loop.ts:721-821`, provisioning extracted from
  `worker-cycle.ts:1480-1558`. Extraction only: run-loop/worker-cycle keep working unchanged.
- Gate: full `bun test apps/server` green. Update `current_state.md`. Commit `job-queue: phase 1`.

**Phase 2 — workers on the kernel + ClaimToken fence (branch `job-queue/phase-2`):**
Follow context/03 §Phase 2 steps 2–6 in order; one codex invocation per step, parallel only
where file sets are disjoint (step 6's leaseId sweep parallelizes by directory). After each
step: run the slice's tests + your own diff review.
- Gate (a): full `bun test apps/server` green plus new run-loop/consumer/boundary tests.
- Gate (b): STOP. The live-run soak (checklist in context/04) requires Ford to schedule and
  supervise it — report readiness and wait. Do not start a run, touch any live
  `orchestrator.sqlite`/state dir, or merge the branch without Ford's explicit go.

**Phase 3 — knowledge absorption kind** (after 2): per context/03; delete the bespoke
claim/CAS/poller, keep processor logic + digest idempotency. Gate: tests green.

**Phase 4 — sync + integration kinds, schema cleanup** (can interleave with 3): per context/03;
includes dropping the six dead tables and (if under a day) the drizzle mirror. Gate: tests green
+ the greps in context/04 come back empty.

**Phase 5 — docs**: rewrite the doc.json bundles listed in context/03 §Phase 5 via codex, in
design-narrative prose (what/where/why, no atomized bullets). Gate: Ford reviews.

## Standing rules

- Update `objectives/unified-job-queue/current_state.md` at every gate and before any handoff.
- Commits only at phase gates, message prefix `job-queue:`; phase 2+ on its branch. Ask Ford
  before committing to main or merging.
- If codex is unavailable (not installed, auth failure), stop and report — do not fall back to
  direct implementation.
- If tests fail at a gate, report the failure output honestly and fix forward via codex; never
  skip a gate.
