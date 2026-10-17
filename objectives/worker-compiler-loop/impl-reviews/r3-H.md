1. [BLOCKING] Historical certification misses newly shadowing headers. [sync-certification.ts:124](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/sync-certification.ts:124). Adding `include/F.h` can shadow an unchanged `libs/JSystem/include/F.h`. Every recorded dependency hash and checked configuration stays unchanged, so an ancestor pass still certifies a different compile. Fix: require a fresh pass or prove current dependency resolution and compile identity match. R2 #1 NOT RESOLVED. Non-ancestor passes are now rejected. New versus `origin/main`.

2. [BLOCKING] Namespace collisions delete untouched functions. [certified-merge.ts:749](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:749). Identical `A::f()` and `B::f()` bodies receive keys `f()` and `f()#2`. An unrelated conflict causes deduplication to delete `B::f()`, returning `error:null`. Fix: include the full namespace stack in function identity and restrict deduplication to identical lexical scope. Pure reproduction confirmed. New versus `origin/main`.

3. [BLOCKING] Literal-only inline changes bypass operator review. [certified-merge.ts:368](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:368). Conflicting class inline bodies returning `"base"`, `"ours"` and `"upstream"` compare identically after `stripCode` erases literals. Upstream wins silently with no decisions instead of the required operator stop. Fix: preserve literal values in executable comparisons; mask them only for syntax scanning. Pure reproduction confirmed. New versus `origin/main`.

4. [BLOCKING] External additions disappear without an insertion anchor. [certified-merge.ts:796](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:796). Ours adds externally called `publicApi()` before the first existing function; upstream adds another function there. With no predecessor or local caller, insertion is skipped and `publicApi()` is recorded as dropped. Fix: insert retained additions at a scope-preserving position regardless of local callers. Pure reproduction confirmed. R2 #3 NOT RESOLVED. New versus `origin/main`.

5. [BLOCKING] Existing helper reversions bypass the linkage guard. [certified-merge.ts:709](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:709). Ours changes external `helper()` from `x+0` to `x+1`. When its local caller loses to upstream, cleanup silently reverts `helper()` despite callers in other translation units. Fix: require internal linkage and prove no remaining uses before reverting helpers, as for deletion. Pure reproduction confirmed. R2 #3 NOT RESOLVED. New versus `origin/main`.

| Prior check | Result |
|---|---|
| R2 #1, compile-input binding | NOT RESOLVED. Finding 1. |
| R2 #2, preprocessor identity | RESOLVED. Conditional branches retain distinct keys and definitions. |
| R2 #3, helper safety | NOT RESOLVED. Findings 4–5. |
| R2 #4, knowledge-v2 holds | RESOLVED. Ingestion and summarization use game-aware `unitVariants`. |
| Confirmed-good rule 6 | RESOLVED. `reasonAt` checks normalized holds at the integrated revision. |

No new raw-unit mismatch found across the requested consumers. Typecheck passed. Focused S12 tests produced 4 passes; 22 tests stopped at sandbox-denied temporary-directory creation.

5 blocking findings.

