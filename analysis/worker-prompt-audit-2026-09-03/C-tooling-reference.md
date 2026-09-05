# Worker Diagnostic Tooling Reference

Date: 2026-09-03. Scope: the live worker profile in `apps/server/src/core/tools/profiles/defaults.ts:16-48`, plus the retired `ledger_search` seen in the audited runs. This is a reference for prompt authors, not a proposed API.

## Measurement and Reading Notes

- Timing sample: the first 50 lexicographically sorted `worker_state/*/tool_events.jsonl` files under run `4a45af8a-9f8c-499b-b375-c0d8e93fc8fd`. Median is the upper middle observed `duration_ms`. Error rate is `status != "ok"` at the event envelope. This sampled about 50 workers, not all 1,627 runs.
- An event-level `ok` is not proof that the nested command succeeded. Several real results contain `exit_code=1`, `status=failed`, `file_not_found`, or an empty result inside an outer successful tool event. Read the returned payload.
- Samples below are verbatim but shortened. `...` marks removed fields or text. Parameter examples come from `tool_events.jsonl`; result examples come from `analysis/worker-audit-2026-09-01/condensed/*.md`.
- The model-facing descriptions are quoted exactly from the registration. File citations name the registration and the tool-local implementation that defines the result.

## Profile Check

The live profile exposes 31 tools relevant here: four build/diff, seven compiler diagnostics, five search/mutation, two type/layout, two review, five graph/history, and six Knowledge V2 tools (`defaults.ts:17-47`). `ledger_search` is retired. Tests require its absence (`apps/server/src/core/agent-catalog/kernel-catalog.test.ts:219-227`; `apps/server/src/core/tools/wrappers/knowledge-roles.test.ts:27`). Contrary to the question's tentative warning, `code_graph_search`, `code_graph_file_card`, and `knowledge_graph_search` are still live. `graph_related_functions` and `past_prs_search` are live too.

## Build and Diff

### `checkdiff_run`

- Source/schema: `apps/server/src/core/tools/wrappers/capabilities.ts:180-205`; implementation `toolpacks/gamecube-decomp/_impl/gamecube/tools/checkdiff.py:177-218,298-328`. Description: "Compile the owning translation unit through the tool-local helper and return focused checkdiff output for one function."
- Parameters: required `function`; `full_diff`; `timeout_seconds`, default 180 and clamped 10-900. Despite its name, `full_diff` means expanded instruction context, capped at 24 mismatching instruction/data lines. It is not raw objdiff JSON.
- Real sample: `checkdiff_run {"function":"fn_8021AE44","full_diff":true,"timeout_seconds":120}` -> `98.87190 | left 1844 DIFF_ARG_MISMATCH ...` (`condensed/6b9f6954-d151-4277-a570-65601bd6c0d7.md:356-358`). Sample: n=2,076, median 1,697 ms, 0% transport errors.
- Answers: what differs, at which instruction/data rows, after a fresh compile. It does not identify a source variable, live range, allocator cause, or acceptable fix. A stale service was observed (`phase3_notes/pair_epoch-03-pair-03.md:9,19`). Normal instruction parity can still hide strict relocation/data differences (`rollups/phase2_rollup.md:94`).

### `checkdiff_summary`

- Source/schema: `capabilities.ts:208-222`; implementation `toolpacks/gamecube-decomp/validation/checkdiff/api/summary.py:15-47` and `checkdiff.py:331-367`. Description: "Compile each owning translation unit once and return checkdiff PASS/FAIL summary lines."
- Parameters: required `functions[]`; timeout defaults to 240 seconds and clamps to 10-1,200. The API normalizes repeated, comma-separated, and space-separated names.
- Real sample: `{"functions":["fn_80188550","fn_80188644","fn_801891F4"],"timeout_seconds":180}` -> `status=ok ... stderr: unknown function ...` (`condensed/a9872728-d65f-4b92-8804-86dabc0f33bd.md:313`; comparable full result at `condensed/6b9f6954-d151-4277-a570-65601bd6c0d7.md:450-458`). n=80, median 1,472 ms, 0% transport errors.
- Answers: which target and neighbors pass. It intentionally omits the mismatch rows and cause. Check nested stderr for unknown symbols even when the envelope is `ok`.

### `direct_compile_tu`

