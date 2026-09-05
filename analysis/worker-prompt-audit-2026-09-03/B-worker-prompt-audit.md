# Research Track B: Worker Prompt and Injected Context Audit

Date: 2026-09-03. Scope: current function-worker prompt unless noted. Character counts use JavaScript string `.length` on rendered XML elements, including tags and whitespace. Token counts are rough at 4 characters/token. No code was changed.

## Executive Finding

The current prompt is good at evidence ranking, hypothesis formation, saving gains, structural pivots, history lookup, and scope escalation. Its largest process hole is exactly where the run audit found the dominant failure: after reading a diff, it never requires the worker to classify the residual, map a register or stack mismatch to a source value and live range, freeze solved regions, or stop a hypothesis family after repeated identical results. The permuter is framed as an expensive last resort, but not as a bounded experiment with a named mismatch and exact instruction-window score. The handoff accepts arbitrary JSON, so diagnoses and failed variants are not reliably reusable.

The historical boot packet cannot be reconstructed from the requested condensed transcript. The named file is absent, and the 92 existing condensed files omit boot SYSTEM/USER messages and injected XML blocks. The rendered `.system.md` contains only the system prompt. Current packet anatomy and caps below therefore come from the builders; historical actual-size claims are limited to artifacts that exist.

## 1. Prompt Anatomy

The current function prompt renders to **11,067 characters**, about **2,767 tokens**. The six top-level separators account for 12 characters not assigned below.

| Rendered section | Chars | Intended behavior |
|---|---:|---|
| `goal` | 180 | Reach 100%, while treating runner-checkable partial progress as valid. [prompt.ts:36](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L36) |
| `definition_of_done` | 249 | Require runner-confirmed exactness, no local regression, and plausible authored C. [prompt.ts:42](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L42) |
| `thinking` | 849 | Infer repeatable author/company idioms and search the wider codebase as a constraint system, described as "Think like Sudoku." [prompt.ts:49](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L49) |
| `context_contract` | 815 | Treat the packet as authoritative, rank current local/validation evidence over summaries, and use graph context as hypotheses. [prompt.ts:70](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L70) |
| `workflow_context` | 4,503 | Run the five phases below. [prompt.ts:86](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L86) |
| `runner_validation_handoff` | 1,685 | Return runner JSON for exact, improved, or stalled work; explain partial banking and write-set widening. [prompt.ts:183](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L183) |
| `contracted_in_rules` | 2,774 | Constrain write scope, validation, tool paths, destructive operations, m2c/permuter use, and continuation. [prompt.ts:208](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L208) |

Workflow phase sizes and purpose:

| Phase | Chars | Prompt instruction |
|---|---:|---|
| 1, `holistic_file_understanding` | 470 | Read file role, nearby matched code, conventions, types/symbols/data ownership, baseline, and "first mismatch shape." [prompt.ts:86](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L86) |
| 2, `solved_reference_pass` | 1,289 | Search graph/opseq and V2 subject, attempt, PR, Discord, and wiki evidence before editing; resolve locators and discount history against live evidence. [prompt.ts:108](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L108) |
| 3, `hypothesis_generation` | 530 | Name a few source hypotheses, evidence, falsifier, and smallest probe. [prompt.ts:130](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L130) |
| 4, `hypothesis_testing` | 618 | Use targeted analysis, mutation previews, then permuter evidence when manual work is too tedious. [prompt.ts:148](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L148) |
| 5, `edit_and_evaluate` | 1,529 | Make small edits, keep gains, revert no-ops/regressions, recognize a local maximum, save best source, pivot structurally, or hand back evidence. [prompt.ts:160](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L160) |

Conditional behavior:

- Section targets use a separate 2,303-character prompt: goal 259, done 166, context 674, workflow 634, rules 562. It omits `thinking`, handoff, and the five function phases, and bans function-oriented tools. Selection is by `kind === "section"` or a dot-prefixed symbol. [prompt.ts:253](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L253) [prompt.ts:315](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L315)
- `<repair_request>` appears only when the packet field is nonempty. [context.ts:320](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L320)
- V2 target-card context appears only when loading returns a card. The legacy graph-card loader always renders, including an unavailable state. [context.ts:376](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L376)
- The detailed widening schema is always in the function system prompt, but is actionable only when widening is enabled. [prompt.ts:189](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L189)

