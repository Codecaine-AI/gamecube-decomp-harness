Resolve B-3 and three new blockers before implementation.

Prior blocking findings, checked against revised text and code:

| Prior | Status | Why |
|---|---|---|
| B-1 | RESOLVED | §3.1 specifies repair validation, certified checkpoints, settlement and progress budgeting. |
| B-2 | RESOLVED | §3.3.1 separates stock verification from traced linking. |
| B-3 | NOT RESOLVED | Native provenance/explain still require PCode absent from the trace specification. |
| B-4 | RESOLVED | §3.3.4 preserves `pair` and adds a separate comparison operation. |
| B-5 | RESOLVED | §3.3.5 specifies stable correspondence, ambiguity handling and a renumbering test. |
| B-6 | RESOLVED | 1.1p1 is included; unsupported versions are explicitly handled. |
| B-7 | RESOLVED | §3.4.1 requires the selected per-function S* variant and effective revert IDs. |
| B-8 | RESOLVED | Compilation moves into a configured build sandbox. |
| B-9 | RESOLVED | Symbol matching, exact observation IDs, idempotency and retries are specified. |
| B-10 | RESOLVED | Pinned compiler sources are provisioned and repaired on resume; `compiler` uses the command enum. |
| B-11 | RESOLVED | Parser changes precede activation; provisioned-sandbox calls precede prompt rollout. |

1. **[BLOCKING] Native provenance still lacks required PCode. Plan §3.3.2–3.3.4. Prior B-3.**  
   Graphs and vreg origins are insufficient. [`allocator_provenance.py:674`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/compiler/mwcc_alloc/vendor/mwcc-decomp/tools/allocator_provenance.py:674) calls `flatten_pcode`, which requires blocks, instructions and operands. [`explain_register.py:121`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/compiler/mwcc_alloc/vendor/mwcc-decomp/tools/explain_register.py:121) follows definition/use links. The proposed trace table supplies neither schema.  
   **Fix:** require native PCode, operand and use/def capture plus a tested provenance adapter. Otherwise add provenance and explain to the explicit qemu fallback list.

2. **[BLOCKING] Hybrid linking silently omits trace patches. Plan §3.3.1–3.3.3. New.**  
   [`configure.py:149`](/tmp/rmwcc/mwcc/configure.py:149) links rebuilt objects only for matching sources. For 1.1p1, `CodeGen.c`, `StackFrameEABI.c` and `Scheduler.c` are nonmatching; for 1.2.5n, `StackFrameEABI.c` is nonmatching. Their patched sources therefore do not enter the executable. The byte-identity sweep can pass while promised trace events are absent.  
   **Fix:** define trace capabilities per version. Explicitly validate any substitution of rebuilt nonmatching objects, or mark those capabilities unavailable. Require event-presence tests for origins and frame ownership before provisioning, alongside byte equality.

3. **[BLOCKING] Two source files cannot represent header-changing S*. Plan §3.3.4 and §3.4.1. New.**  
   `compare-sources --a <file> --b <file>` cannot express the complete path-to-content/absence variants produced by [`steering_check.py:1613`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1613). A header-only probe leaves identical TU files. Moving copied sources also risks changing quote-include resolution, explicitly constrained by [`ninja_compile.py:875`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/ninja_compile.py:875).  
   **Fix:** accept two overlay manifests or trees, including deletions, plus the unit and logical source path. Compile through isolated shadow roots. Test header-inline-only and mixed TU/header changes.

4. **[BLOCKING] Reconstruction class does not prove historical fidelity. Plan §3.4.1. New.**  
   Checking only the recorded result class admits different reconstructed objects: many instruction differences classify as `code` at [`steering_check.py:1571`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1571). A fresh sandbox supplies the toolchain, but not necessarily identical generated inputs. The existing manifest omits large/binary contents at [`steering_check.py:360`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:360). The job could publish a delta for different builds.  
   **Fix:** persist candidate and selected S* object hashes, exact compile arguments, compiler identity and dependency hashes. Reconstruct and verify dependencies, rebuild both variants, and require recorded object equality before tracing. Report unavailable when historical inputs cannot be reproduced.

4 blocking findings.