- Source/schema: `capabilities.ts:225-252`; implementation `toolpacks/gamecube-decomp/validation/checkdiff/api/direct_compile.py:17-60`. Description: "Run the tool-local direct-compile path for a function or unit without running objdiff."
- Parameters: `function` or `unit`, optional `keep_object`. The wrapper accepts and forwards both, but argparse declares them mutually exclusive (`direct_compile.py:20-24`), a current contract bug. `keep_object=false` removes the temporary object after reporting it.
- Real sample: `{"function":"fn_80020AEC","keep_object":true,"unit":"melee/lb/lbbgflash"}` -> argparse failure; retrying one selector returns command/status/object metadata (`condensed/7e2da56a-e0cf-4286-aefb-b6339ba565cc.md:51-58`; success shape at `condensed/638fc846-c62c-4d8b-b84c-fd25e2ad65b6.md:98-107`). n=342, median 1,097 ms, 21.35% transport errors.
- Answers: does this TU compile, and where is the candidate object? It does no comparison. Native 32-bit wibo can fail with Exec format; qemu-i386 restored validation in the audit (`rollups/phase2_rollup.md:76-80,95`).

### `objdiff_score_candidate`

- Source/schema: `capabilities.ts:255-292`; implementation `toolpacks/gamecube-decomp/validation/objdiff_score/api/score_candidate.py:65-177`. Description: "Run objdiff score and percent diff for a supplied candidate object path."
- Parameters: required `function`, `candidate_object`; optional `unit`, `timeout_seconds`, default 60 and clamp 5-300.
- Real sample: result `{status,unit,target_object,command,score:{status,match_percent,raw_score,breakdown,relaxed_match_percent?},percent_diff:{...},strict_percent_diff:{...}}` (`condensed/24fc4148-8b96-4b91-af23-bbb37c5b2877.md:238-244`). n=141, median 677 ms, 0% transport errors.
- Answers: strict and relaxed scores for an already-built object. It omits objdiff's instruction JSON, source cause, and allocator state. A target-missing result is shown at `condensed/638fc846-c62c-4d8b-b84c-fd25e2ad65b6.md:838-846`.

## Compiler Diagnostics

### `mwcc_debug_lookup`

- Source/schema: `capabilities.ts:22-30,169-178`; implementation `toolpacks/gamecube-decomp/_shared/search_index.py:221-239,268-276`. Description: "Query MWCC debug evidence for compiler behavior, pcdump notes, register allocation, stack/frame, local lifetime, coalescing, scheduling, and varargs/assert shapes."
- Parameters: required `query`, bounded `limit`. Output has query/index provenance and ranked `{id,title,score,snippet,evidence_ref,payload}` results.
- Real sample: `{exit_code:0,...,message:"Generated lookup indexes remain supplemental and should be verified against local build, pcdump, diagnose, or objdiff output..."}` (`condensed/7e2da56a-e0cf-4286-aefb-b6339ba565cc.md:35`). n=114, median 133 ms, 0% transport errors.
- Answers: has this compiler shape been documented? It is cached advice, not evidence about the current compile.

### `mwcc_debug_dump_function`

- Source/schema: `capabilities.ts:307-341`; implementation `toolpacks/gamecube-decomp/compiler/mwcc_debug/api/dump_function.py:14-32`. Description: "Compile the owning translation unit with the instrumented MWCC debug compiler and return the function pcdump section."
- Parameters: required `function`; `runner=auto|wibo|wine`; timeout 10-900. Output is `{operation,command,cwd,repo_root,exit_code,status,stdout,stderr}` with filtered pcdump text, or `debug_compiler_not_provisioned`.
- Real sample: `exit_code=1 | status=failed` (`condensed/be134157-4f45-4915-b3b8-9211dbf76e1e.md:1137`). n=34, median 517 ms, 0% outer-event errors.
- Answers: what a named compiler pass emitted for this function. It is not a target/current diff. Missing instrumented MWCC, `Unhandled function 190`, and no `pcdump.txt` are observed failures.

### `mwcc_debug_diagnose_stack`

- Source/schema: shared factory `capabilities.ts:343-392`; implementation `toolpacks/gamecube-decomp/_impl/gamecube/mwcc_debug/mwcc_diagnose.py:1983-2080`. Description: "Run mwcc_diagnose.py stack mode for one function."
- Parameters: required `function`; `runner`; `show_lines`; `show_mwcc` for raw slot facts; timeout 10-1,200. It reports target/current frame, stack mismatches, offset groups, possible named locals, and source suggestions.
- Real sample: `status:"ok", stdout:"No actionable named local movement found... Offset delta groups (current - target): none... mwcc_debug current-C stack facts: unavailable..."` (`condensed/7e2da56a-e0cf-4286-aefb-b6339ba565cc.md:31`). n=60, median 968 ms, 0% outer errors.
- Answers: is the residual uniform frame/slot drift, and which local may own a slot? It does not prove the mapping or allocator cause.

### `mwcc_debug_diagnose_regflow`