## 2. Injected Context Anatomy

Boot context uses root context plus `worker-packet` and `knowledge-graph-file-card` loaders. [context.ts:68](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L68) The worker-packet template orders the blocks as repair request, target, baseline, tools, canonical paths, and standards. [context.ts:110](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L110)

| Block | Source and contents | Cap/budget | Target-specific? |
|---|---|---|---|
| `repair_request` | `packet.repair_request`, arbitrary JSON from runner rejection. | No block-specific cap; repair construction can include up to 30,000 diff chars and 10,000 prior-output chars. | Yes, and only on repair. |
| `target` / `details_json` | `packet.target`: unit, symbol, source path, size, match metadata. [context.ts:288](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L288) | Packet-sized. | Yes. |
| `target_file` | Current source in CDATA with path/unit/symbol/score attributes. | Full 32,000; compact 12,000; minimal 3,000 chars, with head/tail truncation. [context.ts:33](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L33) [context.ts:221](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L221) | Yes. |
| `baseline` | `packet.baseline` JSON. [context.ts:312](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L312) | Packet-sized. | Yes. |
| `available_tools` | The default worker profile, full descriptions or name-only summary. | Full budget uses full descriptions; compact/minimal use summary. [context.ts:39](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L39) | No. |
| `canonical_tool_paths` | Existing sandbox paths for objdump, dtk, objdiff-cli, sjiswrap, wibo, binutils, compilers. | Only existing canonical entries are rendered. | Checkout-specific, not target-specific. |
| decomp standards | Global decomp standards XML. | Full, summary, or minimal by context budget. [context.ts:39](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L39) | No. |
| `knowledge-graph-file-card` | File functions, editability, mismatch patterns, PR/resource hits, old opseq fields, and follow-up queries; falls back to a live graph read. [context.ts:376](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L376) [context.ts:442](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L442) | Full/summary/minimal projections; list slices include 8 same-file symbols, 4 mismatch titles, 2 top analogs, 4 units. [context.ts:527](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L527) | File/target-specific. |
| V2 target card | Loaded fact/evidence and prior-target context, when available. | Conditional projection; no independent character cap found. | Yes. |
| root/default turn context | Kernel root context and default worker turn prompt. [context.ts:68](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L68) | Kernel-managed. | Run-specific. |

Typical current upper-bound boot size cannot be reduced to one exact number without a real rendered kernel capture. Reproducing the current full-budget builder for the newest target, with its checkout source unavailable, produced 28,534 worker-packet chars: budget 222, target 655, baseline 199, tools 7,035, paths 2,285, standards 18,109, repair 0. Its graph card was 3,708 chars. Replacing the 348-character unavailable-file element with ordinary inline source yields roughly **54k-75k total boot chars, about 14k-19k tokens**, including the 11,067 system prompt and 138-character turn prompt but excluding runtime tool schemas and any conditional V2 card. Compact and minimal remove 20,000 and 29,000 source characters respectively and summarize other blocks. Context-window failures retry `full`, `compact`, then `minimal`. The composition is defined at [context.ts:686](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L686) and [context.ts:796](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L796).

## 3. Staleness and Renames

| Current phrase/field | Problem | Replacement |
|---|---|---|
| "opseq analogs", "opseq similarity leads", "opseq-analog solved function" [prompt.ts:80](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L80) [prompt.ts:114](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L114) [prompt.ts:173](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L173) | The opseq-analogs concept page was removed with the deprecated documentation subtree in commit `15259ff7`. | Say "instruction-shape analogs supported by current solved source or V2 evidence," or simply "solved reference functions." |
| `tool_id === "opseq"`, `opseq_analogs`, `top_opseq_analog` [context.ts:515](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L515) [context.ts:625](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L625) | Packet projection still encodes the retired concept. | Use a producer-backed `instruction_shape_analogs` field, otherwise remove it and point to local solved-source plus V2 searches. |
| "graph file card as first-pass" [prompt.ts:77](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L77) [prompt.ts:113](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L113) | Worker docs call it the **legacy graph file card**. It still exists, so it is stale in rank rather than nonexistent. | Make V2 target card and `kv2_*` primary; call the graph card optional legacy relationship hints. |
| `graph_related_functions` description says "opseq analogs" | The tool is live, but its model-facing noun is retired. | "instruction-shape analogs, callers, callees, data references, and corroborating xrefs." |

