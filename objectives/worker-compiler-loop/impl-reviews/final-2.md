### Blocking

1. **[BLOCKING] Stale landings become certified.**  
   `apps/server/src/core/harness-runtime/phases/running/epochs/sync-certification.ts:57`; `certified-regression.ts:113`.  
   Both consumers ignore `steering_content_freshness.fresh=false`. A clean patch applied over changed source can win Sync conflicts as certified and have regressions excused. In-memory reproduction returned `{"status":"certified","verdict":"gate_pass"}` for that landing.  
   **Fix:** Require a successful freshness proof bound to the target, claim base, source and integrated revision.

2. **[BLOCKING] Discarded-branch certificates suppress current regressions.**  
   `apps/server/src/core/harness-runtime/phases/running/epochs/certified-regression.ts:127`.  
   “Not ancestor of epoch baseline” includes unrelated branches. Reproduction with a discarded 96% certificate removed a current 100→96 regression: broken matches **1→0**, metric regressions **5→0**. Upstream judgement also lacks measured-revision ancestry.  
   **Fix:** Require positive ancestry to the measured revision; preserve regressions when provenance is unknown.

3. **[BLOCKING] Explain jobs have no normal-run consumer.**  
   `apps/server/src/core/agent-catalog/agents/running/worker/steering-validation.ts:566`; `apps/server/src/core/validation/jobs/steering-explain.ts:351`.  
   Workers enqueue jobs, but only the manual CLI drains them. Normal execution leaves new jobs queued indefinitely, so probes never receive their compiler delta.  
   **Fix:** Register a bounded background consumer with scheduler startup, shutdown and draining.

### Non-blocking

1. **[NON-BLOCKING] Trusted-base failures lose their explanations.**  
   `apps/server/src/core/agent-catalog/agents/running/worker/steering-validation.ts:511`.  
   Claim-base pass plus trusted-base rejection records only passing observations. The rejecting run gets no explain job even after fixing the consumer.  
   **Fix:** Record trusted-base observations with their own artifacts, fidelity and revision; select the failing probe.

2. **[NON-BLOCKING, pre-existing] Older PR source inherits later clearance.**  
   `apps/server/src/core/harness-runtime/phases/pr/checkpoint/steering-holds.ts:285`.  
   Certification at B clears the active row, allowing older source A through PR holds without B being its ancestor. This active-only behavior also exists in `origin/main`.  
   **Fix:** Apply the saved-revision cleared-history rule to publication.

3. **[NON-BLOCKING] Failed scale runs exit successfully.**  
   `objectives/worker-compiler-loop/scale/load-test.ts:469`.  
   Failed attempts, timeouts and guard trips still return zero when cleanup succeeds; failed steps can also advance the ramp.  
   **Fix:** Fail the command on unsuccessful step outcomes or guard trips, and stop the ramp.

Checks: server/UI typechecks passed; **16 Bun tests and 31 Python tests passed**. Broader suites hit read-only temporary-file restrictions; no baseline regression claim follows from those failures. Real-image and 200-worker execution remain unverified.

3 blocking findings.

