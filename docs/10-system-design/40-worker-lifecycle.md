---
concepts: [worker, target-packet, target-claim, worker-state, checkpoints, validation, qa-lint, write-safety, tool-slots]
---

# Worker Lifecycle

Worker target packet lifecycle, target claims, runner validation, checkpoints, timeout/error classification, and continuation policy.

A worker is a bounded decompilation attempt for one claimed epoch target. The
worker keeps trying to reach an exact match; the runner owns lifecycle,
validation, checkpointing, best-attempt selection, timeout handling, and final
classification.

## Lifecycle

1. Receive one target packet and active target claim.
2. Build a compact context pack from local source, report/objdiff evidence,
   resources, and PR evidence.
3. Attempt source edits or focused experiments inside the explicit write set.
4. Signal validation readiness with a compact checkpoint note, or simply reach
   a worker turn boundary for runner validation.
5. Runner validates the current workspace, records a checkpoint, and selects
   the best selectable checkpoint so far.
6. Exact checkpoints that pass hard gates close the worker state as exact.
   Non-exact checkpoints continue the same worker conversation while the
   bounded continuation policy allows it.
7. Runner timeout closes with the best prior selectable checkpoint, or baseline
   if none improved. Provider, infrastructure, or tool failures close as error
   while preserving any prior selectable checkpoint.
8. The closed worker state emits a wake event for scheduler and dashboard
   follow-up.

## Worker Cycle

```text
+------------------+     +--------------------+     +------------------+
| Target packet    |---->| Collect context    |---->| Hypothesis plan  |
| - unit/symbol    |     | - report/objdiff   |     | - constraints    |
| - claim id       |     | - target asm       |     | - capabilities   |
| - stop rule:     |     | - current C        |     | - exact target   |
|   exact only     |     | - siblings         |     +--------+---------+
| - write set      |     | - headers/types    |              |
+------------------+     | - PRs/docs         |              v
                         | - checkpoints      |     +--------+---------+
                         +--------------------+     | Attempt loop     |
                                                    | - focused edit   |
                                                    | - duplicate      |
                                                    |   adaptation     |
                                                    | - experimental   |
                                                    |   search         |
                                                    | - permuter       |
                                                    |   handoff        |
                                                    | - cleanup        |
                                                    +--------+---------+
                                                             |
                                                             v
                                                    +--------+---------+
                                                    | Runner validate |
                                                    | - compile       |
                                                    | - objdiff       |
                                                    | - QA lint       |
                                                    | - baseline cmp  |
                                                    +--------+---------+
                                                             |
                                +----------------------------+----------------+
                                |                                             |
                                v                                             v
                      +---------+--------+                         +----------+-------+
                      | Continue same    |                         | Close worker    |
                      | worker session   |                         | state           |
                      | with repair      |                         | - exact         |
                      | feedback         |                         | - timeout       |
                      +---------+--------+                         | - error         |
                                |                                  +----------+-------+
                                +-------> attempt loop                         |
                                                                               v
                                                        scheduler/dashboard consume
                                                        worker-state evidence
```

The worker can loop from validation back into planning while evidence is getting
sharper and budget remains. New facts and blockers are evidence attached to the
worker state; workers do not coordinate through direct worker-to-worker chat.

## Capabilities

Capabilities are tactics available to a worker. They are not separate worker
types. A single worker can combine context packaging, type and symbol
resolution, duplicate adaptation, focused source editing, fact research,
isolated check loops, review cleanup, experimental search, and permuter handoff
when the target packet and evidence justify them.

Experimental search is opt-in. It is useful when a worker can define a bounded,
measurable matrix of source-shape variants. It should produce shards, negative
results, and learned patterns rather than unreviewable random mutations.

The full capability table and guardrails live in
[worker capabilities](45-worker-capabilities.md).

## Runner Validation

Runner validation is the source of truth for progress. The runner captures a
pre-worker baseline, diffs the claimed write set after each attempt, runs local
validation, records a checkpoint, and decides whether that checkpoint is
selectable.

