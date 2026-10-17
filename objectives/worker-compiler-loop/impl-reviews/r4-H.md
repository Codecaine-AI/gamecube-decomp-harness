1. [BLOCKING] Literal comparison still hides executable changes. [certified-merge.ts:417](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:417). Whitespace normalization also changes string literals. Reproduced conflicting inline returns `"a b"` versus `"a  b"`: upstream wins with `decisions: []`, `error: null`, bypassing operator review. Fix: normalize only outside literals; add this regression. R3 #3 NOT RESOLVED.

2. [BLOCKING] Report evidence mixes unrelated namespaces. [certified-merge.ts:557](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:557). Key `f()@[namespace A]` matches both `A::f()` and `B::f()`. Reproduced certified A scoring 100 versus upstream 90 losing because unrelated B scores 80 versus 85. Fix: include the lexical namespace when binding report symbols; test differing scores and certification across namespaces.

3. [BLOCKING] Modify/delete conflicts abort operator Sync. [certified-merge.ts:918](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:918). Upstream deleting a locally modified C++ file throws despite `unresolvable: "leave_unmerged"`. The caller aborts the merge, preventing normal conflict resolution. Fix: route through `toOperator`, retain merge stages, and return `needs_operator` with certification statuses.

4. [BLOCKING] Retry loses build-fixer provenance. [boundary-sync.ts:810](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/boundary-sync.ts:810). If the fixer commits and a later symbol check or knowledge step fails, retry initializes `buildFixer = null`. Its successful report rebuild skips the fixer and writes `post_merge.build_fixer: null`, losing the required record. Fix: persist fixer files/commit immediately in the recovery journal and restore them on retry; cover a post-fixer failure.

All four are new versus `origin/main`.

| R3 finding | Status |
|---|---|
| #1 Historical certification | RESOLVED: passes/certificates must equal pinned ours. |
| #2 Namespace deletion | RESOLVED: scoped identity; dedup removed. Finding 2 is separate evidence binding. |
| #3 Literal comparison | NOT RESOLVED: finding 1. |
| #4 Missing insertion anchor | RESOLVED: same-scope neighbor or operator. |
| #5 Helper reversions | RESOLVED: cleanup heuristics removed. |

No remaining unit-name mismatch found across the requested consumers. The branch repairs raw comparisons present on `origin/main`.

Typecheck passed. Focused S12 tests: 4 passed; 23 blocked by sandbox `EPERM` during temporary-directory creation. Focused unit-name tests: 10 passed.

4 blocking findings.