- Source/schema: `capabilities.ts:343-400`; implementation `mwcc_diagnose.py:2092-2163`. Description: "Run mwcc_diagnose.py regflow mode for one function."
- Parameters: required `function`; `runner`; `show_lines`; timeout. It selects one primary compact register-only cluster and can add pre-global-opt setup traces and declarations.
- Real sample: `No compact register-only window found... mwcc_debug setup trace unavailable... Unhandled function 190 ... no pcdump.txt produced` (`condensed/5d1c88e5-1b58-4497-bac9-14c1683c71ce.md:52`). n=126, median 1,019 ms, 0% outer errors.
- Answers: which semantic values occupy the wrong operands in one compact window. It is not full liveness, all clusters, or FPR coloring.

### `mwcc_debug_diagnose_inlines`

- Source/schema: `capabilities.ts:343-408`; implementation `mwcc_diagnose.py:2166-2229`. Description: "Run mwcc_diagnose.py inlines mode for one function."
- Parameters: required `function`; `runner`; `show_lines`; timeout. Output combines mismatch counts, register/setup clues, and call-expansion candidates.
- Real sample: `{exit_code:1,status:"failed",stderr:"error: mwcc_debug dump unavailable\nUnhandled function 190 ... no pcdump.txt produced"}` (`condensed/5d1c88e5-1b58-4497-bac9-14c1683c71ce.md:54`). n=39, median 946 ms, 0% outer errors.
- Answers: is a helper or inline boundary a plausible source of the residual? It suggests a boundary. It cannot prove extraction improves codegen and fails without live dump support.

### `mwcc_alloc_snapshot`

- Source/schema: `capabilities.ts:843-871`; wrapper `apps/server/src/core/tools/wrappers/mwcc-alloc.ts:197-223`; capture `toolpacks/gamecube-decomp/_impl/gamecube/mwcc_alloc/mwcc_alloc_capture.py:614-702,908-921`. Description: "Capture PCode blocks, the interference graph, and simplify order by running the stock MWCC under qemu+gdb in the sandbox."
- Parameters: required workspace-relative `unit`, `function`; `capture=pcode|coloring|pair`, default pair; timeout 60-1,800. PCode returns blocks, instructions, operands, and GPR/FPR/VR counts. Coloring returns GPR nodes, vreg -> physical register, spill cost, degree, flags, interference neighbors, and simplify order. Pair captures PCode plus before/after coloring pairs.
- Real sample: `{exit_code:0,pair_diffs:[...],status:"changed",...,status:"ok"}` (`condensed/4d28a12a-db0b-432b-9a54-fcf32d6ccb58.md:364`). n=100, median 5,087 ms, 0% outer errors.
- Answers: which GPR virtual node, interference edge, color, or simplify-order position moved. It does not name source variables, compute live-range intervals, compare against retail, or expose automatic FPR coloring. The debugger rejects `reg_class != 0` (`gdb_allocator_snapshot.py:131-160`); an audited final f0/f1 issue therefore had no usable snapshot (`phase3_notes/pair_epoch-09-pair-01.md:13-15,22`). Provisioning requires gdb-multiarch, qemu-i386, gdb Python, an accepted stock compiler hash, and the correct function-capture index.

### `mwcc_alloc_compare`

- Source/schema: `capabilities.ts:873-898`; wrapper `mwcc-alloc.ts:225-244`; implementation `toolpacks/gamecube-decomp/_impl/gamecube/mwcc_alloc/compare_coloring_snapshots.py:24-89,119-146`. Description: "Compare two allocator coloring snapshots and report changes for each virtual register."
- Parameters: required workspace-relative `before`, `after`. Output `{format,before,after,register_class,changes,change_count}`; changed nodes include old/new object, spill cost, degree, physical register, flags, neighbors, and simplify-order position.
- Real sample: `exit_code=0 | status=changed | {"exit_code":0,"status":"changed"}` (`condensed/4d28a12a-db0b-432b-9a54-fcf32d6ccb58.md:370`). n=19, median 1,678 ms, 0% outer errors.
- Answers: what changed between two candidate coloring snapshots. It does not compare to retail, reconstruct source identities/live intervals, or directly label a coalescing edge. It rejects different register classes and inherits the automatic GPR-only limitation.

## Search and Mutation

### `source_mutation_preview`

- Source/schema: `capabilities.ts:505-551`; implementation `toolpacks/gamecube-decomp/source_editing/source_permuter/api/preview_mutation.py`. Description: "Run src_mutate.py for a source path/function and return a non-compiling preview diff."
- Parameters: required `source_path`, `function`; optional `pass_name`, `seed`, `steps` 1-20, `no_types`, timeout 5-300. It returns command metadata and a unified source diff. It neither compiles nor scores.
- Real sample: `status=ok ... stdout:"--- .../mnruleplus.c\n+++ ... (mutated)\n@@ ...\n+static inline int ..."` (`condensed/c31ba6a9-57de-4293-8119-93ca27d8ad59.md:91`). n=117, median 763 ms, 0% transport errors.
- Answers: what a named mutation pass would change. It does not say whether that edit compiles, improves instructions, or preserves behavior.

