# Phase 2 slice 5a: worker corpus-tool audit

Date: 2026-08-18. Read-only source audit. Authorities: `context/01_constraints.md` decision 11 and `context/02_implementation_scope.md`.

## Scope and rule

The default worker profile contains 22 tools (`apps/server/src/core/tools/profiles/defaults.ts:17-39`) and is selected at `profiles/index.ts:45-55`. Overrides can replace/enable/disable registrations (`profiles/index.ts:57-67`). Today the resolver runs every registered tool API host-side as `python3 <api script> ...args` (`apps/server/src/core/tools/resolver.ts:344-373`). Decision 11 changes corpus-backed workspace readers to fetch-first host calls, leaves host-only knowledge calls alone, and moves build/compiler/source-coupled toolpack calls into the sandbox image.

“Corpus” here means host-generated knowledge/index data or the host-vendored tool corpus, not ordinary packaged executable code alone.

## Verdict table — default worker surface

| Worker tool | Workspace reads | Host corpus / knowledge | Build-coupled | Verdict |
|---|---|---|---|---|
| `m2c_decompile` | object tree, selected asm, context inputs | host-vendored m2c/tool corpus | yes, but decision 11 locks it host-side | **fetch-first shim needed** |
| `code_graph_file_card` | no | host graph DB | no | host-only unaffected |
| `code_graph_search` | no | host graph DB | no | host-only unaffected |
| `knowledge_graph_search` | no | host graph DB | no | host-only unaffected |
| `graph_related_functions` | no | host graph DB | no | host-only unaffected |
| `past_prs_search` | no | host graph DB | no | host-only unaffected |
| `mwcc_debug_lookup` | no | host MWCC index | no | host-only unaffected |
| `checkdiff_run` | source/deps/build graph/artifacts | no | yes | sandbox-side exec |
| `checkdiff_summary` | sources/deps/build graph/artifacts | no | yes | sandbox-side exec |
| `direct_compile_tu` | source/deps/exact build edge | no | yes | sandbox-side exec |
| `objdiff_score_candidate` | candidate/target objects, report | no | yes | sandbox-side exec |
| `mwcc_debug_dump_function` | TU/deps/build edge/target object | no | yes | sandbox-side exec |
| `mwcc_debug_diagnose_stack` | TU/deps/build edge/target object | no | yes | sandbox-side exec |
| `mwcc_debug_diagnose_regflow` | TU/deps/build edge/target object | no | yes | sandbox-side exec |
| `mwcc_debug_diagnose_inlines` | TU/deps/build edge/target object | no | yes | sandbox-side exec |
| `source_permuter_run` | TU/compiler DB/deps/build artifacts | no | yes | sandbox-side exec |
| `source_permuter_replay` | replay file plus current TU/build inputs | no | yes | sandbox-side exec |
| `source_mutation_preview` | requested source; usually compiler DB/includes | no | compiler/source-coupled | sandbox-side exec |
| `type_oracle_lookup` | requested source/compiler DB/headers | no | compiler-coupled | sandbox-side exec |
| `review_lint_scan` | supplied `file`; none for inline `text` | no; rules are packaged code | no | sandbox-side exec |
| `review_lint_sdata2_order_helper` | reference object; source on apply; build closure on validate | no | yes | sandbox-side exec |

## Per-tool evidence

### `m2c_decompile` — fetch-first

The wrapper maps the tool to `m2c_decomp/api/decompile.py`, supplies `--repo-root`, `input`, flags, and unrestricted `extra_args` (`apps/server/src/core/tools/wrappers/capabilities.ts:624-652`). The API forces only `--no-copy`, appends the input and every extra argument, and invokes host tool-local `decomp.py` (`toolpacks/gamecube-decomp/research/m2c_decomp/api/decompile.py:15-43`). Runtime binds `ORCH_GAME_REPO_ROOT` and the host implementation (`toolpacks/gamecube-decomp/_shared/toolpack_runtime.py:379-391`) and executes with workspace cwd (`toolpack_runtime.py:474-504`).