The pre-worker object build and later validation builds are narrow worker-local
commands, not full project report rebuilds. Compile-heavy `ninja` calls acquire
an epoch-scoped worker Ninja slot before running in the worker worktree. Worker
Pi tools that invoke MWCC or objdiff use the toolpack's own per-tool slot pools,
so a worker may keep its conversation alive while waiting for a local build or
checkdiff/permuter slot.

A checkpoint records:

- Validation status, score before/after, delta, and exact-match flag.
- Hard-gate result, build status, QA status, objdiff status, and failure
  reasons.
- Artifact paths for validation summaries, patches, and diffs.
- Worker note metadata, facts, blockers, and post-validation feedback.

Only checkpoints that pass hard gates and improve over the worker state's
baseline are selectable. Best-checkpoint selection is deterministic: exact match
wins, then highest target score, then earliest validation time. Failed or
neutral checkpoints remain useful evidence, but they are not integration
candidates.

A checkpoint can measure an exact target score while still failing hard gates
such as QA lint, post-return checks, or local validation. That checkpoint is
not selectable and does not close the worker as exact. It is treated as
high-value repair evidence and receives the bounded failed-gate exact repair
budget described below.

Runner-owned validation also runs the worker-side QA lint (the QA ship gate's
L1 layer; see [score and PR handoff](60-score-and-pr-handoff.md)). The runner
diffs the attempt's touched files against the pre-worker source snapshot and
runs the deterministic maintainer-rejection scan over that diff. Findings
become repair feedback. A score-improving attempt that re-adds or leaves a QA
finding is rejected because the finding may be what inflated the score.

Scanner infrastructure errors are recorded as blind spots rather than mass
worker failures. The PR handoff gate remains stricter and fails closed.

Global score integration happens outside the worker's local loop. A worker can
produce a selectable checkpoint, but the run baseline changes only after the
integration and epoch gates validate it.

## Worker State Outcomes

Worker state lifecycle status describes why execution ended:

- **Exact**: runner validation selected an exact checkpoint.
- **Timeout**: the runner-controlled timeout ended the attempt; the best prior
  selectable checkpoint is preserved, or baseline is selected when none
  improved.
- **Error**: a provider, infrastructure, tool, build, parse, or session failure
  blocked trustworthy evaluation. Prior selectable checkpoints remain usable.
- **Cancelled**: an operator or process-control path stopped the worker before
  normal lifecycle close.

Improvement, neutrality, regression, and exactness are validation/verdict facts,
not worker-authored stop claims. The dashboard and knowledge curator read
worker states and checkpoints rather than asking the worker to classify its own
durable outcome.

## Continuation Policy

A worker continues only while runner-owned evidence says more attempts are
worth spending:

- An accepted exact checkpoint stops immediately.
- A cold worker with no selectable improvement and no failed-gate exact
  checkpoint stops after the fifth human attempt.
- The first selectable non-exact improvement is saved immediately. The worker
  can spend up to three follow-up checkpoints looking for a new best or exact.
- A higher selectable best resets the three-follow-up budget.
- If three follow-up checkpoints after the latest best do not produce a higher
  selectable best or exact, the worker stops and the saved best checkpoint is
  preserved.
- An exact score that fails hard gates starts a failed-gate exact repair lane.
  The runner can spend up to three follow-up checkpoints repairing the gates,
  even when the cold budget would otherwise stop the worker.
- If the failed-gate exact repair lane does not produce an accepted exact or a
  selectable best within its follow-up budget, the worker stops.

When the runner rejects a checkpoint or accepts a non-exact checkpoint for
continued work, the same worker conversation receives repair or continuation
feedback. That feedback names the validation failure, QA finding, non-exact
score, and continuation reason so the worker can refine without losing
context.

The claim deadline, dry-run mode, provider failures, and missing repair reasons
still stop continuation. At timeout, the runner chooses the best validated state
rather than trusting the worker's self-assessment.
