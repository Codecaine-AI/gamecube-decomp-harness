Resolve four blockers before implementation.

Prior reviewer A blockers, checked against the revised plan and retained prompt:

| Prior | Status | Why |
|---|---|---|
| A-1 budget replenishment | RESOLVED | §3.1 requires new certified progress; repeated certificates cannot qualify. |
| A-2 lower-score repairs | RESOLVED | §3.1 specifies validation, checkpoint selection and settlement for certified repairs. Full restoration is a separate edge case below. |
| A-3 circular evidence | NOT RESOLVED | §4 fixes the evidence rule, but §3.2 leaves the existence-only helper instructions in technique 8. |
| A-4 candidate traces presented as original decisions | RESOLVED | §4 steps 4–5 distinguish observations, predictions and candidate constructs. |
| A-5 exploration bound | NOT RESOLVED | Six runs bounds captures, but compiler reading remains unbounded. |
| A-6 invented certified subset | RESOLVED | §4 explicitly denies per-edit approval, including omitted edits. |
| A-7 stack/Melee contradictions | RESOLVED | Per-game text preserves SMS prohibitions and Melee’s frame/PAD_STACK policy. |
| A-8 method restrictions/fallbacks | RESOLVED | §3.2 removes the register-only restriction; §4 supplies per-class tools and unavailable-trace fallbacks. |
| A-9 incomplete done definition | RESOLVED | §4 includes strict matching, review gates and neighboring-function regression checks. |

| Round-2 blocker | Status | Why |
|---|---|---|
| A2-1 shared Melee policy | RESOLVED | §3.2 conditional rendering and §4 game-specific rules address it. |
| A2-2 CSE implies original inline | RESOLVED | The example now explicitly leaves original inline use unknown. |
| A2-3 diagnostic allowance | NOT RESOLVED | Named files constrain location, not reading time; supported continuation remains ambiguous. |
| A2-4 report/base delivery | RESOLVED | §3.2 requires delivery; §5 requires successful sandbox reads before activation. |

1. **[BLOCKING] Diagnostic reading remains unbounded.**  
   **Section:** §4 diagnostic allowance, plan:259–263. Prior A-5/A2-3.

   Workers can read the listed compiler files indefinitely without spending another build-or-capture run. “A hypothesis that the measurement supports may continue” also leaves unclear whether six runs remains binding.

   **Replacement:** “Before exploration, set a finite total diagnostic allowance covering compiler reading, tool time and probes, leaving time to validate and submit. Permit at most six build-or-capture runs per hypothesis. Supported leads remain within both limits. Probe-induced diff changes do not reset the total allowance.”

2. **[BLOCKING] Retained helper instructions still permit circular justification.**  
   **Section:** §3.2 replacement scope; §4 steps 4–6. Prior A-3 remains open in integration.

   The replacement list omits technique 8. `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:448` says a persistent live-range cluster “usually means” the original had a helper. SMS’s instruction at `prompt.ts:76` permits extraction when a header/map/sibling merely proves existence; Melee’s at `prompt.ts:60` directly prescribes extraction. These contradict §4’s site-specific evidence requirement.

   **Fix:** Explicitly replace technique 8 and both `FRAME_TEXT.inlineBoundary` entries.

   **Replacement:** “A persistent live-range cluster suggests candidate causes; it does not identify an original helper. Retain a helper or inline change only with independent evidence connecting its operands, placement and behaviour to this site. Otherwise remove the diagnostic edit.”

3. **[BLOCKING] The probe definition also prohibits approved original constructs.**  
   **Section:** §4 steps 6–7 and Probes, plan:244–254.

   Defining every behaviour-identical edit as a probe makes an evidence-backed accessor recovery permanently unsubmit­table. The actual gate has an evidence-review exception: `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1070` reviews removable weak-inline constructs, and `:1107` marks a scoped, approved construct `real`. Step 6 can find that construct, while step 7 orders its removal.

   **Replacement:** “Use behaviour-identical edits as diagnostic probes. Compiler explanations alone never justify retaining them. An independently supported original construct may be submitted through the gate’s evidence-review path with the required scoped approval. Remove all remaining diagnostic edits; approval of a construct does not approve accompanying steering.”

4. **[BLOCKING] Removing all unexplained edits cannot satisfy the retained certificate requirement.**  
   **Section:** §3.1 repair validation; §4 unverified instructions, plan:274–277.

   Complete removal can restore the trusted base exactly. However, `apps/server/src/core/agent-catalog/agents/running/worker/steering-validation.ts:102` requires a nonempty target edit group against that base. An identical restoration has none, so `:122` cannot certify it. The plan promises removal as an alternative without defining an acceptance path for this case.

   **Fix:** Add a narrowly scoped restoration proof covering the target and relevant compilation inputs. Permit selection of the restored, nonexact checkpoint without granting exact completion or automatic progress credit.

   **Replacement:** “If removing unexplained edits restores the recorded trusted base, the runner may accept a revision-bound base-identity proof. The restored function remains incomplete unless it independently satisfies completion requirements.”

5. **[NON-BLOCKING] The compiler-file whitelist restricts the general method.**  
   **Section:** §4 diagnostic allowance/compiler list, plan:259–294.

   The list lacks control-flow transforms, instruction selection and type conversions. It even excludes coalescing’s `Registers.c`, identified in §3.3.2. Assembly fallbacks prevent a complete block, but workers cannot follow relevant compiler references.

   **Replacement:** “Start with the listed entry points. Follow references relevant to the written hypothesis within the diagnostic allowance.”

4 blocking findings.