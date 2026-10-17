Fix landing freshness and restoration credit before running SMS workers.

| Prior finding | Status and reason |
|---|---|
| final-1: historical knowledge credit | RESOLVED. Each checkpoint uses its own revision and cleared history. |
| final-1: repair continuation | RESOLVED. Lane stays open throughout the claim. |
| final-1: equal-score restoration | RESOLVED. Identity proof runs independently of score rejection. |
| final-1: native capture classification | RESOLVED. Classifier loads `decisions.json`. |
| final-1: SMS type fallback | RESOLVED. Source-scoped C++ context and baked index exist. |
| final-2: landing freshness; duplicate r6-H | NOT RESOLVED. Positive proof still ignores compile dependencies. |
| final-2: discarded-branch ancestry | RESOLVED. Positive ancestry to the measured revision is required. |
| final-2: explain consumer | RESOLVED. Bounded consumer starts, stops and drains. |
| final-2: trusted-base explanations | RESOLVED. Trusted observations retain their artifacts and queue explanations. |
| final-2: historical PR clearance | RESOLVED. Cleared history is checked against publication revision. |
| final-2: failed scale exits | NOT RESOLVED. Measurement failures still allow success. |

1. **[BLOCKING] Changed headers inherit source-only certification.** `apps/server/src/core/harness-runtime/phases/running/integration/worker-output-queue.ts:534`  
   Another worker changes an included header while the target source remains unchanged. Integration records `fresh:true`, permits unverified clearance, and exposes the landing as certified to sync and regression checks. Confirmed with write-free production-helper reproduction. **Fix:** verify all measured dependencies and compile configuration, or recertify the integrated tree. Unknown inputs retain holds.

2. **[BLOCKING] Restoration earns knowledge match credit.** `apps/server/src/core/knowledge-v2/ingest/attempts.ts:257`  
   A 100% restoration has `exact_match=0` and `certification.kind="restoration"`. After clearance, ingestion accepts raw score 100 and records `finalOutcome:"match"`. Reproduced with actual ingestion functions and in-memory SQLite. **Fix:** exclude restorations from match evidence and raw-score fallbacks until a later gate-pass certificate.

3. **[NON-BLOCKING] Large compiler comparisons lose valid output.** `apps/server/src/core/tools/wrappers/capabilities.ts:1123`  
   Thirty retained change rows can exceed the generic output cap. Reproduction produced truncated, invalid JSON without `full_report`; scale classification also rejects it. **Fix:** structurally bound the payload while preserving schema, status and report locator.

4. **[NON-BLOCKING] Failed native measurements still pass scale steps.** `objectives/worker-compiler-loop/scale/worker-child.ts:150`  
   Capture/comparison failures emit events, but cycle completion sets success; ramp decisions ignore those failures. **Fix:** propagate required measurement failures into step failure and stop the ramp.

5. **[NON-BLOCKING] Melee receives contradictory probe instructions.** `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:223`  
   “Remove every probe edit” contradicts Melee’s permitted diagnosed `PAD_STACK` probes. **Fix:** render the submission instruction per game.

Both requested typechecks passed. **125 Bun and 31 Python tests passed.** All requested prompt and packet variants rendered. Temporary-file tests hit read-only restrictions; baseline comparison and real-image/200-worker execution remain unverified.

2 blocking findings.

