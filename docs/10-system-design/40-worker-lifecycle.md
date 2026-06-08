---
covers: Worker target packet lifecycle, research loop, capabilities, validation, and stall policy
concepts: [worker, target-packet, capabilities, validation, write-safety, stall-policy]
---

# Worker Lifecycle

A worker is a bounded decompilation attempt. It receives one target packet,
works inside one lease, records evidence, and exits with a durable report.

## Lifecycle

1. Receive target packet and lease.
2. Build a compact context pack from local source, reports, resources, and PR
   evidence.
3. Decide which capabilities are justified by the evidence.
4. Attempt source edits or focused experiments inside the write set.
5. Run local validation and undo retained regressions.
6. Report progress, facts, blockers, or a grounded stall.
7. Release the lease and emit the wake event.

## Worker Cycle

```text
+------------------+     +--------------------+     +------------------+
| Target packet    |---->| Collect context    |---->| Hypothesis plan  |
| - unit/symbol    |     | - report/objdiff   |     | - constraints    |
| - budget         |     | - target asm       |     | - capabilities   |
| - stop rule      |     | - current C        |     | - stop test      |
| - write set      |     | - siblings         |     +--------+---------+
+------------------+     | - headers/types    |              |
                         | - PRs/docs         |              v
                         | - past attempts    |     +--------+---------+
                         +--------------------+     | Attempt loop     |
                                                    | - focused edit   |
                                                    | - duplicate      |
                                                    |   adaptation     |
                                                    | - experimental   |
                                                    |   search         |
                                                    | - permuter       |
                                                    |   handoff        |
                                                    | - fact request   |
                                                    | - cleanup        |
                                                    +--------+---------+
                                                             |
                                                             v
                                                    +--------+---------+
                                                    | Verify           |
                                                    | - compile        |
                                                    | - objdiff        |
                                                    | - baseline cmp   |
                                                    | - broaden only   |
                                                    |   when needed    |
                                                    +--------+---------+
                                                             |
                                +----------------------------+----------------+
                                |                                             |
                                v                                             v
                      +---------+--------+                         +----------+-------+
                      | Refine plan      |                         | Report shard     |
                      | if evidence      |                         | - patch/delta    |
                      | gets sharper     |                         | - facts/blockers |
                      | and budget stays |                         | - wake event     |
                      +---------+--------+                         +----------+-------+
                                |                                             |
                                +-------> attempt loop                         v
                                                        reducer/director update future
                                                        target packets through state
```

The worker can loop from verification back into planning while evidence is
getting sharper and budget remains. New facts leave through durable reports and
future target packets; workers do not coordinate through direct worker-to-worker
chat.

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

## Validation

Workers protect the run with local validation before reporting progress. They
track the leased target and affected neighbors, run narrow checks, compare
object or objdiff signal, and undo their own retained hunks when those hunks
regress local evidence.

The worker return is also mechanically gated. The runner captures the write-set
diff before the first worker attempt, then evaluates every returned report.
`progress` and `score_candidate` reports are accepted only when the structured
report includes a passed `local_regression_check`, no target regression, no
neighbor regressions, baseline and final validation artifacts that exist on
disk, and edited paths that remain inside the lease write set. A worker that
returns `stalled_no_useful_guess` or `needs_fact` must not leave new write-set
edits behind.

If the post-return gate fails, the runner keeps the lease held and sends a
`repair_request` back to the worker for a configurable number of repair turns.
Only after the return passes or the repair budget is exhausted does the runner
record the worker report, release file locks, and emit the wake event. An
optional runner-owned post-return command can be configured for additional
narrow validation before accepting `progress` or `score_candidate`.

Global score integration happens outside the worker's local loop. A worker can
surface a score candidate, but the run baseline changes only after the
integration gate validates it.

## Report Outcomes

Worker reports separate outcome into two fields:

- `result`: what happened to the target. Valid values are `exact`, `improved`,
  and `no_progress`.
- `stop_reason`: why this worker is done with the current lease. Valid values
  are `target_complete`, `needs_fact`, and `no_useful_hypothesis`.

The UI renders these as combined outcome filters:

- Exact: `result: "exact"` or `stop_reason: "target_complete"`. The target
  reached a 100% local match.
- Improved / Stalled: `result: "improved"` and
  `stop_reason: "no_useful_hypothesis"`. The worker retained positive score
  movement, then exhausted evidence-backed next hypotheses.
- Improved / Needs: `result: "improved"` and `stop_reason: "needs_fact"`. The
  worker retained positive score movement, then hit a specific missing
  fact/resource.
- No Progress / Stalled: `result: "no_progress"` and
  `stop_reason: "no_useful_hypothesis"`. The worker did not retain positive
  score movement and has no evidence-backed next move.
- No Progress / Needs: `result: "no_progress"` and
  `stop_reason: "needs_fact"`. The worker did not retain positive score movement
  because a specific missing fact/resource blocks progress.
- Failed: the report failed the structured acceptance gate or runner-owned
  validation. Failed progress-like returns are treated as stalls after repair
  attempts are exhausted.

`report_type` remains the runner compatibility field for acceptance and wake
events. `progress` and `score_candidate` describe accepted progress-style
returns; they are not proof of score movement by themselves. `needs_fact` is used
when the missing fact is the primary no-edit outcome. `stalled_no_useful_guess`
is used when no retained progress remains and no specific missing fact is known.

## Stall Policy

A worker should stop when it cannot name an evidence-backed next hypothesis.
Useful stalls are not failures. They preserve context, cool down the target, and
turn missing constraints into fact-research work for the board.

Workers should not keep spending budget on guesses after PRs, docs, source
siblings, duplicate groups, resource evidence, and measured diff signal stop
supporting a clear next move.
