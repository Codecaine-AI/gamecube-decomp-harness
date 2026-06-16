---
covers: Deterministic run scheduler responsibilities, run-loop process semantics, epoch queue cycle, wake handling, and worker report contract
concepts: [scheduler, run-loop, board, queue, epochs, wake-events, reports]
---

# Run Scheduler Loop

The run scheduler is the board-level control loop. It reads durable run state,
refreshes queue priorities from the ranked board, admits deterministic work,
starts workers under leases, and handles wake events without requiring a
model-driven scheduling session in the hot path.

## Behavior

Each scheduler pass has five phases:

1. Board read: observe active leases, queued targets, worker reports, wake
   events, locked sources, run status, and graph-ranked candidates.
2. Queue maintenance: refill or refresh the ready queue according to explicit
   epoch, ready-queue, candidate-window, lock, cooldown, and exhaustion policy.
3. Worker realization: start workers only for open slots and schedulable queued
   targets, with leases and file locks as the authority.
4. Boundary checks: trigger fast run-evidence refreshes during an epoch and full
   truth rebuilds at epoch boundaries.
5. Rest: mark handled wake events, record observable state, and sleep until
   durable state changes again.

The scheduler's decisions are reproducible from durable state and operator
configuration. Graph scores can rank candidates, but admission and wake-event
handling follow deterministic policy.

## Scheduler Cycle

```text
+------------------+     +------------------+     +------------------+
| Wake event       |---->| Board snapshot   |---->| Deterministic    |
| - run started    |     | - ranked targets |     | scheduler policy |
| - worker report  |     | - queue/leases   |     | admission/refill |
| - pool pressure  |     | - locks/stalls   |     | refresh/routing  |
+--------+---------+     +------------------+     +--------+---------+
         ^                                                 |
         |                                                 v
         |                  +------------------+     +-----+------------+
         |                  | Durable state    |<----| Scheduler result |
         |                  | - queue rows     |     | - admitted work  |
         |                  | - handled events |     | - refreshed rank |
         |                  | - epoch status   |     | - boundary state |
         |                  | - reports        |     | - routing notes  |
         |                  +--------+---------+     +------------------+
         |                           |
         |                           v
         +------ scheduler sleeps until another durable event or cadence fires
```

The run loop is the non-agent process component that gives the scheduler a
resting shape. It checks durable events, runs one deterministic scheduler tick
when an unhandled event exists, keeps worker slots filled from leaseable queue
rows, runs maintenance cadence checks, and then sleeps without keeping a
board-level model session alive.

The scheduler does not perform source archaeology or source edits. Workers own
target-local source work; the scheduler owns target admission, queue movement,
refresh cadence, boundary routing, and process realization.

## Epoch Queue Cycle

An epoch is a bounded scheduling wave admitted from the freshest authoritative
report and graph state available at epoch start.

Each epoch:

1. Admission selects up to the configured epoch size, or every currently
   schedulable unmatched target in `Full` mode. Admission scans the ranked board
   through the candidate window and expands when needed until the epoch target
   is satisfied or the board is exhausted.
2. Ready-queue refill keeps immediately leaseable work available from the
   admitted set. Queued-but-not-leased targets can receive priority refreshes
   from graph-ranked evidence while the epoch is running.
3. Workers lease targets. Active leases and file locks remain authoritative, so
   queued work behind active locks does not bypass the lock model.
4. Fast run-evidence refreshes can ingest completed worker reports, facts,
   blockers, stalls, and deterministic curator output. Fast refresh updates
   learning and ranking inputs only; it does not rebuild report truth.
5. The epoch boundary pauses intake, rebuilds report truth, runs full
   maintenance, records a progress save point, removes exact matches from
   future scheduling, routes regressions to repair priority, and admits the next
   epoch from the refreshed board.

Three sizes stay distinct:

| Concept | Purpose |
| --- | --- |
| Epoch size | Total target admissions for one epoch. |
| Ready queue size | Number of queued targets kept immediately leaseable. |
| Candidate window | Number of ranked board candidates scanned to satisfy admission or refill. |

## Wake Events

Wake events are durable work notices, not requests for model judgment:

- A run starts.
- Active workers drop below the desired count.
- A worker finishes, stalls, asks for a fact, hits provider trouble, or produces
  a score candidate.
- Queue pressure shows too little schedulable work or too many locks.
- An epoch boundary, pause, retry, or stop condition is recorded.

A scheduler tick handles one wake event by refreshing deterministic queue state,
recording the result, and marking the event handled. If no schedulable board
work exists, the scheduler records queue pressure and backs off according to
policy rather than spinning or falling back to a model-driven replan.

## Worker Delegation

A queued target is the bounded delegation contract. It names the unit, symbol,
source path, current score evidence, priority, reason, and leaseable write set.
The worker receives target-local context and validation expectations, but it
does not receive board-level authority.

The scheduler can requeue a previously attempted target only when deterministic
routing has authority to do so, such as regression repair, accepted new facts,
or explicit operator policy. Normal board refill stays biased toward fresh,
unlocked, distinct-source work.

## Worker Report Contract

A worker report should tell the board what changed:

- Progress: verified source improvement or a candidate ready for the score
  integration gate.
- Facts: reusable type, symbol, source-shape, duplicate, resource, or PR-derived
  evidence.
- Negative results: grounded hypotheses that failed and should not be repeated.
- Blockers: exact missing constraints that justify a fact/tool/research lane.
- Stall state: evidence is exhausted and the worker should stop before random
  mutation.

The report is more important than the worker session. Future scheduling consumes
durable evidence, not hidden conversation state.
