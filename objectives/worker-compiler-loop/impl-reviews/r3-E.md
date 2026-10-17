R2 verification:

1. **RESOLVED — host fallback:** `steering-check.ts:426`. Default/auto now fails when sandbox clang is unavailable.
2. **RESOLVED — traced evidence:** `gate_traced_capabilities.py:86`. Requires positive, consistent comparisons, binary-bound evidence, and coverage from every requiring game.
3. **RESOLVED — QA diff fallback:** `change-validation.ts:2093`. Missing snapshots are reconstructed from proven blobs or return unavailable.
4. **RESOLVED — worker lint routing:** `resolver.ts:474`. File/snippet scans now run in the sandbox.
5. **NOT RESOLVED — host report processing:** report reduction and symbol queries moved; banned-idiom processing remains below.
6. **RESOLVED — missing game policy:** `steering-check.ts:1129`. Missing/invalid descriptors fail before execution. The prior non-blocking MWCC environment item is also resolved at line 1188.

Findings:

1. **[BLOCKING] Host lint processing remains — `apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts:2351`.** Every enabled attempt calls host `lintBannedIdioms`. Qualifier changes transfer complete before/after sources, then host parsers scan declarations and references (`micro-gates.ts:451`). This retains R2’s blocker and violates §3.6. Additional remaining host computation: full `build.ninja` transfer and parsing on each worker’s cold cache (`change-validation.ts:113`). **Fix:** execute both reductions inside the sandbox; return bounded verdicts/config arguments.

2. **[NON-BLOCKING] Bundle packing has unbounded host parallelism — `apps/server/src/core/job-queue/provisioning.ts:517`.** Concurrent provisioning launches a separate `git bundle create` per worker without limiting pack threads or deduplicating identical bundles. At 200 starts, Git’s automatic threading can multiply host CPU/memory pressure, especially after full-bundle fallback. **Fix:** bound packing concurrency, use `pack.threads=1`, and share bundles keyed by required revisions and exclusion.

3. **[NON-BLOCKING] Obsolete exclusion instructions — `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md:253`.** Documentation still describes 42 SMS `RAD_TO_DEG` exclusions; configuration now lists five source failures. **Fix:** reference the configuration directly or update the documented exclusions.

Typecheck passed. Focused tests passed where fixtures were unnecessary; fixture-based verification was blocked by read-only `EPERM`. Snapshot dry-run safety was verified statically.

1 blocking finding.