There is no lingering `ledger_search` instruction. Commit `9fa6a39b` removed the legacy learnings/ledger path, and current prompt/profile use `kv2_subject_record`, `kv2_attempt_search`, and the V2 search/resolve tools. [prompt.ts:115](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L115) [agent.ts:17](../../apps/server/src/core/agent-catalog/agents/running/worker/agent.ts#L17)

## 4. Audit Rules R1-R13 vs Current Prompt

The audit found zero genuine diff misreads, but 36/43 stalls churned after diagnosis. [phase3_rollup.md:109](../worker-audit-2026-09-01/rollups/phase3_rollup.md#L109) The prompt should therefore govern what happens **after** the worker reads a residual.

| Rule | Coverage | Evidence and gap |
|---|---|---|
| R1 map register/slot to value/live range | **Absent** | Only asks for "first mismatch shape" and generic falsifiable hypotheses. No live range or one-edge constraint. [prompt.ts:100](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L100) |
| R2 checkpoint gains; restore regressions; record failures | **Partial, strong** | "Keep verified improvements," revert no-ops/regressions, and "Save your best-scoring source variant." Failed shapes are not required in structured handoff. [prompt.ts:164](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L164) |
| R3 full diff, classify six ways, freeze solved regions | **Partial, weak** | Validation is generic. No classification or freezing instruction. [prompt.ts:165](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L165) |
| R4 stop family after 2-3 repeats, gather new evidence | **Partial** | Repeated small edits imply local maximum and structural pivot, but no hard cutoff or required new evidence class. [prompt.ts:169](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L169) |
| R5 bounded matrix/permuter on named mismatch | **Partial, misframed** | Phase 4 says use mutation previews first; rule 13 calls permuter a "last resort." Neither says current-best baseline, named mismatch, exact changed-instruction ranking, or manual replay. [prompt.ts:154](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L154) [prompt.ts:228](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L228) |
| R6 pivot to helper/inline/call boundary | **Partial** | Says adapt a solved analog's structure after plateau, but omits the named boundary choices and frame/neighbor checks. [prompt.ts:173](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L173) |
| R7 validate exact beyond score | **Partial** | Requires runner exactness, no regression, and narrow validation, but not exact window, relocation policy, full TU, gates, and cue ablation. [prompt.ts:42](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L42) [prompt.ts:223](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L223) |
| R8 relocation/data identity separate class | **Absent** | Symbols/data ownership occur only in initial reading. Nothing says stop allocator edits when instructions match. [prompt.ts:98](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L98) |
| R9 prologue/frame/stack as constraints | **Absent** | A register swap may require restructuring, but no stack procedure or uniform-displacement rule. [prompt.ts:168](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L168) |
| R10 exact-symbol history/accepted PR/sibling search | **Already stated in substance** | Phase 2 precedes editing and names matched code, graph, subject/attempt, PR, Discord/wiki evidence; phase 5 rereads attempts after plateau. It should say exact-symbol explicitly. [prompt.ts:112](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L112) |
| R11 reconstruct full data section | **Partial, section prompt only** | Reads object data and preserves pool/order/types/sizes. Missing bindings, relocations, alignment, generated tables, complete layout, and per-symbol plus whole-section verification. [prompt.ts:284](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L284) |
| R12 apply/escalate canonical external fix | **Already stated strongly** | In-slice first, then evidence-backed widening; local shims forbidden. [prompt.ts:210](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L210) |
| R13 bounded liveness cues plus ablation | **Absent** | No empty read, guarded use, self-assignment, required dummy, lifetime boundary, or cue-by-cue removal. |

The six audit differentiators align with these holes: predictive compiler hypotheses map to R1/R3; authored-structure escalation to R4/R6; object/section evidence to R3/R8/R11; target-specific source recovery to R10; bounded matrices/ablation to R5/R13; decomposition/freezing to R3. [phase3_rollup.md:37](../worker-audit-2026-09-01/rollups/phase3_rollup.md#L37) [phase3_rollup.md:97](../worker-audit-2026-09-01/rollups/phase3_rollup.md#L97)

## 5. Diff-Reading Instructions

`checkdiff_run` is described to the model only as focused one-function diff output; `checkdiff_summary` is PASS/FAIL target-and-neighbor evidence. The prompt says "Baseline score and first mismatch shape," "mismatch-specific probes," and to use checkdiff for function evidence. [prompt.ts:100](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L100) [prompt.ts:152](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L152) [prompt.ts:223](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts#L223)

It gives **no instruction** to classify a residual as instruction, register, stack, scheduling, relocation, or data-layout; name the source value/live range before editing; interpret checkdiff columns or windows; or freeze matched windows. This is the clearest mismatch between prompt and audit evidence. R1 and R3 have 37 and 22 report-level support respectively. [phase3_rollup.md:138](../worker-audit-2026-09-01/rollups/phase3_rollup.md#L138)

## 6. Handoff and Feedback

`WorkerRunnerValidation` structures status/reasons/command/exit code; summary, baseline, report, diff, object, stdout/stderr paths; target unit/symbol/before/after/improved/exact; function/unit/section regressions and improvements; and a post-return check with its own status, reasons, command, code, and artifact paths. [runner-validation.ts:1](../../apps/server/src/core/agent-catalog/agents/running/worker/runner-validation.ts#L1)

Change validation adds QA lint, optional widened-scope checks, and optional micro-gates. [change-validation.ts:117](../../apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts#L117)

The worker note itself has **no schema beyond JSON object**. `parseWorkerCheckpointNote` returns arbitrary `Record<string, unknown>`. [checkpoint-note.ts:1](../../apps/server/src/core/agent-catalog/agents/running/worker/checkpoint-note.ts#L1) The runner persists that object and extracts top-level `facts` and `blockers`, but there are no typed `diagnosis`, `residual_class`, `live_range`, `hypotheses`, or `tried_variants` fields. A repair attempt can receive prose from the prior output tail, runner JSON, diff, reasons, and continuation policy. A later worker cannot reliably query a near-miss diagnosis or avoid repeated variants.

## 7. Tests That Pin the Prompt

`prompt.test.ts` pins more than semantic invariants:

1. Loader behavior with absent/present graph and V2 data, including deterministic omission and loader order. [prompt.test.ts:70](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.test.ts#L70)
2. Section-target selection, its guidance, and omission of function phases. [prompt.test.ts:135](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.test.ts#L135)
3. Empty user prompt; packet-in-kernel-context; source/standards/tools/paths/graph/V2 tags and leads; banned retired labels; no raw placeholders. [prompt.test.ts:172](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.test.ts#L172)
4. Source truncation, full/compact/minimal ordering and exact caps, plus prefetched sandbox source precedence. [prompt.test.ts:218](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.test.ts#L218)
5. Exact function prompt order and literal wording for author/Sudoku thinking, phase names, opseq/KV2, last-resort permuter, paths, m2c, partial banking, widening/no-shims, runner ownership, and absence of `checkpoint_note`. [prompt.test.ts:330](../../apps/server/src/core/agent-catalog/agents/running/worker/prompt.test.ts#L330)

A rewrite must update the broad literal-string test, not only snapshots. Context-name or packet-shape changes also require the loader, compaction, and truncation assertions to change.

## 8. Budget and Tool Surface

The catalog selects `codex-lb/gpt-5.6-sol`, `thinking: "xhigh"`, disables extensions and subagents, and declares 31 custom tools. [agent.ts:7](../../apps/server/src/core/agent-catalog/agents/running/worker/agent.ts#L7) `tools.ts` adds no worker-specific tools. [tools.ts:1](../../apps/server/src/core/agent-catalog/agents/running/worker/tools.ts#L1)

The 31-tool surface is:

- Relationship/history: `code_graph_file_card`, `code_graph_search`, `knowledge_graph_search`, `graph_related_functions`, `past_prs_search`, six `kv2_*` record/search/resolve tools.
- Diff/build: `checkdiff_run`, `checkdiff_summary`, `direct_compile_tu`, `objdiff_score_candidate`.
- Compiler diagnosis: `mwcc_debug_lookup`, dump, stack/regflow/inline diagnoses, allocation snapshot/compare.
- Search/scaffolds: permuter run/replay, mutation preview, type oracle, m2c, asm-window search, type-layout lookup.
- Review: general lint scan and isolated `.sdata2` order helper.

The model descriptions appropriately call allocator snapshots expensive and late, regflow a late register-window tool, and permuter run/replay an "expensive last-resort bounded" search. That last description still lacks the operational R5 recipe. Metadata exists for raw MWCC dump, struct inference, include fixer, and item-state preview, but they are not exposed in the worker profile. [defaults.ts:8](../../apps/server/src/core/tools/profiles/defaults.ts#L8) [capabilities.ts:5](../../apps/server/src/core/tools/metadata/capabilities.ts#L5)

Repo runtime config sets no explicit token, output-token, or context-window limit. The provider/model registry supplies those hard limits. Runtime fallbacks are the same provider/model with medium thinking; game runtime options can override provider, model, thinking, and wall-clock timeout. Context errors trigger the full/compact/minimal packet ladder.

Separate from tokens, a claim has 5 base attempts plus 2 for each strictly new-best qualifying checkpoint. Exact acceptance, deadline, or exhaustion stops it. This budget rewards measurable gains, but unstructured notes mean extra attempts can still repeat old variants.

## Rendered Prompt Drift

The requested epoch-1 prompt, `worker_01a03f05-faa8-73c9-a105-464a5e9ee8da.system.md`, is 8,988 bytes, dated 2026-08-26; its user prompt is 138 bytes and task spec 1,311 bytes. The task spec records full context, xhigh thinking, 3,600-second TTL, and widening off. [epoch-1 task_spec.json:15](../../games/melee/state/runs/4a45af8a-9f8c-499b-b375-c0d8e93fc8fd/worker_state/fbe12874-df73-4565-b9eb-6cc310ee9ae5/task_spec.json#L15)

The newest directory by `.system.md` mtime that also contains `task_spec.json` is `worker_state/110f93ec-4a1e-4e8a-a52a-fa97b6e8fc1d/`. Its `worker_8b53c24c-....system.md` is 11,082 bytes, dated 2026-08-31; user prompt remains 138 bytes and task spec is 1,239 bytes. It targets `ftCo_800C2600`, keeps full/xhigh and widening off, raises TTL to 11,400 seconds, and changes the configure wrapper to relative `build/tools/wibo`. [newest task_spec.json:15](../../games/melee/state/runs/4a45af8a-9f8c-499b-b375-c0d8e93fc8fd/worker_state/110f93ec-4a1e-4e8a-a52a-fa97b6e8fc1d/task_spec.json#L15)

The rendered prompt diff is 15 insertions and 1 deletion, net +2,094 characters. It added communal-ledger context; `ledger_search` status/confidence guidance; the warning that permuter/mutation reachability may require a different structure; and the revised revert, score, local-maximum, save-best, and structural-pivot rules. Everything else stayed unchanged. This comparison also shows a historical transition: that 2026-08-31 render still used `ledger_search`, while current source has V2 tools.

Neither rendered system file contains the injected packet. Both user files contain only the 138-character generic turn instruction. Historical prompt files therefore cannot reproduce the full worker-visible boot context.

## Recommended Rewrite Priorities

1. Put an explicit residual-classification gate before editing, followed by source-value/live-range naming for register and stack cases.
2. Add a 2-3 identical-result stop rule, freeze matched regions, and require a new evidence class before another family.
3. Reframe permuter use as a bounded named probe with current-best baseline, exact-window ranking, and manual replay.
4. Add typed handoff fields for residual class, diagnosis, live ranges, frozen regions, hypotheses, tried variants, and evidence locators.
5. Demote/remove legacy graph/opseq language and make V2 plus local current evidence the named primary sources.

DONE
