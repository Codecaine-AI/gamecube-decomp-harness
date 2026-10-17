Prior B blocking findings, checked against v6 and code:

| Finding | Status | Why |
|---|---|---|
| B-1 certified recovery | RESOLVED | §3.1 specifies repair acceptance, certified checkpoints, settlement and budgeting. |
| B-2 traced linking | RESOLVED | §3.3.1 separates stock verification from traced linking. |
| B-3 native analysis schemas | RESOLVED | §3.3.4 keeps unsupported analysis on qemu. |
| B-4 `pair` compatibility | RESOLVED | Existing meaning and artifact contract remain unchanged. |
| B-5 cross-capture identity | RESOLVED | §3.3.5 requires site/origin correspondence and explicit ambiguity. |
| B-6 1.1p1 support | RESOLVED | Builds, capability limits and unavailable handling are specified. |
| B-7 selected S* | RESOLVED | §3.4.1 persists the actual per-function variant and revert IDs. |
| B-8 host build environment | RESOLVED | Reconstruction runs in a build sandbox. |
| B-9 missing C++ probes | RESOLVED | §3.0 fixes symbol matching; enrichment uses observation IDs. |
| B-10 compiler-source delivery | RESOLVED | §3.4.4 specifies pinned provisioning, resume repair and `compiler` command. |
| B-11 activation/schema order | RESOLVED | Parser changes and provisioned tool calls precede activation. |
| B2-1 missing PCode | RESOLVED | Milestone 1 explicitly excludes dependent native modes. |
| B2-2 omitted hybrid patches | RESOLVED | Per-version capabilities and event-presence checks cover omissions. |
| B2-3 header-changing variants | RESOLVED | Overlay manifests preserve headers, deletions and logical paths. |
| B2-4 reconstruction fidelity | RESOLVED | Dependency and historical object equality checks precede tracing. |
| B3-1 default native capture | RESOLVED | Operation-specific dispatch preserves qemu `pcode`, `pair` and `trace`. |
| B4-1 human-review handoff | RESOLVED | §3.1 adds durable requests, operator decisions and fresh validation. |
| B5-1 approval scope | RESOLVED | Both lookup paths require target/base/site/edit identity; negative tests cover reuse. |

Prior non-blocking B5-2 is also resolved: §3.4.1 requires traced-object equality with verified stock objects in both execution paths.

1. **[NON-BLOCKING] Shadow-root reference names the wrong compile helper.**  
   **Section:** §3.3.4, `compare-sources`; resource limits.  
   [`ninja_compile.py:875`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/ninja_compile.py:875) documents direct compilation with an adjacent source override. The gate’s shadow-root implementation is [`stack_check.py:377`](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/stack_check.py:377), with compilation at `:400`. The plan assigns compiler override/environment/deadline/output-cap changes only to `ninja_compile.py`, leaving their application to shadow-root compilation unclear.  
   **Fix, replacement wording:** “Reuse `stack_check.make_shadow_root` and `compile_in`, preserving logical source paths and quote-include resolution. Apply compiler override, trace environment, deadline, process cleanup and output caps to this compilation path too.”

No blocking findings.

