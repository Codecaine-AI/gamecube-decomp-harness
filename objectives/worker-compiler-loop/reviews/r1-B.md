### Worker loop and capture

1. **[BLOCKING] Certified recovery remains unreachable. Phase 1.3.**  
   An unverified 100 → certified 95 → certified 96 sequence fails today: score regression is rejected before steering runs (`change-validation.ts:1002,2099`), and checkpoint selection requires score improvement (`harness-runtime/run-state/worker-state.ts:795-802`). Continuation also lacks a general certification signal (`harness-runtime/phases/running/workers/worker-cycle.ts:980`).  
   **Fix:** add a certification lane, separate durable certified baseline, and checkpoint/settlement selection that prefers certified recovery. Grant budget only for new certified progress, deduplicated by certificate/edit identity. Test that sequence, repeated certificates, rejected exact claims, and unchanged Melee behavior.

2. **[BLOCKING] Patched Ninja builds fail their success check. Phase 2.1.**  
   Upstream `/tmp/rmwcc/mwcc/tools/link.py:28-51` exits unsuccessfully whenever the linked executable differs from the stock SHA-1. Instrumentation necessarily differs.  
   **Fix:** add a dedicated traced-build link target and success marker. Keep stock reconstruction verification separate; do not ignore arbitrary Ninja failures.

3. **[BLOCKING] Native artifacts cannot satisfy the promised analysis modes. Phases 2.2–2.4.**  
   `compiler/mwcc_alloc/api/analyze.py:119-122,252-260` requires identity-matched scheduled PCode for `source-rank`. `vendor/mwcc-decomp/tools/stack_frame_trace.py:13-38` requires a specific stack trace schema and stock allocator addresses. Snapshot validators accept stock hashes only (`sandbox/allocator_snapshot.py:239-267`).  
   **Fix:** specify compatible PCode, creation/origin and stack artifacts or adapters. Record stock identity separately from traced executable provenance. Require native execution of every promised analysis mode, including replay across allocation classes and spill passes.

4. **[BLOCKING] `pair` changes an existing API without compatibility. Phase 2.4.**  
   Existing `pair` means two allocator stages of one compilation, and is the default (`sandbox/mwcc_alloc_capture.py:1074-1085`; `api/snapshot.py:35`). Worker schemas reject `native` and source arguments (`tools/wrappers/capabilities.ts:984-989`; `wrappers/mwcc-alloc.ts:76-99`).  
   **Fix:** preserve `pair`; add an explicit source-comparison operation and backend selector. Update Python entrypoints, sandbox shims, wrapper schemas/argument mapping, metadata and guidance together. Replacement prompt wording: “Use the native backend for one capture; use source comparison for two source variants.”

5. **[BLOCKING] Decision diffs lack cross-capture identity. Phase 2.5.**  
   Source edits can renumber vregs; object addresses also differ between compiler processes. Existing provenance uses within-capture addresses (`vendor/mwcc-decomp/tools/allocator_provenance.py:290-333`). Comparing numeric IDs can therefore report unrelated values as register changes.  
   **Fix:** match by function, allocation pass/class, source declaration/site and temporary origin. Preserve raw IDs locally and report ambiguous correspondence. Test an early-local insertion that renumbers subsequent vregs.

### Versions and host delta

1. **[BLOCKING] Deferred 1.1p1 support conflicts with mandatory native capture. Phases 2.1, 2.4 and §4.**  
   SMS uses `GC/1.1p1` (`games/sms/workspace/checkout/configure.py:637`); compiler selection is per build edge (`ninja_compile.py:840`). Neither proposed binaries nor existing qemu captures cover it.  
   **Fix:** support and validate 1.1p1 before universal rollout, or explicitly exclude those units. Replacement wording: “Use native capture only for the unit’s validated compiler version. If unsupported, record that limitation and continue with stock compilation and available evidence.”

2. **[BLOCKING] Global revert IDs can reconstruct the wrong S*. Phase 4.1.**  
   `steering_check.py:3091-3097` can select `evidence_sstar`; `:3137-3145` can select `steering_sstar`. Both differ from the global `mwcc.revert_edits` variant.  
   **Fix:** persist each function’s selected variant, effective revert IDs and input hashes. Reconstruct that exact variant and verify its measured result before publishing a delta.

