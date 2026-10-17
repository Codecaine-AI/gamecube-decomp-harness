Fix two certification gaps before live SMS workers.

| Round-2 finding | Verification |
|---|---|
| Compile-input freshness, both reports | **NOT RESOLVED fully.** Tracked headers/PCH/config are checked; generated inputs remain unchecked. |
| Restoration knowledge credit | **RESOLVED** for restoration alone. The later-certificate exception introduces finding 2 below. |
| Bounded MWCC output | **RESOLVED.** Structural bounding preserves valid JSON and report locators. |
| Scale measurement/integration failures | **RESOLVED.** Required failures fail the step and stop the ramp. |
| Melee probe wording | **RESOLVED.** Step 7 preserves its permitted last-resort probe. |
| Explain shutdown | **RESOLVED.** Abort and lease release precede database close; late writes are suppressed. |

Earlier resolved findings remain resolved: checkpoint-specific knowledge revisions, repair continuation, equal-score restoration, native classification, SMS type fallback, discarded-branch ancestry, explain startup, trusted-base explanations, and publication-revision PR clearance.

1. **[BLOCKING] Generated compile inputs still inherit certification.** Remaining round-2 blocker.  
   `apps/server/src/core/validation/steering/certified-inputs.ts:182`  
   Every `build/` dependency’s hash is discarded. An unverified generated input can therefore receive `fresh:true`; write-free reproduction returned `checked:0`.  
   **Fix:** bind generated inputs to verified generating dependencies or regenerate and compare them. Otherwise return not fresh.

2. **[BLOCKING] Stale later certificates unlock restoration knowledge credit.** New regression.  
   `apps/server/src/core/knowledge-v2/ingest/attempts.ts:242`  
   `loadRestorationCertification` accepts checkpoint certification metadata without checking landing freshness. A later gate pass landing with `steering_content_freshness.fresh=false` makes the earlier restoration count as a knowledge match. Independently reproduced with real `HEAD^ → HEAD` ancestry: `finalOutcome:"match"`. The confirmed-good path uses this helper too.  
   **Fix:** select later passes through `landedCertificates`, filtered by game, target and `kind:"gate_pass"`.

Server/UI typechecks passed. **80 focused Bun tests and 31 Python tests passed.** All three live prompt fixtures and requested packet variants rendered. Temporary-file/snapshot checks hit read-only restrictions; baseline comparison, live sandbox tools and 200-worker readiness remain unverified.

2 blocking findings.