### `source_permuter_run`

- Source/schema: `capabilities.ts:420-473`; adapter `toolpacks/gamecube-decomp/source_editing/source_permuter/api/run.py:54-117`; engine `toolpacks/gamecube-decomp/_impl/gamecube/tools/permute.py:1057-1063,1187-1250,1528-1598`. Description: "Search source-level mutations, compile candidates with MWCC, and return the best diff without applying it."
- Parameters: required `function`; `mutate_functions[]`, `max_iters` 1-10,000, timeout 5-900, `jobs`, `seed`, `keep_prob`, `no_narrow`, `save_replay`. The API forces `--apply never`; the host wrapper launches one job while the tool manages requested workers.
- Real sample: `status=ok | 0s iters=0 ... best=69440 ... 3s iters=3 ...` (`condensed/049b90b1-e6e3-4ba0-84d8-752f52b2a062.md:124`). n=123, median 61,847 ms, 0.81% transport errors.
- Answers: can bounded mutations in named functions improve the scalar score, and what is the best candidate's unified source diff/replay? It does not return a target-v-candidate instruction diff or any per-candidate changed-instruction set. Common failures were function not found at source path, parse failure, wibo Exec format, and a stale extracted baseline (`phase3_notes/pair_epoch-07-pair-01.md:13`; `pair_epoch-10-pair-06.md:9`; `pair_epoch-11-pair-02.md:15,23`). Broad 1,000-5,200 candidate searches usually confirmed a local maximum (`rollups/phase2_rollup.md:89-96`).

### `source_permuter_replay`

- Source/schema: `capabilities.ts:476-503`; adapter `source_permuter/api/replay.py:17-44`; engine `permute.py:1281-1338`. Description: "Replay a permuter recipe against current source and return the resulting candidate diff/score."
- Parameters: required replay path; optional function guard and timeout 10-900; never applies. The recipe records base/final score, mutations, and hashes, not instructions (`permute.py:514-586`).
- Real sample: `status=ok | score 290030 (99.71%) | stdout: replayed 8 steps ... --- a/... +++ b/...` (`condensed/5362dd1d-9366-4c14-a90a-ae7bedd924d8.md:1358`). n=26, median 1,599 ms, 0% transport errors.
- Answers: does this recipe still produce the same candidate/source diff and score? It does not explain the remaining mismatch. Replay was useful as a probe after a named helper hypothesis, then a hand-written helper and declaration order finished the match (`phase3_notes/pair_epoch-09-pair-06.md:8-9,20`).

### `m2c_decompile`

- Source/schema: `capabilities.ts:619-646`; implementation `toolpacks/gamecube-decomp/research/m2c_decomp/api/decompile.py`. Description: "Run the tool-local m2c wrapper with --no-copy and return scaffold output."
- Parameters: required function symbol or TU `input`; `no_context`, `format`, `extra_args[]`, timeout. Output is command/status/stdout/stderr plus scaffold text when successful.
- Real sample: `exit_code=1 | status=failed | ModuleNotFoundError: No module named 'elftools'` (`condensed/3e2e7291-f56d-4b25-8470-f1a6eb298e7f.md:163`). n=73, median 2,171 ms, 4.11% transport errors.
- Answers: what readable C-like control flow m2c infers. It is a scaffold, not authored source, type truth, or match evidence. Missing Python dependencies were common in this audit.

### `asm_window_search`

- Source/schema: `capabilities.ts:652-684`; implementation `toolpacks/gamecube-decomp/research/asm_window_search/api/window_search.py`. Description: "Search 32-instruction hashed-embedding windows from target objects and return the best construct-level hit per donor function."
- Parameters: required indexed `symbol`; optional `unit`, `min_match` default 98, `all`, `exclude_self_unit`, `limit`. Results carry donor symbol/unit, fuzzy-match percent, embedding similarity, and matching windows.
- Real sample: `exit_code=0 | ifStatus_802F5EC0 | main/melee/if/ifstatus | fuzzy_match_percent=100 | similarity=1 ...` (`condensed/9dce9616-111a-422c-a82a-092444ef49fa.md:88`). n=98, median 19,899 ms, 0% transport errors.
- Answers: where a similar 32-instruction construct exists. Similarity is not semantic equivalence, source provenance, or evidence that copying a construct will preserve surrounding allocation.

## Type and Layout

### `type_layout_lookup`

