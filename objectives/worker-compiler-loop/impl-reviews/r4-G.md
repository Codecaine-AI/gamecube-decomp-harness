R3 command replay: RESOLVED. Atomic `mkdir` claims prevent duplicate execution; delayed-original regressions pass.

R3 live evidence: RESOLVED. The gate rejects synthetic evidence and requires validator provenance, including `projection_equal`.

1. **[BLOCKING] Failed allocations release quota before cleanup** — `apps/server/src/core/job-queue/sandbox.ts:437`. A allocates, receives a proxy 429, and releases admission before cleanup. B creates during A's backoff. Reproduced two physical sandboxes with `maxAlive=1`. **Fix:** reconcile within the admitted failure path before releasing its reservation; retain accounting when cleanup fails. Add a concurrent regression.

2. **[BLOCKING] Startup allocations escape the cost budget** — `objectives/worker-compiler-loop/scale/lib/guard.ts:105`. Accounting starts after SDK creation returns, excluding startup and failed allocations. Reproduction with three 180-second post-allocation failures reported zero sandbox-minutes against a one-minute budget. **Fix:** count admitted creates conservatively through completion or reconciliation, including failed allocations.

3. **[BLOCKING] Unavailable native results count as successful measurements** — `objectives/worker-compiler-loop/scale/worker-child.ts:111`. The success check reads the outer envelope, accepting `{exit_code:0, parsed:{status:"unavailable"}}`. Native capture and comparison coverage can appear complete without successful captures. **Fix:** require each nested result's success status/schema; record unavailable, malformed, or failed results as measurement failures. Add regressions for both operations.

Server typecheck and filesystem-independent tests passed. Fixture tests were limited by read-only `mkdtemp EPERM`. No edits or live runs.

3 blocking findings.