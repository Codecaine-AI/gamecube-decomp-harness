1. [BLOCKING] Comment removal joins executable tokens — [certified-merge.ts:142](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:142). For conflicting inline members, ours `return/**/foo();` and upstream `returnfoo();` compare identically after comment removal. Reproduced through `spliceCertifiedFile`: upstream returned with `decisions: []`, `error: null`, bypassing required operator review for unmappable C++. These call different functions. Fix: replace comments with whitespace in `codeViews` and `stripCode`, preserving token boundaries; add this regression. **New versus origin/main.**

| Round-4 item | Verification |
|---|---|
| Literal-preserving whitespace normalization | RESOLVED: literal bytes survive comparison. |
| Qualified report binding | RESOLVED: namespace-aware binding; ambiguity requires operator. |
| Modify/delete conflicts | RESOLVED: operator route retains unmerged stages and statuses. |
| Build-fixer provenance | RESOLVED: recovery journal persists and restores files/commit. |

No remaining unit-name mismatch found across the requested consumers. The branch fixes the raw comparisons present on `origin/main`. Historical backfill passes cannot certify ours: certification now requires the exact pinned revision.

Typecheck passed. Focused tests: 25 passed; 28 blocked by sandbox `EPERM` creating temporary directories. The blocker reproduced without filesystem writes.

1 blocking finding.