- Source/schema: `capabilities.ts:690-725`; implementation `toolpacks/gamecube-decomp/research/type_layout_lookup/api/layout_lookup.py:55-64,128-268`. Description: "Query duplicate layouts, near-layout ranks, byte-aliasing union members, and build-time cast-overlay flags."
- Parameters: `record`; `mode=dups|near|unions|casts|summary`; byte offset `at`; `prefix`; `limit`. Output varies by mode: near ranks with similarity, duplicate group, union views, cast flags; duplicate/prefix groups; union `{path,start}` members; or cast rows.
- Real sample: `{"record":"HSD_JObj","mode":"unions","at":"0x18","prefix":false,"limit":20}` -> `exit_code=0 | status=ok | parse_error=null` (`worker_state/b45f2838-2363-4f39-953a-5082150a0163/tool_events.jsonl:556`; `condensed/5d1c88e5-1b58-4497-bac9-14c1683c71ce.md:1023`). n=22, median 233 ms, 0% transport errors.
- Answers: which records overlay or nearly share layout. It does not establish semantics, current ABI truth, MWCC conversions, allocation, or emitted code. Index-not-built, record-not-indexed, unavailable cast scan, invalid offset, and staleness after type edits are explicit statuses.

### `type_oracle_lookup`

- Source/schema: `capabilities.ts:553-586`; implementation `toolpacks/gamecube-decomp/compiler/type_oracle/api/inspect.py:52-119`. Description: "Build a libclang expression-span type map and return exact or containing type rows for an expression/span."
- Parameters: required `source_path`; optional exact `expression`, paired byte start/end, `limit`. Output `{status,expression,requested_spans,type_count,types:[{byte_start,byte_end,type,expression}],containing_types}`.
- Real sample: `{"source_path":"src/melee/gm/gm_16A2.c","expression":"&lbl_8046B488.x0 + idx","byte_start":0,"limit":20}` -> `exit_code=0 | status=ok` (`worker_state/03c85fd8-70df-460f-9c43-f74a2dd846f8/tool_events.jsonl:14`; `condensed/c7af4f27-8f28-46fb-94fb-2b82a012da52.md:579`). n=11, median 493 ms, 0% transport errors.
- Answers: what libclang calls the current expression/span type. It does not report target types, record layout, MWCC conversion/codegen, or allocation. Source/libclang/compile-database absence and stale byte spans are failure modes.

## Review

### `review_lint_scan`

- Source/schema: `capabilities.ts:775-802`; implementation `toolpacks/gamecube-decomp/source_review/review_lint/api/scan.py:76-94,125-147,203-233`. Description: "Check for type-erasing casts, M2C_FIELD residue, and multiple Item*/Fighter* pointer variables in one function."
- Parameters: `text` or `file`; `rule=all|type_erasing_casts|inline_pointer_vars`. Text wins if both are present. Output `{tool,status:passed|failed,operation,source,rule,findings}`.
- Real sample: file scan returned `file_not_found`, then text scan returned `passed` (`condensed/a9872728-d65f-4b92-8804-86dabc0f33bd.md:235-243`). n=149, median 154 ms, 0% transport errors.
- Answers: is a narrow lexical review smell present? It does not prove compilation, match, behavior, or ownership. Path resolution commonly yields semantic failure inside a successful event.

### `review_lint_sdata2_order_helper`

- Source/schema: `capabilities.ts:804-842`; implementation `toolpacks/gamecube-decomp/source_review/review_lint/api/sdata2_order_helper.py:156-218,307-317,519-643`. Description: "Preview or install a narrow sdata2_order helper for pure .sdata2 data-ordering QA repairs."
- Parameters: `source` or `unit`; `symbols[]`, helper `name`, `apply`, `validate`, `prefer_named_macros`. It targets only 4/8-byte `.sdata2` objects. Output includes helper text, entries, target counts/sizes, applied state, and compile/byte-order validation.
- Real sample: preview `status=preview, validation=not_run`; apply+validate then `sdata2_mismatch, first_mismatch: 0.0f vs 1.0f`, and another attempt `compile_failed` (`condensed/7e2da56a-e0cf-4286-aefb-b6339ba565cc.md:80-96`). n=21, median 1,294 ms, 0% transport errors.
- Answers: can a narrow literal helper reproduce reference `.sdata2` byte/order? It does not diagnose wrong values, other sections, registers, scheduling, or review acceptability. Two 100%/near-match helpers were later rejected by hard gates as artificial or unused (`phase3_notes/pair_epoch-09-pair-04.md:7-9`; `pair_epoch-10-pair-06.md:8-9`).

## Knowledge and History

