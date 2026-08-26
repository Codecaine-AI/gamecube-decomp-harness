# Sandbox tool-execution audit (2026-08-25)

Question: with sandbox-only workers, does every CPU-bound tool actually execute inside the
claim's sandbox? Answer as of main @ c888cdbc: **no** — the routing exists for 3 tools; the
rest of the build/compiler-coupled family still executes host-side `python3` with
`--repo-root /opt/melee`, a path that only exists inside the sandbox, and returns a
structured failure. Empirically reproduced: `checkdiff/api/run.py --repo-root /opt/melee`
fails on the host with a `ninja_compile.py` traceback.

Reference design: `objectives/daytona-sandbox-execution/examples/phase2/corpus_tool_audit.md`
(decision 11 verdicts). This file reconciles those verdicts against the shipped code.

## Verdict table — worker tool surface

| Tool (Pi id) | CPU profile | Executes today | Should execute | Status |
|---|---|---|---|---|
| agent bash / file tools | build-heavy | sandbox | sandbox | OK (slice 3) |
| runner validation (ninja/objdiff/QA gauntlet) | build-heavy | sandbox via WorkspaceExec | sandbox | OK; ninja self-scales (nproc+2) |
| `m2c_decompile` | light (m2c) | sandbox discovery/ctx + host m2c on fetched mirror | as-is | OK (fetch-first shim) |
| `mwcc_alloc_snapshot` / `_compare` | qemu+gdb capture | sandbox | sandbox | OK |
| `type_layout_lookup` | index read; sandbox index build fallback | host read + sandbox fallback | as-is | OK |
| `code_graph_*`, `knowledge_graph_search`, `graph_related_functions`, `past_prs_search` | light, host graph DB | host | host | OK by design |
| `mwcc_debug_lookup` | light, 453 MB host corpus | host | host | OK by design |
| `asm_window_search`, mismatch_db, opseq, callgraph, ghidra | light, host indexes | host | host | OK by design |
| `review_lint_scan` (QA lane + inline text/diff evidence) | light | host | host | OK by design (host repoRoot ruling) |
| `checkdiff_run` / `checkdiff_summary` / `direct_compile_tu` | MWCC compile | **host → fails on sandbox claims** | sandbox | **FIXED 2026-08-25** (sandbox exec) |
| `objdiff_score_candidate` | objdiff over workspace objects | **host → fails** | sandbox | **FIXED 2026-08-25** (sandbox exec) |
| `source_permuter_run` / `_replay` | MWCC+objdiff search (the heavy one) | **host → fails**; API caps jobs at 1 | sandbox, jobs = sandbox cores | **FIXED 2026-08-25** (sandbox exec, jobs auto=cores) |
| `source_mutation_preview` | tree-sitter/libclang parse | **host → fails** | sandbox | **FIXED 2026-08-25** (sandbox exec) (needs python deps in image) |
| `type_oracle_lookup` | compiler-coupled | **host → fails** | sandbox | **FIXED 2026-08-25** (sandbox exec) |
| `mwcc_debug_dump_function` / `_diagnose_*` | instrumented MWCC under qemu | **host → fails** | sandbox | **FIXED 2026-08-25** (sandbox exec) |
| `review_lint_sdata2_order_helper` | reads workspace objects; validate compiles | **host → fails on sandbox claims** | sandbox | **FIXED 2026-08-25** (sandbox exec) |
| struct_infer, item_state_table, include_fixer | host lanes only (not in worker profile) | host | host | OK |

## Fix shape (implemented 2026-08-25, uncommitted on main tree)

1. Generic workspace-surface routing in `runRegisteredToolApi`: when the tool context has a
   `sandboxHandle` and the (toolId, script) pair is workspace-surfaced, exec
   `python3 /opt/toolpacks/<toolpackId>/<tool path>/api/<script>` inside the sandbox with
   workspace-mapped ORCH_* env, instead of host python. Host lanes unchanged.
2. Toolpack delivery: provisioning uploads the toolpack subset (excludes the mwcc_debug
   corpus, sandbox-image, tests, __pycache__; ~8 MB) into `/opt/toolpacks`, hash-stamped and
   skipped when the image already bakes a matching copy.
3. Permuter parallelism: API jobs cap raised (auto = min(cpu_count, 8) in the sandbox,
   explicit 1..16); host lanes keep jobs=1. Stale queue_busy/slot guidance removed.
4. Image recipe: Dockerfile/bundle bake the toolpack + python deps
   (tree-sitter, tree-sitter-c, libclang); `ORCH_GLOBAL_COMPILE_SLOTS` env dropped.
   REBAKED + LIVE-PROVEN 2026-08-25: snapshots `melee-sandbox-20260825-toolpack`
   (2 vCPU/4 GiB/5 GB, active in local.game.json) and `melee-sandbox-20260825-toolpack-4c`
   (4 vCPU/8 GiB/5 GB) from one image at baked rev 1e28b420; hermetic acceptance and an
   in-sandbox proof passed (checkdiff ok, permuter ok with cgroup-derived jobs=2,
   one-TU rebuild byte-identical). Permuter auto-jobs reads the cgroup CPU quota
   (/sys/fs/cgroup/cpu.max) because Daytona containers report the host's core count.

Resource note: snapshot pins the resource class (Daytona rejects `resources` with snapshot
creation). Both classes are baked from the same image: swap `snapshot_name` between
`melee-sandbox-20260825-toolpack` (2 vCPU) and `melee-sandbox-20260825-toolpack-4c` (4 vCPU)
in games/melee/local.game.json; permuter jobs and ninja parallelism scale automatically.