Workspace constants are `build/GALE01/{obj,asm}`, `src`, `build/ctx.c`, and `tools/m2ctx/m2ctx.py` (`toolpacks/gamecube-decomp/_impl/gamecube/tools/decomp.py:44-52`). Every call scans and opens `build/GALE01/obj/**/*.o` for the symbol (`decomp.py:56-75,185`), then selects `build/GALE01/asm/<object-relative>.s`, or `build/GALE01/asm/<input>.s` for TU fallback (`decomp.py:185-198`). m2c reads that asm and `build/ctx.c` (`decomp.py:199-213,226`). Default context generation executes workspace `tools/m2ctx/m2ctx.py` from workspace cwd (`decomp.py:109-121,215-216`), transitively reading project sources, headers, config and includes. Host-side assets are the vendored m2c/tool implementation (`decomp.py:45-46,218-226`); no graph/shared-data corpus is queried.

`extra_args` currently makes the fetch set unbounded: path-valued options add reads, and `--write` reads/writes `src/<object-relative>.c` (`decomp.py:273-292`). The bounded shim must reject `--write` and path-bearing/unrecognized extras, and fetch sandbox-generated `build/ctx.c` instead of running workspace m2ctx host-side.

### Host-only knowledge tools

The graph tools do not dispatch toolpack scripts: file card (`apps/server/src/core/tools/wrappers/knowledge.ts:177-198`), code search (`knowledge.ts:200-209`), all-source search (`knowledge.ts:211-236`), relationships (`knowledge.ts:238-267`), and past PR search (`knowledge.ts:269-278`). Their implementation opens the host graph DB, never workspace files (`apps/server/src/core/tools/runtime/execution.ts:87-173`).

`mwcc_debug_lookup` passes only query/limit to `lookup_dump.py` (`apps/server/src/core/tools/wrappers/capabilities.ts:126-132,165-174`), which searches its host tool index and receives no repo root (`toolpacks/gamecube-decomp/compiler/mwcc_debug/api/lookup_dump.py:20-27`). These six are **host-only unaffected**.

### Checkdiff, compile, and objdiff

Wrapper arguments are evidenced at `capabilities.ts:177-200` (`checkdiff_run`), `:205-218` (summary), `:222-247` (direct compile), and `:252-287` (objdiff; relative candidates are workspace-rooted by `:104-108`). The path reads are `build/GALE01/report.json` for function-to-TU lookup (`toolpacks/gamecube-decomp/_impl/gamecube/tools/checkdiff.py:221-239,298-309`; `ninja_compile.py:47,358-388`), `src/<unit>.c` (`checkdiff.py:45,72-79`), target `build/GALE01/obj/<unit>.o` (`checkdiff.py:105-134`), `build.ninja`/the exact build edge (`ninja_compile.py:391-410`), and `build/GALE01/src/<unit>.d` plus its source/header dependency closure (`ninja_compile.py:798-815`). Objdiff additionally reads the supplied candidate and target object (`toolpacks/gamecube-decomp/validation/objdiff_score/api/score_candidate.py:31-39,131-160`). No host corpus is read. Verdict: **sandbox-side exec**.

### Live MWCC tools

Dump arguments are at `capabilities.ts:315-347`; stack/regflow/inlines share diagnose arguments at `:351-417`. The APIs launch `mwcc_dump.py`/`mwcc_diagnose.py` against repo root (`toolpacks/gamecube-decomp/compiler/mwcc_debug/api/dump_function.py:14-30`; `diagnose.py:14-40`). Implementations resolve and compile the TU through checkdiff/ninja (`toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_diagnose.py:1992-2005,2101-2112,2175-2185`), reading the report, TU/header dependency closure, build edge, target object and instrumented compiler. They do not read the cached lookup corpus. Verdict: **sandbox-side exec**.

### Permuter, mutation preview, and type oracle

Run/replay/preview wrapper args are at `capabilities.ts:427-555`. Run reads the current TU and `compile_commands.json` (`toolpacks/gamecube-decomp/_impl/gamecube/tools/permute.py:1462-1464`) plus the checkdiff/ninja closure above. Replay first reads the workspace-rooted replay argument (`toolpacks/gamecube-decomp/source_editing/source_permuter/api/replay.py:14-35`). Preview reads `<repo>/<source_path>` (`source_permuter/api/preview_mutation.py:14-40`) and, unless `no_types`, `compile_commands.json` and clang includes (`_impl/gamecube/tools/src_mutate.py:1936-1944`).

