Prior findings:

1. [BLOCKING] R1 #1 NOT RESOLVED: default host fallback remains — `apps/server/src/core/validation/steering/steering-check.ts:430`. Missing sandbox clang plus qualifying host LLVM 21 makes default `auto` run `reduce`/`decide` on the host. Compiler probing is fixed; sandbox-first execution is not. Fix: make default placement fail closed; require explicit `host` opt-in.

2. [BLOCKING] R1 #2 NOT RESOLVED: failed sweeps can enable traced compilers — `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/gate_traced_capabilities.py:68`. A full sweep with 20 units, 20 stock failures, zero successful comparisons and zero mismatches passes. Evidence from one game also suffices. Fix: require positive, consistent off/on comparison counts and coverage of the required SMS/Melee units, with explicit stock-failure exclusions.

3. [BLOCKING] R1 #3 NOT RESOLVED: QA still falls back to host diffing — `apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts:1956`. An incomplete sandbox snapshot returns `null`, reaching host `git diff --no-index` at line 2038 even with placement `sandbox`. m2c, JSystem search and type-layout routing are resolved. Fix: reconstruct the snapshot inside the sandbox or return unavailable.

4. R1 #4 RESOLVED — `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/copy_tree_within.py:29`. Recursive inventory validates dereferenced paths before copying; nested escapes and loops have regression coverage.

5. R1 #5 RESOLVED — `apps/server/src/core/harness-runtime/phases/running/workers/unverified-evidence-cache.ts:84`. Inventory generation is cached by revision and hold state; ancestry checks are asynchronous and deduplicated.

New findings:

1. [BLOCKING] Worker lint still executes on the host — `apps/server/src/core/tools/resolver.ts:31`. `review_lint` routes only `sdata2_order_helper.py`; worker `review_lint_scan` reaches host Python at line 492. File calls supply sandbox paths and return `file_not_found`; snippet calls consume host CPU. Fix: sandbox-route `scan.py`; test both file and text calls.

2. [BLOCKING] Report processing remains on the host — `apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts:833`. Baseline capture transfers complete instruction reports and parses/summarizes them at lines 873–874. Scoped validation repeats this at lines 1671/1702. At 200 workers, report-sized allocations remain despite the post-attempt summary fix. First-diff reduction at line 611, banned-idiom lint at line 2201, and symbols parsing on cache misses in `micro-gates.ts:324` also remain host computations. Fix: perform these computations in the sandbox and return bounded results.

3. [BLOCKING] Missing descriptor disables SMS map enforcement — `apps/server/src/core/validation/steering/steering-check.ts:1091`. A missing descriptor is silently skipped, omitting `ORCH_GAME_DIR`. `link_map_required()` consequently defaults false, allowing `decide` to ignore missing SMS map coverage. Fix: require readable, valid game policy before running the gate; test missing-descriptor rejection.

4. [NON-BLOCKING] MWCC misses uploaded game policy — `apps/server/src/core/validation/steering/steering-check.ts:1178`. MWCC receives no `sandboxInputs.env`, so SMS defaults to `match_frame` and loses stack-only metadata. Steering rejection remains intact. Fix: pass the uploaded policy environment to MWCC too.

Typecheck passed. Pure clang-probe tests passed. Fixture-based tests were blocked by read-only `EPERM`; runtime placement remains unverified.

6 blocking findings.