The graph registrations and descriptions are in `apps/server/src/core/tools/wrappers/knowledge.ts:14-43,85-183`. Search output is `{status,graph_db,query,source_id,limit,active_sources_only,results[]}`, with each result carrying title, snippet, evidence ref, entity id, confidence, and trust tier (`apps/server/src/core/knowledge/graph/runtime/execution.ts:82-110`; `graph/types.ts:180-189`). Empty results are normal and are not negative evidence.

### Live graph tools

- `code_graph_search`. Description: "Search the code graph slice for source paths, symbols, functions, units, and local code metadata." Required `query`, optional `limit`. Real sample parameters `{"query":"gm_8016A22C","limit":20}` and an `ok` envelope (`condensed/a9872728-d65f-4b92-8804-86dabc0f33bd.md:68`). n=82, median 32 ms, 0% errors. Answers where related code metadata is indexed, not why MWCC differs.
- `knowledge_graph_search`. Description: "Search active code, opseq, callgraph, sibling, PR, standards, and curated graph chunks." Required `query`, optional `limit`; forces active sources. Real sample: `{status:"ok",query:"fn_8023DBE8 declaration order ...",source_id:null,results:[]}` (`condensed/d08dc042-eef9-41be-a208-d99718dd1548.md:667`). n=218, median 65 ms, 0% errors. Answers whether indexed evidence exists, not whether it applies to the checkout.
- `past_prs_search`. Description: "Search past PR summaries and postmortem records for exact files, symbols, subsystems, review risks, and matching tactics." Required `query`, optional `limit`. Real sample contains `PR 2695: grbigblueroute: match C85C...` (`condensed/04f2403d-aa64-462f-b1a4-fa79875b317f.md:20-24`). n=296, median 37 ms, 0% errors. Answers what past work tried; it can be stale and is not compiler evidence.
- `graph_related_functions`. Description: "Return graph-owned opseq analogs, callers, callees, and data references for one or more functions." Optional `source_path`, `unit`, `symbol`, `entity_id`, `limit`, but it requires a source path, entity id, or unit+symbol selector. Output has resolved functions and their opseq analogs/callers/callees/data references. Real sample includes `fuzzy:99.08197, score:0.562, exact_match:false, matched:true` (`condensed/04f2403d-aa64-462f-b1a4-fa79875b317f.md:16`). n=171, median 8 ms, 0% errors. It finds analogs, not causal source shapes.
- `code_graph_file_card`. Description: "Load graph-owned source-file context for a game-relative path." Required `source_path`. Output includes editability/match status, units/functions, PR history, resources, mismatch patterns, tool hits, callers/callees/data refs (`graph/types.ts:136-157`). Real sample: `{"source_path":"src/melee/gr/grkinokoroute.c"}` -> graph-owned file-card JSON (`condensed/04f2403d-aa64-462f-b1a4-fa79875b317f.md:263`). n=1, median 25 ms, 0% errors. It summarizes indexed context; it does not inspect current codegen.

Graph runtime can return `graph_missing` (`graph/runtime/execution.ts:89-95,124-128,151-156`). Pair reports usually found that history supplied context but not the fix, for example `phase3_notes/pair_epoch-10-pair-01.md:9` and `pair_epoch-12-pair-05.md:9`.

### Knowledge V2 tools newly live in the worker profile

Schemas/descriptions: `apps/server/src/core/tools/wrappers/knowledge-v2.ts:37-124,180-318,347-370`; implementations and result shapes: `apps/server/src/core/knowledge/v2/tools.ts:72-189,208-297,448-831`. These tools had zero calls in the 50-worker sample and no result in the requested condensed corpus, so a real duration, error rate, and result sample do not exist for that run. Reporting an implementation-shaped object as an observed sample would be false.

- `kv2_discord_search`: required `query`; optional channel, author, inclusive time bounds, limit, `mode=keyword|vector|hybrid`. Description: "Search archived Discord messages by text, channel, author, and timestamp bounds." Output has requested/used mode, degradation, count/truncation, and results with locator, author, time, snippet, thread context, ranks. Observed sample: unavailable; n=0. It finds citeable chat claims, not current compiler facts.
- `kv2_wiki_search`: required `query`; optional page, limit, mode. Description: "Search the latest mirrored wiki revision, optionally within one page." Results have locator, page, section, snippet, ranking. Observed sample: unavailable; n=0. It answers documented game/context questions, not codegen.
- `kv2_pr_search`: required `query`; optional limit and mode. Description: "Search archived pull request summaries and discussion for historical evidence." Results have locator, PR ref, subject, summary/discussion snippets, ranking. Observed sample: unavailable; n=0. It provides historical hypotheses; resolve the locator before quoting.
- `kv2_attempt_search`: optional query, exact target stable key, outcome filter, limit. Description: "Read structured worker-run and submission history, optionally narrowed with text search." Results include locator, stable key, final outcome, baseline/submission scores, and description/hypothesis snippets. Observed sample: unavailable; n=0. It does not provide per-instruction evidence or guarantee checkout relevance.
- `kv2_subject_record`: exactly one target stable key or entity locator. Description: "Read the assembled knowledge record for exactly one target stable key or entity locator." Output status, record, up to ten ledger entries, target status, count/truncation. Observed sample: unavailable; n=0. It summarizes known target history, not live source state.
- `kv2_resolve_locator`: required `locator`. Description: "Resolve one validated evidence locator to its bounded source material." Output is locator-kind-specific Discord, wiki, PR/comment, worker-run/submission, or bounded code evidence; code is capped at 120 lines. Observed sample: unavailable; n=0. It makes a hit inspectable, but does not validate the tactic.

