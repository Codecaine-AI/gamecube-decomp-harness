---
covers: Run director responsibilities, cycle, wake conditions, and worker report contract
concepts: [director, board, queue, target-packets, wake-events, reports]
---

# Run Director Loop

The run director is the central board-level agent. It reads the current run
state, decides which target packets are most useful next, writes decisions, and
then goes idle. It does not perform source archaeology or source edits.

## Behavior

Each director cycle has four phases:

1. Board read: absorb progress, active leases, queued targets, worker reports,
   accepted facts, rejected hypotheses, duplicate groups, and recent stalls.
2. Prioritization: use helper scores and recent evidence to identify targets
   that can create useful information.
3. Delegation: fill idle worker slots with bounded target packets.
4. Sleep: write decisions and stop until a durable event wakes the director.

The director's job is to choose the next valuable square on the board. Helper
scores can rank likely targets, but the final scheduling decision belongs to the
director because it has the full context of the run.

## Director Cycle

```text
+------------------+     +------------------+     +------------------+
| Wake event       |---->| Board snapshot   |---->| Pi director      |
| - run started    |     | - run target     |     | choose next      |
| - worker stalled |     | - indexer output |     | influence point  |
| - worker done    |     | - reducer output |     | under budget     |
| - refill needed  |     | - leases/stalls  |     | and locks        |
+--------+---------+     +------------------+     +--------+---------+
         ^                                                 |
         |                                                 v
         |                  +------------------+     +-----+------------+
         |                  | Write state      |<----| Decision bundle  |
         |                  | - queue rows     |     | - target packets |
         |                  | - lease intents  |     | - priorities     |
         |                  | - fact requests  |     | - budgets        |
         |                  | - cooldowns      |     | - cooldowns      |
         |                  | then sleep       |     | - fact packets   |
         |                  +--------+---------+     +------------------+
         |                           |
         |                           v
         +------ director inactive until another durable event wakes it
```

The cycle is intentionally short. The director does one board read, writes one
decision bundle, and exits. It is resumed by durable events rather than kept
alive as a hidden strategic loop.

The trigger-agent supervisor is the non-agent process that gives this a
resting-agent feel. It checks durable events, activates one director turn when a
wake event exists, starts worker turns for open worker slots, and then sleeps
without keeping a Pi director session alive.

## Wake Events

The director wakes when durable state says it should act:

- A run starts.
- Active workers drop below the desired count.
- A worker finishes, stalls, asks for a fact, or produces a score candidate.
- New facts are accepted.
- A score integration changes the board.
- The target run goal is reached.

Workers do not need the director to be live while they work. They write reports
and events, then the runner invokes the director again when the next decision is
needed.

## Target Packets

A target packet is the director's bounded delegation contract. It should name
the target, write set, context to read first, relevant facts, rejected
hypotheses, budget, capability hints, validation expectations, and stop
conditions. The packet gives the worker enough shape to act without giving it
board-level authority.

## Worker Report Contract

A worker report should tell the board what changed:

- Progress: verified source improvement or a candidate ready for the score
  integration gate.
- Facts: reusable type, symbol, source-shape, duplicate, resource, or PR-derived
  evidence.
- Negative results: grounded hypotheses that failed and should not be repeated.
- Blockers: exact missing constraints that justify a fact-research packet.
- Stall state: evidence is exhausted and the worker should stop before random
  mutation.

The report is more important than the worker session. Future decisions consume
durable evidence, not hidden conversation state.
