# Task C: Worker tool descriptions and two tool fixes

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Work only in `apps/server/src/core/tools/**` (metadata, wrappers, tests) and `toolpacks/gamecube-decomp/validation/checkdiff/api/direct_compile.py`. Do NOT touch files with uncommitted changes (`git status`). Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

## Why
The worker prompt was rewritten to a diff-first loop with an explicit tooling section. The model-facing tool descriptions (`use_when` / description strings in `apps/server/src/core/tools/metadata/capabilities.ts` and the wrapper descriptions in `apps/server/src/core/tools/wrappers/capabilities.ts` / `knowledge.ts`) must agree with it and with what the tools actually return.

## Description updates (model-facing strings only; keep ids, params, and behavior)
1. `graph_related_functions`: replace "opseq analogs" wording with "instruction-shape analogs" (callers, callees, data references, corroborating xrefs). The "opseq" concept is retired.
2. `source_permuter_run`: describe it as a bounded probe: "Search source mutations in named functions and return the best scalar score and one source diff. Returns no instruction rows; replay the candidate and read its delta with checkdiff_run. Use only on a named region after the residual is classified." Remove "last-resort" wording.
3. `source_permuter_replay`: "Replay a saved permuter recipe and return its score and source diff; read the instruction delta with checkdiff_run afterwards."
4. `mwcc_alloc_snapshot` / `mwcc_alloc_compare`: state explicitly "GPR coloring only; no FPR coloring; before/after are two stages of one compile, not candidate vs target."
5. `mwcc_debug_diagnose_regflow`: "one compact register-only window; not full liveness or FPR coloring."
6. `checkdiff_run`: mention that `full_diff` returns up to 24 mismatching rows with kind and both sides (left = target, right = current), and that instruction parity can still hide strict relocation/data differences.
7. `direct_compile_tu`: "Pass exactly one of `function` or `unit`."
8. `kv2_attempt_search`: mention that it accepts either a target stable key or a text query and returns run narratives (summary, observations) with the hits.

## Fix 1 — `direct_compile_tu` argparse conflict
`toolpacks/gamecube-decomp/validation/checkdiff/api/direct_compile.py` lines ~20–24 declare `--function` and `--unit` mutually exclusive, but the server wrapper (`apps/server/src/core/tools/wrappers/capabilities.ts` ~225–252) forwards both when both are supplied. Fix on the wrapper side: if both are supplied, forward only `function` (it implies the unit) and add a `note` field in the result saying `unit` was ignored. Add a wrapper test.

## Fix 2 — permuter invocation guard
In the `source_permuter_run` wrapper, if the adapter reports "function not found" / parse failure at the source path (see `toolpacks/gamecube-decomp/source_editing/source_permuter/api/run.py`), surface it as a top-level `status: "failed"` with `reason`, not an outer `ok` with a nested failure. Add a test.

## Rules
- Tests: `cd apps/server && bun test src/core/tools` must pass. Check `apps/server/src/core/agent-catalog/agents/running/worker/prompt.test.ts` and `kernel-catalog.test.ts` for any assertion on the strings you change (grep for "opseq", "last resort", "last-resort") and report them; do not edit those two test files — another task owns them.
- Print a summary: each description before/after (one line each), files changed, tests added. Print DONE.