`kv2_entity_lookup` and `kv2_unit_context` exist but are librarian-only, not worker tools (`knowledge-v2.ts:320-345,372-397`). Vector/hybrid search may degrade to keyword without an embedding provider. Locator failures include invalid locator, outside-checkout path, past-EOF range, and not found.

### Retired `ledger_search`

This tool appeared in the historical run but is absent now. Historical sample: `{"query":"gm_8016A22C main/melee/gm/gm_16A2","scope":"symbol","limit":10}` -> `status=ok | In ...` (`worker_state/1a1bf214-7d8d-4b2d-b680-af1c2f04454a/tool_events.jsonl:3`). Historical sample metric: n=348, median 69 ms, 0% transport errors. Do not mention it as callable in a new worker prompt. One pair did get a useful type/declaration-order lead from ledger plus a past PR (`phase3_notes/pair_epoch-03-pair-02.md:3,8`), but most searches supplied context rather than the fix.

## Diagnostic Flow by Residual Class

Full diff is the classifier. After classification, ask one narrow question, name the affected value/slot/edge, make one edit, then run a full diff again.

| Residual class | Decisive evidence and order | Audit basis |
|---|---|---|
| Instruction shape/control flow | `checkdiff_run(full_diff)` -> local target/current instruction window and source construct -> one operand/call/loop simplification -> full diff | Two needless varargs produced one extra `stw`; deleting them fixed it (`phase3_notes/pair_epoch-10-pair-02.md:7-9,20-23`). Preserve an already-matching loop body while isolating its exit (`pair_epoch-07-pair-01.md:13-15,19-21`). |
| Register-only GPR swap | Full diff -> map wrong physical operands to semantic values -> `mwcc_debug_diagnose_regflow(show_lines)` -> `mwcc_alloc_snapshot(pair)` and `mwcc_alloc_compare` -> name the vreg/interference or coalescing boundary -> one lifetime edit -> full diff | Persistent pointer removal, destructive reuse, and helper boundaries each closed named allocation gaps (`pair_epoch-07-pair-03.md:7-9,20-23`; `pair_epoch-12-pair-05.md:7-9,20-23`; `pair_epoch-08-pair-04.md:7-9,19-22`). |
| Register-only FPR swap | Full diff -> paired objdump/regflow -> state that automatic allocator capture is GPR-only -> one narrow source lifetime/dependency probe -> full diff | The worker could not get f0/f1 coloring (`pair_epoch-09-pair-01.md:13-15,22`); another needed custom FPR captures (`pair_epoch-10-pair-01.md:13-15,22`). |
| Stack slot/frame size | Full diff -> direct compile/objdump -> `diagnose_stack(show_lines,show_mwcc)` -> map source local to slot/lifetime -> one declaration/scope/expression/helper edit -> recheck prologue; use `PAD_STACK` only for uniform displacement | Inline scratch and declaration/padding changes fixed frames (`pair_epoch-08-pair-03.md:8-9,13-14`; `pair_epoch-10-pair-03.md:7-9`). Uniform four-byte displacement justified `PAD_STACK(8)` (`pair_epoch-12-pair-06.md:7-10`). |
| Scheduling | Full diff -> local scheduled sequence -> PCode/objdump dependency order; use regflow only for a compact register window -> change one dependency/pointer/call shape -> full diff | Needless varargs and an initialized post-increment pointer controlled store order (`pair_epoch-10-pair-02.md:20-23`; `pair_epoch-11-pair-06.md:13-15,20-21`). |
| Relocation/symbol | Full diff; if instructions pass but strict score does not, use direct compile plus relocation-aware objdiff JSON -> resolve left/right symbols/values -> one literal/symbol/order edit -> strict objdiff and neighbor check | Ordinary checkdiff passed while strict `functionRelocDiffs=data_value` failed (`pair_epoch-03-pair-06.md:7-9,19-22`). `.sdata2` identity remained after a register fix (`pair_epoch-09-pair-04.md:7-9,20-22`). None of the worker wrappers returns full relocation JSON today. |
| Data-section layout | Section/full diff -> `direct_compile_tu` -> objdump/nm/readelf/objcopy or raw objdiff -> account exact bytes, offsets, binding, strings, relocations -> one ownership/order/storage edit -> verify raw bytes, relocs, consumers, neighbors | A missing 24-byte object and `.sdata2` duplicate/alignment sequence required section accounting (`pair_epoch-12-pair-02.md:7-9,20-23`; `pair_epoch-12-pair-01.md:7-9,20-23`). |
| Inline boundary | Full diff + regflow/allocator shows a persistent live-range cluster -> history/analogs if useful -> `diagnose_inlines`/dump -> extract one semantic helper around coupled work -> check frame and neighbors -> full diff | Moving two coupled loops and checking an 0x80 frame closed one case (`pair_epoch-07-pair-04.md:7-9,20-23`); authored helpers closed another (`pair_epoch-09-pair-05.md:7-10,22-25`). |

