---
concepts: [scheduler, run-loop, board, epochs, target-claims, worker-state, wake-events, checkpoints, tool-slots]
---

# Run Scheduler Loop

Deterministic run scheduler responsibilities, run-loop process semantics, epoch admission, wake handling, and worker checkpoint flow.

The run scheduler is the board-level control loop. It reads durable run state,
refreshes epoch-target priorities from the ranked board, admits deterministic
work, starts workers through target claims, and handles wake events without
requiring a model-driven scheduling session in the hot path.

## Behavior

Each scheduler pass has five phases:

1. Board read: observe active claims, epoch targets, worker states, checkpoints,
   wake events, run status, and graph-ranked candidates.
2. Epoch maintenance: create or refresh the active epoch according to explicit
   epoch-size, worker-pool, candidate-window, cooldown, and exhaustion policy.
3. Worker realization: start workers only for open slots and admitted,
   unclaimed epoch targets, with target claims and explicit write sets as the
   authority.
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
| - worker closed  |     | - epoch targets  |     | admission/drain  |
| - pool pressure  |     | - claims/states  |     | refresh/routing  |
+--------+---------+     +------------------+     +--------+---------+
         ^                                                 |
         |                                                 v
         |                  +------------------+     +-----+------------+
         |                  | Durable state    |<----| Scheduler result |
         |                  | - epoch targets  |     | - admitted work  |
         |                  | - handled events |     | - refreshed rank |
         |                  | - epoch status   |     | - boundary state |
         |                  | - checkpoints    |     | - routing notes  |
         |                  +--------+---------+     +------------------+
         |                           |
         |                           v
         +------ scheduler sleeps until another durable event or cadence fires
```

The run loop is the non-agent process component that gives the scheduler a
resting shape. It checks durable events, runs one deterministic scheduler tick
when an unhandled event exists, keeps worker slots filled from admitted epoch
targets, runs maintenance cadence checks, and then sleeps without keeping a
board-level model session alive.

The scheduler does not perform source archaeology or source edits. Workers own
target-local source work; the scheduler owns target admission, claim pressure,
refresh cadence, boundary routing, and process realization.

## Epoch Cycle

An epoch is a bounded scheduling wave admitted from the freshest authoritative
report and graph state available at epoch start.

Each epoch:

1. Admission selects up to the configured epoch size, or every currently
   schedulable unmatched target in `Full` mode. Admission scans the ranked board
   through the candidate window and expands when needed until the epoch target
   is satisfied or the board is exhausted.
2. Priority refresh keeps admitted-but-unclaimed epoch targets aligned with
   graph-ranked evidence while the epoch is running.
3. Workers claim admitted targets. Each claim creates one worker state and an
   explicit write set; checkpoints hang from that worker state.
4. Fast run-evidence refreshes can ingest closed worker states, selected
   checkpoints, facts, blockers, and deterministic curator output. Fast refresh
   updates learning and ranking inputs only; it does not rebuild report truth.
5. The epoch boundary pauses intake, rebuilds report truth, runs full
   maintenance, records a progress save point, removes exact matches from
   future scheduling, routes regressions to repair priority, and admits the next
   epoch from the refreshed board.

Three sizes stay distinct:

| Concept | Purpose |
| --- | --- |
| Epoch size | Total target admissions for one epoch. |
| Worker pool size | Number of worker slots the run loop tries to keep active. |
| Candidate window | Number of ranked board candidates scanned to satisfy admission. |

Worker pool size is the claim/process target, not the raw compiler parallelism
target. Worker processes can be active while their expensive validation or
tool calls are queued behind per-epoch tool slots. The active epoch still owns a
fixed admitted target set; the slot queues only smooth local CPU/build pressure
inside the already-claimed work.

There are three hot-path capacity controls:

| Control | Owns |
| --- | --- |
| Worker pool | Number of live worker claims/processes. |
| Epoch ready queue | Number of admitted, unclaimed targets kept available to feed worker slots. |
| Tool/build slots | Number of concurrent compile-heavy validation and Pi tool operations allowed across worker worktrees in an epoch. |

## Wake Events

Wake events are durable work notices, not requests for model judgment:

- A run starts.
- Active workers drop below the desired count.
- A worker state closes as exact, timeout, error, or cancellation.
- Claim pressure shows too little schedulable admitted work for available worker
  slots.
- An epoch boundary, pause, retry, or stop condition is recorded.

A scheduler tick handles one wake event by refreshing deterministic epoch state,
recording the result, and marking the event handled. If no schedulable board
work exists, the scheduler records claim pressure and backs off according to
policy rather than spinning or falling back to a model-driven replan.

## Worker Delegation

An epoch target plus target claim is the bounded delegation contract. It names
the unit, symbol, source path, current score evidence, priority, reason, and
explicit write set. The worker receives target-local context and validation
expectations, but it does not receive board-level authority.

The scheduler can admit a previously attempted target into a later epoch only
when deterministic routing has authority to do so, such as regression repair,
accepted new facts, or explicit operator policy. Normal admission stays biased
toward fresh, graph-ranked work.

## Worker Checkpoint Contract

The runner records worker progress as validation checkpoints:

- Validation status, score movement, exactness, and hard-gate result.
- Patch/diff and validation artifact paths when they exist.
- Failure reasons for rejected checkpoints.
- Facts, blockers, and negative evidence preserved in the worker-state summary.

Only hard-gate-passing improvements are selectable. Exact checkpoints win over
non-exact checkpoints, then highest score wins, then earliest validation time.
Future scheduling consumes durable worker states and checkpoint evidence, not
hidden conversation state.