3. **[BLOCKING] The host lacks a specified MWCC build environment. Phase 4.1.**  
   The generated manifest covers `build/<version>/include` and can omit file contents (`steering_check.py:351-362`). `units.flags` contains IR-oracle flags, not MWCC flags (`:417-435`). `ninja_compile.py:834-862` additionally needs the build edge, selected compiler, runner and sometimes SJIS wrapper.  
   **Fix:** provision an isolated, pinned host workspace with exact MWCC flags/version, generated dependencies, wrappers and platform-specific wibo. Transfer or regenerate missing include contents and verify hashes. Do not compile in the mutable integration checkout.

4. **[BLOCKING] C++ probes disappear before enrichment. Phase 4.1.**  
   Probe `function` is demangled and `symbol` is mangled (`steering_diagnose.py:311-312,354-356`), but persistence matches only `probe.function === fn.name` (`worker/steering-validation.ts:458`). Many SMS observations consequently store no probe.  
   **Fix:** match unit plus `probe.symbol === fn.name || probe.function === fn.name`; test a mangled SMS symbol. Give enrichment jobs an exact observation ID and input/tool hashes. Add durable queue registration, bounded retries and idempotent storage rather than updating whichever observation is newest.

5. **[BLOCKING] Compiler references have no sandbox delivery path. Phase 3.2–3.3.**  
   Existing provisioning transfers the game bundle, toolpack and reports (`job-queue/provisioning.ts:268-280`), not host reference directories. The evidence tool uses a command enum, not `--mode` (`tools/wrappers/capabilities.ts:794-803`).  
   **Fix:** package and provision pinned compiler sources at the promised sibling path, verify the commit, and repair resumed sandboxes. Add a `compiler` command through the existing tool contract. Replacement wording: “Search the pinned compiler source with `real_code_evidence`, command `compiler`.”

### Rollout and validation

1. **[BLOCKING] Parallel implementation is mistaken for safe activation order. §3 and Phase 1.7.**  
   Phase 1’s prompt requires Phase 2 capture and Phase 3 references. Adding `ordering.registries` alone also prevents game loading because the parser rejects unknown keys (`game-registry/resolver.ts:459-467`); `matching.budgetExtension` currently has no parser/type support (`:85-88,453-455`).  
   **Fix:** implement independently, then activate schemas/provisioning → validated capture/reference tools → prompts and certified budgeting → enrichment. Default Melee explicitly to score budgeting. Gate activation on an actual provisioned-sandbox tool call and prompt rendering.

2. **[NON-BLOCKING] The unverified sweep assumes distinct reduced sources exist. Phase 4.3.**  
   Unresolved edits can remain retained; extra diagnostic reduction applies only to particular steering-shaped groups (`steering_check.py:1990-2020`). Candidate versus S* can therefore be identical.  
   **Fix:** inventory usable, identical and unavailable pairs first. Label additional ablations separately; never interpret an unavailable comparison as an empty compiler delta.

3. **[NON-BLOCKING] Native execution needs explicit resource limits. Phases 2.3–2.4 and 5.**  
   `ninja_compile.py:922` runs without a timeout. Default SMS workers have one CPU and 2 GiB (`games/sms/config/sandbox.json:5-13`); the prototype establishes neither full-trace latency nor memory use.  
   **Fix:** add compiler override, environment and deadline parameters to the compile helper, with process cleanup and artifact-size limits. Benchmark native capture on that profile before claiming seconds per call. Retain cache disabling and verify capture still executes with a warm object cache.

4. **[NON-BLOCKING] Private Git does not establish binary redistribution rights. Phase 2.1.**  
   Upstream builds incorporate downloaded runtime sources and original split objects (`/tmp/rmwcc/mwcc/README.md:49-63`); repository CC0 does not establish rights over those inputs.  
   **Fix:** commit pins, patches and build scripts. Keep executable delivery in an authorized artifact channel unless rights for committing and distributing the combined binaries are established.

11 blocking findings.

