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

Global score integration happens outside the worker's local loop. A worker can
surface a score candidate, but the run baseline changes only after the
integration gate validates it.

## Stall Policy

A worker should stop when it cannot name an evidence-backed next hypothesis.
Useful stalls are not failures. They preserve context, cool down the target, and
turn missing constraints into fact-research work for the board.

Workers should not keep spending budget on guesses after PRs, docs, source
siblings, duplicate groups, resource evidence, and measured diff signal stop
supporting a clear next move.
