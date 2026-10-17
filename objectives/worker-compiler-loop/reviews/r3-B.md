Resolve native capture dispatch before activation.

Prior B blocking findings:

| Finding | Status | Why |
|---|---|---|
| B-1 certified recovery | RESOLVED | §3.1 specifies the repair lane, durable certified baseline, checkpoint selection and settlement. |
| B-2 traced linking | RESOLVED | §3.3.1 separates traced linking from stock SHA verification. |
| B-3 native analysis schemas | RESOLVED | §3.3.4 defers PCode-dependent analysis to qemu. |
| B-4 `pair` API compatibility | RESOLVED | §3.3.4 preserves its meaning and introduces separate source comparison. |
| B-5 cross-capture identity | RESOLVED | §3.3.5 requires site/origin matching, ambiguity handling and a renumbering test. |
| B-6 1.1p1 support | RESOLVED | §3.3 includes that version and explicit capability limitations. |
| B-7 selected S* | RESOLVED | §3.4.1 persists each function’s actual variant and effective revert IDs. |
| B-8 host build environment | RESOLVED | §3.4.1 moves reconstruction into a build sandbox. |
| B-9 missing C++ probes | RESOLVED | §3.0 fixes symbol matching; §3.4.1 keys enrichment by observation ID. |
| B-10 compiler-source delivery | RESOLVED | §3.4.4 specifies provisioning, resume repair and the existing command enum. |
| B-11 activation/schema order | RESOLVED | §3.0 adds parser support; §5 requires provisioned tool calls before prompt activation. |
| B2-1 missing PCode | RESOLVED | Milestone 1 explicitly excludes PCode-dependent native analysis. |
| B2-2 omitted hybrid patches | RESOLVED | Per-version capabilities and event-presence tests cover this. |
| B2-3 header-changing variants | RESOLVED | Overlay manifests and shadow roots cover header/TU combinations. |
| B2-4 reconstruction fidelity | RESOLVED | Dependency verification and recorded object equality precede tracing. |

1. **[BLOCKING] Default capture conflicts with milestone-1 capabilities.**  
   **Section:** §3.3.4.

   The new milestone split excludes native PCode, but backend selection defaults validated versions to native. Existing default `pair` requires a PCode allocator artifact alongside coloring artifacts: `toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py:36`, `sandbox/mwcc_alloc_capture.py:673-677,1074-1085`. The fallback list covers analysis modes only. Default capture therefore cannot preserve its promised contract under native milestone 1.

   **Fix, replacement wording:** “Select the backend by requested operation and version capability. During milestone 1, existing `pcode`, `pair` and `trace` captures use qemu; native supports coloring and decision captures. Return the actual backend and preserve the default pair’s complete artifact contract in a regression test.”

   Also add `origins` to the qemu analysis list; `api/analyze.py:208-215` consumes provenance.

2. **[NON-BLOCKING] Fidelity capture needs changes in the gate’s compile helper.**  
   **Section:** §3.4.1.

   “From the depfile” assumes an artifact the gate does not currently produce. `toolpacks/gamecube-decomp/_impl/gamecube/tools/stack_check.py:400-412` constructs its own command without dependency-output flags. Updating `ninja_compile.py` alone will not supply candidate/S* dependencies.

   **Fix, replacement wording:** “Make `stack_check.compile_in` emit and retain a fresh depfile for each candidate and selected-S* compile. Hash the resolved variant inputs, including generated includes, before shadow-root reuse or cleanup. Do not reuse checkout depfiles or `.ninja_deps`.”

1 blocking finding.