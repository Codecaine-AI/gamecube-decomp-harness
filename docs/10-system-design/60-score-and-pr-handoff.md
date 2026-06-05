---
covers: Score integration gate, global regression protection, and PR handoff boundary
concepts: [score-integration, regression-gate, baseline, pr-handoff, review]
---

# Score Integration And PR Handoff

The worker loop can create evidence and candidate patches, but the run baseline
changes only through the score integration gate. This keeps verified progress
separate from exploratory attempts.

## Integration Gate

A candidate should pass through these checks before it affects the board
baseline:

- The worker still owns the lease and write set for the candidate.
- Local validation is preserved and unresolved local regressions are not kept.
- The source remains reviewable and understandable.
- The branch-level build/report refresh confirms the score movement.
- The integration record captures the old and new progress signal.

After integration, the board can publish new facts and metrics. Active workers
do not need to be canceled just because the board changed; future target
packets can use the updated evidence.

## End-Of-Run Output

The run should summarize accepted improvements, facts, rejected hypotheses,
stalls, score movement, validation transcripts, and review risks. That summary
is the bridge from autonomous work to human review.

## PR Boundary

The orchestrator does not create one PR per file, worker, symbol, or lease.
Human-facing PR packaging is a separate step after the run produces a coherent
improvement bundle. The PR-review agent can help analyze review patterns and PR
knowledge, but final presentation and merge readiness stay outside the worker
lease loop.
