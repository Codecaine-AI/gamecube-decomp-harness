# Problem

Slices 1-5 delivered the durable state machines (run, sync, PR campaign), project events,
dispatch-lease handoffs, and tracing. What is still missing after Slice 5:

1. There is no single server-owned read model. Operator surfaces assemble state from
   scattered endpoints and derive action availability client-side.
2. Knowledge processing from completed worker evidence is opt-in and non-durable: no
   durable job queue, no lease/fencing, no retry/backoff, no crash-safe publication.
3. The operator action inventory (21 canonical actions from the authority contract) is not
   projected anywhere; disabled actions are omitted instead of explained.
4. The three remaining feature contracts (10-authority-and-actions, 60-knowledge,
   80-operator-view) have not been absorbed into canonical System Design / Implementation
   documentation.

Slice 6 closes all four gaps. Baseline: commit c3ca54af, live Melee DB at schema 16.
