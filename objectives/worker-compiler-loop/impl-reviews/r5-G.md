| R4 finding | Status | Why |
|---|---|---|
| #1 Allocation quota race | RESOLVED | Cleanup runs before admission release; failed cleanup retains a hold. |
| #2 Startup cost accounting | RESOLVED | Accounting starts at admission and includes failed/unconfirmed allocations. |
| #3 Native measurement success | RESOLVED | Nested `status: "ok"`, operation schema, and core fields are required. |

1. **[BLOCKING] Terminal create failure permanently consumes quota** — [sandbox.ts:448](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/job-queue/sandbox.ts:448). A terminal create error plus cleanup/list failures registers `allocation:<request UUID>`. After the create rejects, nothing retains responsibility for clearing that synthetic hold. Later reconciliation deletes the physical sandbox but clears only its real ID at line 530. Reproduced with `maxAlive=1`: physical sandbox gone, admission still `alive=1`, next create raises `SandboxCreateTimeoutError`. **Fix:** retain failed-request holds in shared state, reconcile by request label, and release each hold after confirming all associated allocations gone. Add a terminal-failure → successful reconciliation → successful next-create regression.

Server typecheck and focused R4 regressions passed. Fixture tests were blocked by read-only `mkdtemp EPERM`. No other new findings.

1 blocking findings.