## Permuter as a Probe

Today the permuter scores each candidate but does not expose its instruction delta. The score server returns only `(ScoreKey, code_hash)` (`toolpacks/gamecube-decomp/_impl/gamecube/tools/permute.py:129-206`). The fallback invokes objdiff JSON, then discards the instruction records and keeps match percent plus a symbol hash (`permute.py:191-206`). The loop retains the strict best source and mutation trace (`permute.py:1187-1250`). `report_find` prints a unified source diff only for a strict score improvement with novel assembly (`permute.py:1057-1063`). Final output is progress counters, best scalar score, optional score breakdown, best unified source diff, and replay metadata. Replay returns one candidate score and source diff. Neither tool returns per-candidate target/current assembly, `diff_kind`, `arg_diff`, or a changed-instruction set.

To emit useful per-candidate instruction evidence:

1. Extend the score-server response, or run existing `run_objdiff_json` for retained top-K/improving candidates. Running full JSON for every candidate would make an already 61.8-second median search substantially slower.
2. Parse the existing instruction objects used by checkdiff, including address, formatted instruction, `diff_kind`, and `arg_diff` (`checkdiff.py:177-218`).
3. Store candidate records such as `{iteration, trace, score_key, source_diff, mismatches:[{side,address,diff_kind,arg_diff,formatted}]}`. Preserve the replay hash so a candidate is reproducible.
4. Canonicalize residuals by relative address plus mismatch kind/mnemonic, then cluster candidates by identical or near-identical residual sets. Return cluster counts and representative candidates, not only the top scalar score.

Prompt implication: run the permuter only after naming the function and bounded source region or helper. Treat it as a hypothesis probe. Read instruction deltas after replay with `checkdiff_run(full_diff)` today; do not infer progress from the scalar score. The successful audited pattern was replay -> identify helper shape -> hand-write one helper/declaration edit -> full diff (`pair_epoch-09-pair-06.md:8-9,20`).

## Allocator Visibility

| Evidence | Exposed today | Missing or easy to misread |
|---|---|---|
| PCode snapshot | Blocks, instructions/operands, and virtual-register counts for GPR, FPR, and VR (`allocator_snapshot.py:222-236`) | No source-variable identity or explicit live interval |
| Coloring snapshot | GPR vreg object/address, physical register, spill cost, degree, flags, interference neighbors, simplify order (`allocator_snapshot.py:152-220`) | Automatic hook returns early for non-GPR classes; no FPR coloring, retail coloring, or named coalescing decisions |
| Pair capture | PCode plus before/after GPR coloring pairs and capped changes | "Before/after" means stages in one candidate compiler run, not candidate versus target |
| Compare | Added/removed/changed vregs and old/new color, graph fields, neighbors, simplify position | No source name, live-range reconstruction, or proof that an edge caused the final physical swap |

The right prompt language is therefore precise: use allocator evidence to name a GPR virtual node, physical-color change, interference neighbor, or simplify-order movement. Do not claim it identifies a C local unless separate PCode/source evidence establishes that mapping. Do not claim it explains an FPR swap.

## Prompt-Ready Operating Rule

Run a full diff. Classify the smallest residual. For a register-only GPR residual, capture regflow and allocator state, then name the semantic value and the specific vreg/color/interference change. For stack, inline, relocation, and data residuals, use the corresponding evidence path above rather than allocator tooling. Make one source edit and run the full diff again. Use the permuter only on a bounded, named region; replay an interesting candidate and inspect its instruction delta with full diff because the permuter itself returns scores and source diffs, not changed-instruction sets.
