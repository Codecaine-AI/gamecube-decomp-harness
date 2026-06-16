---
covers: Board prioritization, candidate-prior scoring, and deterministic scheduler signals
concepts: [board-prioritization, candidate-prior, helper-score, scheduling, constraint-propagation]
---

# Board Prioritization

Board helpers produce deterministic candidate-prior features. The run scheduler
uses those features as rank input, while final admission follows explicit epoch,
ready-queue, lock, cooldown, and exhaustion policy.

The helper score is graph-first. It should surface places where a worker is
likely to create reusable information, propagate a source-shape fact, or unlock a
cluster of related targets. Local closeness to 100% is still useful, but it is a
bounded high-accuracy bonus rather than proof that the missing information is
available.

## Snapshot And Refill Semantics

`loadBoardSnapshot` reads the current `build/GALE01/report.json` and
`objdiff.json`, builds imperfect-function candidates, scores them with the
helper prior, and returns the highest-ranked candidate window. The snapshot is a
fresh read of the available board artifacts. The trigger does not run the Melee
build or objdiff pipeline itself; when those artifacts are regenerated, the next
snapshot observes the updated scores.

When a resource graph database is available, the snapshot ranks against that
graph before sorting. Graph ranking can remove candidates whose file is
`read_only_complete`, `locked`, or `blocked`. Remaining candidates carry a
`rank` breakdown with closeness, information gain, completion readiness, unlock
potential, context quality, risk, graph score, high-accuracy bonuses, and final
priority. When the graph is not available, candidates still rank deterministically
from compressed local closeness.

The runtime uses two different limits:

- Candidate window: how many ranked board candidates are inspected during
  scheduler admission or refill.
- Epoch size: how many targets are admitted to the active scheduler epoch.
- Ready queue size: how many admitted targets are kept immediately leaseable for
  workers.

For example, a run can admit a 256-target epoch while keeping a 64-target ready
queue and scanning a 512-target candidate window. As workers consume queued
work, refill draws from the fixed admitted set. Fast run-evidence refresh can
update priorities for queued-but-not-leased targets, so new knowledge can
change lease order without injecting accidental out-of-epoch work.

## Candidate Prior

```text
candidate_prior =
  information_priority_score
  + high_accuracy_bonus
  + accuracy_readiness_bonus
  + closeness_fallback_score
```

`information_priority_score` is the graph-first queue component. It weights
information gain, unlock potential, completion readiness, and context quality
ahead of local fuzzy closeness, then subtracts risk. `completion_readiness_score`
asks whether there is actionable evidence available: tool findings, path facts,
historical lessons, curated lessons, duplicate references, matched siblings, and
relevant PRs. `closeness_score` is a capped, log-compressed version of the old
size/fuzzy helper score. It produces a small `high_accuracy_bonus`, plus an
extra `accuracy_readiness_bonus` when a near-finished target also has strong
readiness or information signals. When no graph information signal is present,
`closeness_fallback_score` keeps the target in a low-priority lane but spreads
that lane by raw closeness, fuzzy gap, and size so the queue does not collapse
into a flat tie.

This means a context-poor 99.x% target should not outrank a lower-fuzzy target
that is likely to add reusable knowledge. The best first targets are high
information and high readiness; high closeness is a multiplier when the graph
also says there is useful evidence to exploit. When graph information signals
are absent, closeness-only targets are kept as a low fallback rather than a
primary queue lane, with enough internal spread to make their order inspectable.

## Signals

| Signal | Why It Matters |
| --- | --- |
| Matched duplicate ref | A matched source shape can be adapted across unrelated files when assembly shape supports it. |
| Graph degree | A target connected to many similar functions can propagate more facts if solved or partially improved. |
| Linked incomplete functions | Sibling or connected imperfect functions can benefit from a fact discovered while investigating this target. |
| Worker context quality | Nearby matched siblings, graph edges, or reducer facts make deep worker research more grounded. |
| Recent stalls | Repeated no-delta attempts should cool down the target unless new facts arrive. |
| Data/rodata risk | Header, static, section-order, split, and relocation-sensitive work needs slower validation and fewer parallel edits. |

## Scheduler Contract

The scheduler receives the ranked board plus durable run state and admits a
fixed epoch set. A high prior is not an instruction to edit. It is a claim that
this target may produce leverage; deterministic policy can admit it, defer it
behind locks or cooldown, or let boundary routing move it into a repair,
fact/research, or stalled lane.

## Parallel Capacity Signal

Raw queue depth is not enough for a parallel run. If many queued targets share
one source file, active file locks can leave most workers idle even while the
queue looks full. Refill therefore tracks schedulable distinct source paths and
prefers fresh candidates from source paths that are not already queued or
actively locked. In epoch mode, low ready-queue depth refills from admitted
membership; in continuous compatibility mode, queue pressure can emit
`pool_below_target` for deterministic refill/backoff handling.

## Related

- [Run scheduler loop](10-run-director-loop.md)
- [Core principles](05-core-principles.md)
