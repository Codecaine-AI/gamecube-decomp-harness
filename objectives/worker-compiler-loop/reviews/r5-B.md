Prior B blockers checked against v5:

| Finding | Status | Why |
|---|---|---|
| B-1 certified recovery | RESOLVED | §3.1 specifies repair acceptance, certified checkpoints and settlement. |
| B-2 traced linking | RESOLVED | §3.3.1 separates traced linking from stock verification. |
| B-3 native analysis schemas | RESOLVED | §3.3.4 keeps PCode-dependent modes on qemu. |
| B-4 `pair` compatibility | RESOLVED | Existing operation and artifact contract remain unchanged. |
| B-5 cross-capture identity | RESOLVED | §3.3.5 requires site/origin matching and ambiguity reporting. |
| B-6 1.1p1 | RESOLVED | Build, capability limits and unavailable handling are specified. |
| B-7 selected S* | RESOLVED | §3.4.1 persists each function’s selected variant and revert IDs. |
| B-8 host build environment | RESOLVED | Reconstruction runs in a build sandbox. |
| B-9 C++ probes | RESOLVED | §3.0 fixes symbol matching; enrichment uses observation IDs. |
| B-10 compiler-source delivery | RESOLVED | §3.4.4 specifies pinned provisioning, resume repair and `compiler`. |
| B-11 activation/schema order | RESOLVED | Parser support and provisioned tool calls precede activation. |
| B2-1 missing PCode | RESOLVED | Milestone 1 explicitly excludes dependent native modes. |
| B2-2 omitted hybrid patches | RESOLVED | Per-version capabilities and event-presence checks cover omissions. |
| B2-3 header-changing variants | RESOLVED | Overlay manifests preserve header/TU combinations and logical paths. |
| B2-4 reconstruction fidelity | RESOLVED | Dependency verification and recorded object equality precede tracing. |
| B3-1 default native capture | RESOLVED | Dispatch is operation-specific; `pcode`, `pair`, `trace` retain qemu. |
| B4-1 human-review handoff | RESOLVED | §3.1 explicitly adds persistence, operator decisions and fresh validation. |

1. **[BLOCKING] Approval can certify a different construct use.**  
   **Section:** §3.1 evidence-review constructs.

   The new review request records a specific patch and site evidence, but the existing approval lookup matches only callee symbol and enclosing function, with suffix matching for function names ([steering_check.py:1279](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1279)). It ignores unit, base, patch and call site. The reducer then marks the group real after checking shape classes ([steering_check.py:1098](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1098)). Fresh validation can therefore reuse approval for the same accessor with different operands or placement.

   **Fix:** extend the approval schema and both lookup paths to require exact game/unit/mangled target, trusted base, reviewed site and normalized edit-group digest. Changed operands, placement or accompanying edits require review. Test that the approved patch certifies while another use of the same callee does not.

2. **[NON-BLOCKING] Traced output is not checked against the reconstructed stock output.**  
   **Sections:** §3.3.3, §3.4.1.

   The delta job verifies stock objects against historical hashes, then traces without requiring traced-object equality. The provisioning sweep covers existing sources; future worker edits can exercise compiler paths outside that sweep. A trace could describe different code generation.

   **Fix:** hash both traced objects and require equality with their corresponding freshly verified stock objects, using identical extab normalization. Publish `unavailable: "traced-object-mismatch"` on failure. The compile helper already returns the object artifact ([ninja_compile.py:947](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/ninja_compile.py:947)); the delta job needs no additional stock compilations.

1 blocking findings.

