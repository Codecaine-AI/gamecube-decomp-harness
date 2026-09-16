## Dolphin OS thread subsystem

Reviewed all 819 canonical and rendered lines, all 43 subjects, 104 facts, and 12 links. Existing function names accurately describe the implementation; no renaming is proposed. The saved ledger retains 84 facts and 9 links, supersedes 3 facts, and marks 17 section-dependent facts and 3 section-dependent links unresolved.

### Scheduling and priority

The unit maintains 32 priority-indexed FIFO run queues. Smaller numeric priorities are more urgent; bit `31 - priority` summarizes each queue, and leading-zero count selects the most urgent nonempty queue. Ordinary rescheduling retains a running thread when no more urgent thread is ready. Yield bypasses that comparison, requeues the running thread, and selects again; it does not guarantee a different thread or allow lower-priority work to outrank the yielding thread. `RunQueueHint` requests reconsideration, while positive `Reschedule` values suppress selection. Scheduler enable/disable operations return the previous count and do not clamp it or directly dispatch.

Effective priority is the minimum of a thread's base priority and head-waiter priorities on its owned mutexes. Applying a change repairs ready/wait queue placement and can return an upstream mutex owner for iterative propagation. Suspended threads stop propagation. A suspended blocked thread remains on its wait queue at priority 32; final resume restores its effective priority and ordered placement.

### Context and lifecycle

Bootstrap installs `DefaultThread` with state 2, attribute 1, priority 16, the existing linker-provided stack, and a stack sentinel. Creation instead initializes caller-supplied storage in state 1 with suspension count 1, prepares an eight-byte-aligned stack and entry context, puts the callback argument in saved GPR 3, and installs `OSExitThread` as the saved link destination. It publishes the control block on the active list without initially inserting it into a run queue.

Canonical operations support state 1 as ready, 2 as running, 4 as waiting, 8 as terminated but retained for collection, and 0 as inactive. Ready state alone does not imply runnable membership: independently suspended threads remain excluded. Wake drains all waiters but inserts only unsuspended threads into run queues; suspended dequeued threads retain their old queue pointer until a later operation overwrites it. Sleep and exit request scheduling rather than overriding selector suppression or context guards.

Exit stores the supplied result only for joinable threads. Cancellation handles states 1, 2, and 4, returns without teardown for other states, and does not overwrite the result field. Both cleanup paths invoke mutex release and join-queue wakeup. Detached threads leave active tracking immediately; joinable state-8 threads remain until join or detach collects them. The reset caller caches the next active link before cancellation, preserving traversal across removal.

Selection saves a continuation only when the current context-state mask 2 is clear. `OSSaveContext` returns zero immediately but saves a nonzero return value for restoration. Dispatch ultimately uses `OSLoadContext`, which transfers execution through `rfi`; the trailing source `return nextThread` must not be treated as a normal post-dispatch return. The temporary interrupt-enabled `IdleContext` wait is distinct from the optional detached priority-31 `IdleThread` callback.

### Consumers and diagnostics

Verified the VI retrace wait consumer and the interrupt, alarm, and recoverable-error callback boundaries that defer scheduling until scheduler suppression is removed. Alarm handling also restores the interrupted context before reconsidering scheduling.

`CheckThreadQueue` checks endpoint and reciprocal links; it is not a complete proof against arbitrary corrupt graphs. `OSCheckActiveThreads` validates bitmap/queue agreement, active links, stack sentinels, suspension counts, state-specific queue placement, effective priorities, and mutex/deadlock predicates, then returns the active-list count. Both `ASSERTREPORT` failures and the unknown-state branch pass empty text to `OSPanic`; empty panic text is not exclusive to the unknown-state branch.

### Evidence limits

Rendered pages reported no parse errors and no substitutions. `OSGetCurrentThread`, `SetEffectivePriority`, and `SelectThread` were reported as shadowed bindings; canonical definitions, not unchanged rendering, ground their assessment. The renderer covers function names only.

The source's `.bss` comment does not establish compiled section membership. No compiled evidence was supplied for `.bss`/`.sbss` partitioning, `.data`/`.sdata` literal placement, section extents, literal pooling, or padding. Supported source-level object behavior is retained independently at function and TU level.

Status: synthesized; independent review and live promotion pending.
