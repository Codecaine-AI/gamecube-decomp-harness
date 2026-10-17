Prior A blockers, using §7’s numbering:

| Finding | Status | Why |
|---|---|---|
| A-1 budget replenishment | RESOLVED | §3.1 requires a new certified high-water mark or first certification. Repeated certificates cannot qualify. |
| A-2 lower-score repairs | RESOLVED | §3.1 explicitly requires acceptance and settlement for unverified 100 → certified 95 → certified 96. |
| A-3 circular evidence | RESOLVED | §4 separates candidates from site-specific evidence; §3.0 adds sibling certification provenance. |
| A-4 original-run overclaim | NOT RESOLVED | Step 4 distinguishes measurement from prediction, but step 5 still infers an original inline from candidate CSE. |
| A-5 exploration bound | NOT RESOLVED | Hypotheses are defined; work within one hypothesis remains unbounded, and the two stopping rules disagree. |
| A-6 certified subset | RESOLVED | §4 explicitly denies per-edit certification and warns about omitted edits. Report access remains a separate integration problem below. |
| A-7 stack/Melee contradictions | NOT RESOLVED | Shared instructions still prohibit Melee’s retained padding exception and stop Melee at frame-only. |
| A-8 general method/fallbacks | RESOLVED | §3.2 removes the register-only restriction; §4 restores per-class tools and unavailable-capture fallbacks. |
| A-9 incomplete done definition | RESOLVED | §4 requires strict matching, review gates and no neighboring-function regressions. |

1. **[BLOCKING] Shared text overrides Melee’s acceptance policy.**  
   **Sections:** §3.2, §4 definition/probes/evidence.

   §4’s untagged frame-only stop contradicts Melee’s `match_frame` policy. Its blanket padding-probe ban contradicts §3.2’s retained `PAD_STACK` exception. The untagged “100% but not certified is not done” also reaches ungated Melee, while “certified matching functions” excludes its accepted siblings. See [prompt.ts:49](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:49) and [prompt.ts:57](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:57).

   **Replacement:** “[SMS] An uncertified match is not done. On runner-confirmed frame-only results, stop and report frame-only without claiming exact. [Melee] Frame-only remains incomplete; follow Melee’s existing stack policy, including its last-resort PAD_STACK exception. That exception survives the general probe prohibition. For sibling evidence, require SMS certification or Melee’s existing acceptance checks.”

2. **[BLOCKING] Step 5 still turns candidate CSE into invented provenance.**  
   **Section:** §4 step 5, plan lines 203–206.

   “The second read … is a CSE temp, so the original read it through an inline” is the exact inference step 4 prohibits. Ordinary repeated expressions can also create CSE temps. This example teaches compiler-justified helper invention.

   **Replacement:** “Name candidate construct kinds consistent with the measurement. For example: ‘The candidate’s second field read became a CSE temp. An inline containing that read is one candidate to investigate; original inline use remains unknown until site-specific evidence supports it.’”

3. **[BLOCKING] Three hypotheses does not bound diagnostics consistently.**  
   **Sections:** §4 stopping rule and diagnostic budget.

   The definition stops after three hypotheses **when none is supported**; the budget paragraph stops after three regardless. Neither limits reading, captures or probes within one hypothesis. Workers can spend the claim reading compiler source, or stop on the third hypothesis despite finding a supported construct.

   **Replacement:** “Before exploration, set a finite diagnostic allowance within the remaining claim budget, covering compiler reading, captures and probe runs. Stop when it expires, or after three distinct unsupported construct hypotheses on an unchanged residual. A supported lead may continue within the same allowance. Record unknowns and untried leads when stopping.”

4. **[BLOCKING] The required full report and trusted base are not delivered.**  
   **Sections:** §3.2, §4 unverified paragraph, §5 activation.

   “Read the full report it points to and the trusted base” assumes fields the worker never receives. [previous-attempt.ts:364](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/previous-attempt.ts:364) truncates edits and drops the report reference; [context.ts:440](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/context.ts:440) renders neither the trusted-base revision nor a report locator. The plan adds no delivery requirement.

   **Fix:** Add trusted-base revision, source path, total/omitted edit counts and a worker-readable full-report locator to the packet/XML. Provision the report and base source. Require an actual sandbox read before prompt activation.

   **Replacement:** “Read `full_report_locator` and the source at `trusted_base_rev`. If either is unavailable, record that limitation; do not infer approval from omitted edits.”

Additional non-blocking findings:

1. **[NON-BLOCKING] Hypothesis wording excludes relocation/data progress.**  
   **Section:** §4 steps 2 and diagnostic budget.

   Both the prediction and residual-reset rules require instruction changes, although step 3 explicitly supports relocation/data residuals.

   **Replacement:** “Predict the instruction, relocation or data change.” Define a changed residual using the corresponding measured diff.

2. **[NON-BLOCKING] ‘Over-claimed exact’ needs narrower wording.**  
   **Section:** §3.1.

   [worker-cycle.ts:2884](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/apps/server/src/core/harness-runtime/phases/running/workers/worker-cycle.ts:2884) passes `claimedExact: true` for every validation. Blanket removal of “improved” treatment could therefore undermine the explicitly required certified nonexact repairs.

   **Replacement:** “An exact claim supplies no acceptance or budget bypass. Independently measured, selectable certified progress remains eligible when the target is nonexact.”

4 blocking findings.

