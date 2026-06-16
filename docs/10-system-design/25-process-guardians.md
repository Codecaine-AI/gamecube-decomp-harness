---
covers: Evented process guardians, babysit wrapper semantics, health incidents, and recovery policy
concepts: [guardian-process, babysit, process-wrapper, health-events, recovery, trigger-actors]
---

# Process Guardians

A process guardian is an evented safety layer around the decomp system process.
It is not a scheduler, worker, or always-on reasoning agent. It sleeps while the
system process runs, wakes when the process exits or reports a health incident,
records the incident packet, runs deterministic recovery, and then restarts the
system when policy allows.

## Process Stack

```text
+------------------------------+
| Guardian process             |
| - watches process exit        |
| - records health incidents    |
| - recovers failed leases      |
| - restarts system process     |
+---------------+--------------+
                |
                v
+------------------------------+
| Decomp system process         |
|                              |
|  +------------------------+  |
|  | Trigger actor          |  |
|  | scheduler tick, fill   |  |
|  | worker slots, sleep    |  |
|  +-----------+------------+  |
|              |               |
|      +-------+--------+      |
|      | Scheduler      |      |
|      | epoch intent   |      |
|      +-------+--------+      |
|              |               |
|      +----------------+      |
|      | Worker sessions |     |
|      | leased work    |      |
|      +----------------+      |
+------------------------------+
```

The run loop lives inside the decomp system process. It advances durable run
state by running deterministic scheduler ticks and realizing worker slots.
The guardian wraps that process boundary and handles liveness, crash recovery,
and incident artifacts.

## Wake Semantics

Guardians should not constantly inspect the board as a second scheduler. They
wake from operational health events:

- The decomp system process exits with a non-zero status.
- The run loop stops with a worker-process error.
- The system process exits while active workers remain in durable state.
- A signal asks the process tree to shut down.
- A future watchdog or process manager emits a timeout or heartbeat-missed
  event.

The guardian may use timers as health events, but it should not duplicate the
scheduler's queue, target, or board policy.

The run loop owns decomp-system wakeups. It handles durable events with the
deterministic scheduler, and in continuous compatibility mode it may also write
a `pool_below_target` event when the current worker pool is becoming
inefficient:

- Total queued work falls below the configured low-water mark while workers are
  still active.
- Distinct unlocked source files fall below the schedulable-work water mark.
- Queued work is present but blocked behind active file locks.
- Active workers enter a long-tail drain below the configured active-worker
  water mark.
- An optional periodic replan interval fires while workers are active.

Those run-loop-produced wake events ask the scheduler to refill, reprioritize,
or back off according to policy. The run loop does not edit source or perform
decomp research; it only applies durable scheduling policy and starts workers.

## Recovery Policy

Recovery starts with deterministic playbooks:

1. Capture stdout, stderr, parsed trigger result, and status summary.
2. Write an incident packet under the state directory.
3. Recover failed worker leases when the failed worker id is known.
4. Recover expired leases for broader process incidents.
5. Restart the decomp system process when restart policy allows.

A future repair agent can be invoked from an incident packet when deterministic
recovery repeats or cannot classify the failure. That repair agent would own
system repair, not decomp board strategy.

## Boundary Rules

- Guardians do not choose decomp targets.
- Guardians do not edit source as worker output.
- Guardians do not replace the run loop.
- Run loops report operational failures as process or incident events.
- Durable state remains the source of truth after any restart.

This keeps two fuzzy state machines separate: the decomp state machine advances
targets and evidence, while the guardian state machine preserves liveness.
