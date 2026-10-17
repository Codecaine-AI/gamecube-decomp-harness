Prior A blockers, checked against v4:

| Prior finding | Status | Why |
|---|---|---|
| A-1 budget replenishment | RESOLVED | §3.1 requires a new certified high-water mark or first certification; repeated submissions cannot qualify. |
| A-2 lower-score repairs | RESOLVED | §3.1 adds repair acceptance, certified checkpoint selection and settlement. |
| A-3 / A3-2 circular helper evidence | RESOLVED | §3.2 explicitly replaces technique 8 and both inline-boundary instructions; §4 requires site-specific evidence. |
| A-4 / A2-2 invented original-run provenance | RESOLVED | §4 steps 4–5 separate candidate measurements from predictions and unknown original constructs. |
| A-5 / A2-3 / A3-1 unbounded diagnostics | RESOLVED | §4 caps hypotheses, captures and compiler reads, including supported hypotheses. |
| A-6 invented certified subset | RESOLVED | §4 denies per-edit approval, including omitted edits. |
| A-7 / A2-1 stack and Melee contradictions | RESOLVED | Game-specific rendering preserves SMS restrictions and Melee’s frame/PAD_STACK policy. |
| A-8 tool restrictions and fallbacks | RESOLVED | §3.2 removes the register-only restriction; §4 supplies class-specific tools and fallbacks. |
| A-9 incomplete done definition | RESOLVED | §4 includes strict matching, review gates and unrelated-function regression checks. |
| A2-4 inaccessible report/base | RESOLVED | §3.2 specifies delivery; §5 requires successful sandbox reads before activation. |
| A3-3 approved constructs classified as probes | RESOLVED | §4 permits independently supported constructs through curated approvals. Delivery to human review has a separate integration defect below. |
| A3-4 complete removal cannot certify | RESOLVED | §3.1 adds revision-bound restoration proof without completion or budget credit. |

1. **[BLOCKING] Retained score rules tell workers to undo repairs.**  
   **Sections:** §3.2, §4 unverified instructions.

   §3.2’s replacement list omits [prompt.ts:332–333](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:332): freeze matching regions and revert regressing incremental edits. Removing a probe from an unverified 100% target changes matching instructions and lowers its score. These directives tell the worker to undo that repair before the new acceptance lane can evaluate it.

   **Fix:** explicitly replace both directives:

   > Matching instructions and score do not certify current edits. When resolving unverified work, remove unsupported edits and retain evidence-backed repairs even when the target score falls. Preserve unrelated-function regression checks and submit for fresh certification.

2. **[BLOCKING] Automatic human review relies on a nonexistent queue.**  
   **Sections:** §3.1 evidence-review constructs; §4 probes.

   [plan.md:66](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/objectives/worker-compiler-loop/plan.md:66) assumes an “existing evidence adjudication queue”; §4 promises automatic delivery. The gate emits `evidence_review` metadata at [steering_check.py:1096](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1096). The runner records rejection at [steering-validation.ts:364](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/steering-validation.ts:364) and reads curated approval files at `:260`. No application consumer routes that metadata to human review. A supported inline can therefore receive repeated rejection without the promised decision.

   **Fix:** explicitly implement durable routing, retaining target, revision, edit-group identity, patch and citations. Require one rejected construct to produce one review item before activating the promise. Replacement wording:

   > An unapproved construct remains rejected. The runner queues its patch and cited evidence for human review. Stop this lead pending that decision; do not resubmit it unchanged.

3. **[NON-BLOCKING] Permuter iterations can bypass the diagnostic allowance.**  
   **Sections:** §3.2; §4 diagnostic allowance.

   §4 limits “build-or-capture runs,” while retained [prompt.ts:458](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:458) permits permuter iterations “in the hundreds.” A worker can count one invocation as one run despite hundreds of candidate compilations.

   **Fix:** replace that guidance and clarify the allowance:

   > Every candidate compile counts toward the six-build limit, including internal permuter iterations and both variants of compare-sources. Set max_iters from the remaining allowance.

2 blocking findings.