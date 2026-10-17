Prior A blocking findings, verified against v6:

| Finding | Status | Why |
|---|---|---|
| A-1 budget replenishment | RESOLVED | §3.1 requires new certified progress and deduplicates grants. |
| A-2 lower-score repairs | RESOLVED | §3.1 defines repair acceptance, certified checkpoints and settlement. |
| A-3 / A3-2 circular helper evidence | RESOLVED | §3.2 replaces helper directives; §4 requires site-specific evidence. |
| A-4 / A2-2 invented provenance | RESOLVED | §4 separates candidate measurements from original-source hypotheses. |
| A-5 / A2-3 / A3-1 unbounded diagnostics | RESOLVED | §4 defines hypotheses and caps runs, reads and supported continuation. |
| A-6 invented certified subset | RESOLVED | §4 explicitly denies approval of retained or omitted edits. |
| A-7 / A2-1 stack/Melee contradictions | RESOLVED | Conditional rendering preserves each game's frame policy and Melee's padding exception. |
| A-8 restricted method/fallbacks | RESOLVED | Residual-specific tools and unavailable-trace fallbacks cover non-register work. |
| A-9 incomplete done definition | RESOLVED | Strict matching, review gates and unrelated-function regression checks remain required. |
| A2-4 inaccessible report/base | RESOLVED | §3.2 provisions both; §5 requires successful sandbox reads. |
| A3-3 approved constructs prohibited | RESOLVED | §4 permits independently supported constructs through approvals. |
| A3-4 restoration cannot certify | RESOLVED | §3.1 adds base-identity restoration without completion or budget credit. |
| A4-1 score rules undo repairs | RESOLVED | §3.2 explicitly replaces freeze/revert directives. |
| A4-2 nonexistent review queue | RESOLVED | §3.1 specifies durable requests, operator decisions and fresh validation. |
| A5-1 approval escapes reviewed site | RESOLVED | Both lookup paths require site-bound edit identity; negative tests cover reuse. |

1. **[NON-BLOCKING] Unavailable compiler data triggers an unconditional retry.**  
   **Section:** §4 `steering_probe`, [plan.md:300](/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/objectives/worker-compiler-loop/plan.md:300).

   “Marked unavailable” includes unsupported compiler capabilities, yet the worker must run `compare-sources` anyway. This conflicts with step 3's fallback and wastes diagnostic allowance on known limitations.

   **Replacement:** “If compiler_delta is absent or stale, compare the identified variants when the required compiler capabilities are available. If unavailable, record the reason and continue from assembly or other evidence; do not retry a known unsupported capture.”

No blocking findings.