Type oracle args are at `capabilities.ts:558-587`; it reads `<repo>/<source_path>` and `<repo>/compile_commands.json` (`toolpacks/gamecube-decomp/compiler/type_oracle/api/inspect.py:41-76`), while libclang reads transitive headers (`_impl/gamecube/tools/type_oracle.py:39-73,87-120`). None reads host knowledge. Verdict: **sandbox-side exec**.

### Review lint

Scan accepts inline text or a workspace-rooted/absolute `file` (`capabilities.ts:704-729`). File mode reads exactly that path; text mode reads none (`toolpacks/gamecube-decomp/source_editing/review_lint/api/scan.py:180-212`). Rules are packaged assets, not generated host corpus (`review_lint/api/_qa_rules.py:415-421,477-500,527-528`). Verdict: **sandbox-side exec** for file mode; no shim.

The sdata2 helper accepts a source or unit (`capabilities.ts:733-768`), resolves `src/<unit>.c` (`review_lint/api/sdata2_order_helper.py:417-460`), and always reads `build/GALE01/obj/<unit>.o` (`sdata2_order_helper.py:67-149,558-583`). Apply reads/writes source (`:619-625`); validate uses the ninja build closure (`:519-555`). Verdict: **sandbox-side exec**.

## Not worker-exposed by default

Four worker-role-allowed wrappers are absent from the default profile: `mwcc_debug_raw_dump`, `struct_infer_from_asm`, `include_fixer_preview`, and `item_state_table_preview` (`capabilities.ts:14-23,419-425,592-621,656-701,772-794`; compare `profiles/defaults.ts:17-39`). Verdict: **not worker-exposed** by default; if override-enabled, all execute sandbox-side. Struct inference reads `build/GALE01/asm/**/*.s` (`_impl/gamecube/tools/infer_struct.py:29-35,110-152`). Include fixer reads the requested source, `compile_commands.json`, `src/**/*.h`, and clang include closure (`include_fixer/api/preview.py:18-64`; `_impl/gamecube/tools/fix_includes.py:35-48,64-109,124-142`). Item-state preview reads `config/GALE01/splits.txt`, matching build asm and owner source (`_impl/gamecube/tools/gen_item_state_table.py:21-47`; `data_conversion/item_state_table/api/preview.py:23-33`). Raw dump shares live MWCC inputs.

`ghidra`, `opseq`, `mismatch_db`, and `callgraph` are registered toolpack maintenance tools (`toolpacks/gamecube-decomp/toolpack.json:11-25`) but have no callable wrapper: **not worker-exposed**. Workers consume their host indexes through graph tools. Their runners read, respectively, `build/GALE01/main.elf` (`research/ghidra/runners/export_xrefs.py:117-180`), report plus `build/GALE01/asm/**/*.s` (`research/opseq/runners/extract_opcode_sequences.py:43-65,122-125`; `research/callgraph/runners/extract_call_graph.py:37-59,116-120`), and the report/objdiff build surface (`research/mismatch_db/runners/analyze_objdiff_mismatches.py:24-80,133-202`). Those maintenance reads require no worker shim.

## Definitive fetch-first shim list

Only **`m2c_decompile`** needs a fetch-first shim. It must fetch exactly:

1. `build/GALE01/obj/**/*.o` — current symbol discovery scans the whole tree.
2. `build/GALE01/asm/<matched-object-relative>.s` for function input, or `build/GALE01/asm/<input>.s` for TU input.
3. `build/ctx.c` — always passed to m2c; use the sandbox-generated file.

This list is definitive only if the shim rejects `--write` and path-bearing/unrecognized `extra_args`. Otherwise every referenced path must also be fetched, and the contract is not statically bounded. Running host-side `tools/m2ctx/m2ctx.py` would additionally require that script plus its full source/header/config/include closure; fetching sandbox-generated `build/ctx.c` avoids that mirror.
