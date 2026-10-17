Fix the compile-input freshness check before live workers.

| Round-1 finding | Status | Why |
|---|---|---|
| final-1: historical knowledge credit | RESOLVED | Each checkpoint uses its landed revision and cleared history. |
| final-1: repair continuation | RESOLVED | Claim-local lane remains open after certification. |
| final-1: equal-score restoration | RESOLVED | Identity proof dispatches independently of score rejection. |
| final-1: native classification | RESOLVED | Loads and validates `decisions.json`. |
| final-1: SMS type layout | RESOLVED | Baked C++ index and scoped fallback implemented. |
| final-2: stale certification; r6-H | NOT FULLY RESOLVED | `fresh:false` is rejected; compile-input identity remains unchecked. |
| final-2: discarded-branch certificates | RESOLVED | Positive ancestry to the measured revision required. |
| final-2: explain consumer | RESOLVED | Normal run starts bounded background consumption. |
| final-2: trusted-base explanations | RESOLVED | Separate observations, artifacts and jobs recorded. |
| final-2: historical PR clearance | RESOLVED | Clearance evaluated against saved source revision. |
| final-2: failed scale exit/ramp | RESOLVED | Worker failures, timeouts and guard trips stop the ramp. |

1. **[BLOCKING] Changed headers inherit an old certificate.**  
   `apps/server/src/core/harness-runtime/phases/running/integration/worker-output-queue.ts:534`  
   Freshness compares only `source_path`. Worker A certifies against header H0; worker B lands an allowed header change H1; A’s source patch applies cleanly. The producer records `fresh:true`, unverified clearance succeeds, and sync accepts the landing as certified despite never gating H1. Write-free reproduction returned `certified/gate_pass`. This is the remaining compile-input requirement from r6-H.  
   **Fix:** bind certification and clearance to all compile inputs, including headers, PCH dependencies and build configuration. Reject unknown or changed inputs, or recertify the integrated tree.

2. **[NON-BLOCKING] Required measurement failures still pass the ramp.**  
   `objectives/worker-compiler-loop/scale/worker-child.ts:117`; `scale/load-test.ts:224`  
   Unavailable/malformed native results emit failures but leave the worker job successful. `stepFailures` ignores them, allowing another ramp step and exit zero. Integration-drain failures are similarly swallowed.  
   **Fix:** include required-operation and integration infrastructure failures in step outcomes. Manual report review currently catches these.

3. **[NON-BLOCKING] Shutdown closes the database under explain jobs.**  
   `apps/server/src/core/harness-runtime/phases/running/scheduler/run-loop.ts:1546`  
   After the 30-second drain expires, shutdown closes the shared database while explain tasks continue. Completed deltas cannot publish; leases expire and later runs repeat sandbox work.  
   **Fix:** retain database ownership until tasks finish, or cancel tasks and release leases before closing.

Checks: server and UI typechecks passed; six focused scale tests, four migration tests and 31 Python tests passed. Migration application/reapplication passed in memory through v18. Broader tests hit read-only temporary-directory restrictions; baseline comparison and live-image/200-worker execution remain unverified.

1 blocking findings.

