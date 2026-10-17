Bind human approvals to the reviewed edit before activation.

Prior A blocking findings:

| Finding | Status | Why |
|---|---|---|
| A-1 budget replenishment | RESOLVED | §3.1 requires new certified progress and deduplicates grants. |
| A-2 lower-score repairs | RESOLVED | §3.1 defines acceptance, checkpoint selection and settlement. |
| A-3 / A3-2 circular helper evidence | RESOLVED | §3.2 replaces helper instructions; §4 requires site evidence. |
| A-4 / A2-2 invented provenance | RESOLVED | §4 distinguishes candidate measurements from original-source hypotheses. |
| A-5 / A2-3 / A3-1 unbounded diagnostics | RESOLVED | §4 bounds hypotheses, compiles and compiler reads, including supported leads. |
| A-6 invented certified subset | RESOLVED | §4 explicitly denies approval of retained or omitted edits. |
| A-7 / A2-1 Melee contradictions | RESOLVED | Per-game rules preserve frame handling and `PAD_STACK`. |
| A-8 restricted method/fallbacks | RESOLVED | §4 supplies residual-specific tools and unavailable-trace fallbacks. |
| A-9 incomplete done definition | RESOLVED | §4 retains strict matching, review gates and regression checks. |
| A2-4 inaccessible report/base | RESOLVED | §3.2 provisions both; §5 requires successful sandbox reads. |
| A3-3 approved constructs prohibited | RESOLVED | §4 permits evidence-backed constructs through approval. |
| A3-4 restoration cannot certify | RESOLVED | §3.1 adds base-identity proof without completion or budget credit. |
| A4-1 score rules undo repairs | RESOLVED | §3.2 explicitly replaces freeze/revert directives. |
| A4-2 nonexistent review queue | RESOLVED | §3.1 specifies durable requests, operator decisions and fresh validation. |

1. **[BLOCKING] Approval can authorize unsupported edits elsewhere.**  
   **Sections:** §3.1 evidence-review constructs; §4, line 261.

   The queue records patch and edit-group identity but writes legacy approvals. `toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py:1279` matches approval only by function and callee symbol. Lines 1100–1108 then accept matching groups containing allowed shapes, without checking site or operands.

   Approval for `a->field → a->getField()` at evidenced site A therefore also authorizes `b->field → b->getField()` at unsupported site B in the same function. Separate statements do not prevent this. That certificate can earn completion and budget credit.

   **Fix:** bind approval lookup to game, unit, exact target, trusted base and normalized approved-edit identity, including site and operands. Additional or changed groups require fresh review. Verify that approval of A rejects B, altered operands and a second swap, while exact resubmission passes.

2. **[NON-BLOCKING] Review routing is promised for ineligible constructs.**  
   **Sections:** §3.1; §4, lines 254–260.

   The prompt promises automatic review for evidence-backed behaviour-identical constructs generally. `steering_check.py:1070–1094` emits `evidence_review` only for added calls to weak functions emitted in that unit. Other constructs receive no promised request.

   **Replacement:** “When the gate returns `evidence_review`, the runner queues the rejected construct and cited evidence. Stop that lead pending review. Other rejection kinds do not imply a review was queued; record their reasons.”

3. **[NON-BLOCKING] Whole-candidate comparison cannot attribute effects to each edit.**  
   **Section:** §4 unverified instructions, lines 289–291.

   Comparing accumulated edits against the trusted base measures their combined effect. It cannot establish what each unexplained edit changed, especially when edits interact through CSE or allocation.

   **Replacement:** “Compare the complete candidate against the trusted base first. Attribute a compiler change to one edit only after an isolated with/without comparison. Report interacting or ambiguous groups as such, within the diagnostic allowance.”

1 blocking finding.