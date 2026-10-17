R6 fixes:

- Immutable attempt labels: **RESOLVED**. Cleanup selects `orch_create_attempt`; stalled reconciliation cannot delete a successful retry. Regression passed.
- Kill-target confirmation: **RESOLVED**. Kill target must equal both `--run-id` and `--confirm-live`. Regression passed.

1. **[BLOCKING] Quota wait exhausts the agent budget before dispatch** — `apps/server/src/core/job-queue/consumer.ts:187`. Heartbeats renew the job lease, but the target TTL remains fixed at claim time. A permitted 12-minute provisioning wait with a 10-minute agent timeout leaves the dispatched agent only **1,000 ms**. Fix by claiming the target after admission, or extending its owner-fenced pre-dispatch TTL and task payload by the queue duration. Add a delayed-provisioning test through the worker descriptor.

2. **[BLOCKING] Admission starts another allocation after its deadline** — `apps/server/src/core/job-queue/sandbox-create-admission.ts:194`. `acquire()` accepts an available slot before checking deadline expiry. Reproduced with `maxWaitMs=10`: retry cleanup advances time to 101 ms, yet attempt 2 allocates successfully and records zero timeouts. Check the deadline before accepting a slot and after retry cleanup. Add a delayed-cleanup regression.

Focused tests passed where filesystem access permitted; fixture tests hit read-only `mkdtemp EPERM`. Server typecheck fails at `boundary-sync.ts:744`, outside this review’s scope. No edits or live operations.

2 blocking findings.