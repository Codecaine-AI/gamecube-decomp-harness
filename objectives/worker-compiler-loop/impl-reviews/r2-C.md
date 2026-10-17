Prior blockers:

1. **R1-C-1 RESOLVED.** Missing/corrupt certification becomes `unknown`; both evidence predicates exclude it. Eight probe tests pass, including preservation through `fit()`.
2. **R1-C-2 RESOLVED.** Cleared history respects revision ancestry. In-memory SQLite reproduction: certification at B leaves A held and clears B.
3. **R1-C-3 RESOLVED.** Structural bounding preserves valid JSON. The six-overload regression passes with verdict and omission counts retained.

New findings:

1. **[BLOCKING] Edited siblings inherit an older certificate.** `toolpacks/gamecube-decomp/_impl/gamecube/tools/evidence_search.py:1159` reads working-tree source; `:1187` assigns the provisioned revision’s certification. Reproduced: change a certified sibling’s `zero()` call to `scale()` without rebuilding or certifying. `usage` reports the new call as `certified`, `matched: true`; prefetch places it in `sibling_uses`. **Fix:** search source and reports bound to the certification revision, or classify changed/unbound inputs as unknown hypotheses. Validate snapshot game/revision and add a dirty-source regression.

2. **[BLOCKING] UNUSED writes checkout caches.** `toolpacks/gamecube-decomp/validation/steering_check/api/unused_test.py:45` invokes code whose cold metadata cache writes inside `build/.ninja_compile_cache`; extab compiles also cache normalized objects there. A write-intercept reproduction confirmed the checkout destination. **Fix:** redirect all ninja_compile caches outside the checkout before invocation; test that checkout contents remain unchanged.

Temporary-file tests were blocked by read-only permissions. Typecheck fails at `steering-explain.test.ts:57`, within the excluded compiler-delta slice. Exact upstream SMS knowledge provenance remains unverified.

2 blocking findings.