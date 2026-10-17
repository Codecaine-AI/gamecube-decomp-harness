R5: RESOLVED. Shared request holds now release through label reconciliation; the terminal-failure → reconciliation → next-create regression passes.

1. **[BLOCKING] Stale reconciliation deletes a successful retry** — `apps/server/src/core/job-queue/sandbox.ts:493`. A reconciler stalls listing a held request. The create’s own retry cleans up, releases the hold, and succeeds using the same label. The stalled list resumes and deletes that successful sandbox. Reproduced: returned sandbox disappears while admission remains `alive=1`, leaking quota. **Fix:** use immutable per-attempt allocation labels for cleanup and holds. Add a stalled-reconciliation/retry regression.

2. **[BLOCKING] Kill target bypasses confirmation** — `objectives/worker-compiler-loop/scale/load-test.ts:193`. `--live --kill scale-current --run-id scale-old --confirm-live scale-old` passes validation, but line 356 deletes `scale-current`. **Fix:** reject differing kill/run IDs and require confirmation to match the deletion target. Add a mismatch regression.

Server typecheck passed. Admission/sandbox tests: 25 passed; 3 blocked by read-only `mkdtemp EPERM`. No live runs or edits.

2 blocking findings.