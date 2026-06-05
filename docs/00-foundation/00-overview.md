---
covers: D-Comp Orchestrator purpose, principles, and non-goals
concepts: [foundation, intent, boundaries, orchestration, decompilation]
---

# Foundation: D-Comp Orchestrator

D-Comp Orchestrator coordinates Melee decompilation work across a durable board
of targets, facts, leases, and agent reports. It is not a replacement for the
Melee toolchain. It is the runtime that decides which bounded unit of work is
worth attempting next, records what happened, and keeps useful evidence moving
through the run.

## North Star

A central run director understands the whole board. It delegates bounded target
packets to workers, then sleeps until durable state changes. Workers research,
edit, verify, and report inside explicit leases. The system improves because
each worker produces durable evidence, not because agents chat with each other
or mutate source without accountability.

The core metaphor is Sudoku: a worker may discover a fact or negative result
that does not finish its current target, but still constrains the board enough
to make a different target the right next move.

## Principles

- Board-level reasoning belongs to the director.
- The director chooses the next most constrained useful square; it does not camp
  on one unfinished file.
- Source research, local edits, validation, and blocker discovery belong to
  workers.
- Every handoff is durable: events, reports, facts, leases, prompts, and
  artifacts survive process exits.
- Workers pursue evidence-backed hypotheses. Experimental search is bounded and
  opt-in.
- Write safety is a first-class runtime concern, enforced by leases and file
  locks.
- PR packaging is separate from the worker loop. A run should produce coherent
  improvement bundles, not one PR per worker or target.

## Boundaries

The orchestrator does not own the compiler, objdiff, build system, or final PR
review. It wraps those tools and records their evidence. It also does not try to
maintain hidden, always-on agent memory. The board, not a long-lived chat
thread, is the source of truth.

Generated state belongs under an explicit state directory. Runtime artifacts,
SQLite files, prompts, and reports should not be mixed with source files unless
an operator intentionally points the state directory there.

## Current Maturity

The package has a production-shaped vertical slice: it can initialize a run,
queue fixture targets, run a dry-run director cycle, lease one worker target,
write reports, recover interrupted leases, run a global regression-check
wrapper, and run a trigger-agent supervisor loop. The supervisor wakes the
director on durable events, fills worker slots from queued work, and rests when
the board is quiet. PR refresh, stale-lease recovery, and end-to-end score
integration remain explicit operator steps.
