Fix the restoration-credit freshness bypass before live workers.

| Round-2 finding, deduplicated across both reports | Status and reason |
|---|---|
| Compile-input freshness | RESOLVED: checkpoint inputs checked before clearance and certified landing. |
| Restoration knowledge credit | NOT RESOLVED end-to-end: standalone restoration excluded; stale later certificates unlock it. |
| Compiler output bounding | RESOLVED: structural bounds preserve JSON and report locators. |
| Failed scale measurements/integration | RESOLVED: failures fail steps and stop the ramp. |
| Per-game probe instructions | RESOLVED: SMS/Melee wording separated. |
| Explain shutdown | RESOLVED: abort, release and late-write guards precede database close. |
| Historical checkpoint credit | RESOLVED: clearance checked against each checkpoint’s revision. |
| Repair continuation | RESOLVED: lane persists throughout the claim. |
| Equal-score restoration | RESOLVED: identity proof runs independently of score rejection. |
| Native capture classification | RESOLVED: actual `decisions.json` loaded and validated. |
| SMS type fallback | RESOLVED: scoped C++ context and baked index wired. |
| Discarded-branch ancestry | RESOLVED: positive ancestry to measured revision required. |
| Explain consumer startup | RESOLVED: bounded consumer starts during normal runs. |
| Trusted-base explanations | RESOLVED: separate observations retain their own artifacts and provenance. |
| Historical PR clearance | RESOLVED: checked against pinned publication revision. |

**[BLOCKING] Stale gate-pass landings unlock restoration knowledge credit.**  
[attempts.ts:242](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/knowledge-v2/ingest/attempts.ts:242)

Restoration clears its hold at revision R. Later gate-pass G lands over changed headers with `steering_content_freshness.fresh:false`. The new `loadRestorationCertification` helper accepts G’s checkpoint flag and ancestry without checking landing freshness. Restoration then earns `finalOutcome:"match"` and passes the restoration guard for confirmed-good ingestion.

Write-free production-helper reproduction using real ancestor revisions returned `staleDescendantGatePassUnlocksRestoration:true` and `finalOutcome:"match"`.

**Fix:** obtain gate-pass evidence through `landedCertificates`, requiring its bound positive freshness proof.

Both requested typechecks passed. Targeted migration, scale, output-boundary, prompt, type-layout and parser checks passed; 31 Python tests passed. Broader suites hit read-only temporary-directory restrictions. Baseline failure comparison and real-image/200-worker execution remain unverified.

1 blocking findings.