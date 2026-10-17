Resolve the missing human-review handoff before activation.

Prior B blocking findings, checked against v4:

| Finding | Status | Why |
|---|---|---|
| B-1 certified recovery | RESOLVED | §3.1 specifies repair acceptance, certified checkpoints, settlement and budgeting. |
| B-2 traced linking | RESOLVED | §3.3.1 separates traced linking from stock SHA verification. |
| B-3 native analysis schemas | RESOLVED | §3.3.4 keeps PCode-dependent modes on qemu. |
| B-4 `pair` compatibility | RESOLVED | Existing meaning and artifact contract remain unchanged. |
| B-5 cross-capture identity | RESOLVED | §3.3.5 requires site/origin matching and explicit ambiguity. |
| B-6 1.1p1 | RESOLVED | Build, capability limitations and unavailable handling are specified. |
| B-7 selected S* | RESOLVED | §3.4.1 persists the actual per-function variant and revert IDs. |
| B-8 host build environment | RESOLVED | Reconstruction runs in a build sandbox. |
| B-9 C++ probes | RESOLVED | §3.0 fixes symbol matching; enrichment uses observation IDs. |
| B-10 compiler-source delivery | RESOLVED | §3.4.4 specifies pinned delivery, resume repair and `compiler` command. |
| B-11 activation/schema order | RESOLVED | Parser support and provisioned tool calls precede prompt activation. |
| B2-1 missing PCode | RESOLVED | Milestone 1 explicitly excludes dependent native modes. |
| B2-2 omitted hybrid patches | RESOLVED | Per-version capabilities and event-presence checks cover omissions. |
| B2-3 header-changing variants | RESOLVED | Overlay manifests and shadow roots cover headers and TUs. |
| B2-4 reconstruction fidelity | RESOLVED | Dependency verification and recorded object equality precede tracing. |
| B3-1 default native capture | RESOLVED | Dispatch now depends on operation; `pcode`, `pair`, `trace` retain qemu. |

Prior non-blocking B3-2 is also resolved: §3.4.1 explicitly changes `stack_check.compile_in` to produce fresh depfiles.

1. **[BLOCKING] The promised evidence adjudication queue does not exist.**  
   **Section:** §3.1 evidence-review constructs; §4 probes.

   This revision promises automatic delivery to an “existing evidence adjudication queue.” The gate only marks the group unresolved (`toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1096-1111`). Worker code reads curated approval files (`apps/server/src/core/agent-catalog/agents/running/worker/steering-validation.ts:253-264`) and records observations (`:462-466`). Neither implements this human-review handoff. The registered job kinds also contain no evidence-review job (`apps/server/src/core/job-queue/types.ts:4-11`). A supported construct therefore remains rejected without the promised review path.

   **Fix:** explicitly implement a durable human-review inbox, preserving the rejected patch, site evidence, base revision and group identity. Define operator approval/rejection and fresh validation after approval; require a handoff test before §5 step 3.

   **Replacement wording:** “On `evidence_review`, persist a deduplicated human-review request containing the construct, patch and cited site evidence. Keep the attempt rejected pending an operator decision. Operator approval updates the curated approvals; acceptance requires fresh gate validation.”

2. **[NON-BLOCKING] Probe formatting drops sibling certification.**  
   **Section:** §3.0 sibling evidence; §3.4.2 probe changes.

   `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_diagnose.py:295-296` converts usage results to `function (match_percent)`. Adding certification and revision fields to `usage` alone leaves this adapter discarding them under `evidence.sibling_uses`.

   **Fix:** explicitly include `prefetch_evidence` in the change. Preserve certification and revision; put uncertified siblings under hypotheses. Verify that a mixed certified/unverified result retains that distinction after `fit()` applies its size cap.

1 blocking findings.

