# Knowledge System V2 Worker Audit

Date: 2026-09-03. Scope: repository state and `games/melee/knowledge/knowledge.sqlite` at audit time. SQL was run through `sqlite3 -readonly`. Design claims and implemented behavior are separated below.

## Executive Finding

V2 is a large, populated evidence store, but only a lossy slice reaches a worker. The database contains 119,611 facts, 264,410 evidence rows, 5,378 worker runs, and 4,592 run narratives. A worker boots with a V2 target card, but that card omits fact evidence, submission hypotheses, narrative summaries, notable observations, and full narratives. Worker tools can recover fact evidence and thin attempt history, but no worker tool returns the full run narrative. This breaks the most valuable audit pattern: recover a target-specific prior diagnosis and turn it into the next experiment.

The implementation is also deliberately hybrid. `ledger_search` and the learnings ledger are gone, but five other legacy graph/history tools remain beside six V2 tools. The old graph card is still injected even when a V2 card exists ([defaults.ts:16](../../apps/server/src/core/tools/profiles/defaults.ts#L16), [context.ts:829](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L829)).

The 40-commit history shows the sequence. `15e4f633` established contracts and the summarizer scaffold; `b1c08852` completed the store, ingest, index, librarians, backfill, consumer, and summarizer seam; `cf1a061d` added the run-loop consumer; `5d0377ed` fixed full backfill; `2a4ca1a8` made integration outcomes deterministic; `f77d3fd9` through `566d3df2` added rename/drift handling; and `9fa6a39b` deleted the V1 ledger, `ledger_search`, learnings builder, old librarian/API/UI paths, and replaced epoch ledger writes with V2 events. It intentionally kept the other graph tools. `15259ff7` then removed deprecated docs. The frozen 22,114 V1 records are audit-only, with no runtime reader ([deprecated README:3](../../games/melee/knowledge/deprecated/README.md#L3), [deprecated README:12](../../games/melee/knowledge/deprecated/README.md#L12)).

## 1. Store Model and Population

### Records

- A **target** is an addressable function or section with a stable key, unit, optional symbol/address, unit entity, and lifecycle state `current | moved | unresolved | retired`. Current stable keys are unique ([ddl.ts:8](../../apps/server/src/core/knowledge-v2/storage/ddl.ts#L8), [schema.ts:29](../../apps/server/src/core/knowledge-v2/storage/schema.ts#L29)).
- An **entity** is a reusable game concept or code pattern, with lifecycle state `active | merged | retired`; merged entities point to their survivor ([ddl.ts:36](../../apps/server/src/core/knowledge-v2/storage/ddl.ts#L36)).
- A **fact** belongs to exactly one target or entity. Only one live row may exist per subject and fact type. Types are `purpose`, `inferred_name`, `inferred_type`, `data_flow`, `state_behavior`, and `game_mapping`. Each row has a value, rationale, confidence in `[0,1]`, and update time ([schema.ts:8](../../apps/server/src/core/knowledge-v2/storage/schema.ts#L8), [ddl.ts:66](../../apps/server/src/core/knowledge-v2/storage/ddl.ts#L66)).
- **Evidence** belongs to a fact and records source kind, locator, optional digest, why it supports the claim, and capture time. Source kinds are `pr | discord | attempt | wiki | code` ([schema.ts:8](../../apps/server/src/core/knowledge-v2/storage/schema.ts#L8), [knowledge-record.ts:80](../../apps/server/src/core/knowledge-v2/views/knowledge-record.ts#L80)).
- A **link** joins two subjects, target or entity, with a semantic role, reason, source kind/locator, and digest. It is not a caller/callee edge. Call relationships stay in the legacy code graph ([knowledge-record.ts:27](../../apps/server/src/core/knowledge-v2/views/knowledge-record.ts#L27), [librarian prompt:151](../../apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/prompt.ts#L151)).
- Confidence is librarian-assigned claim confidence, not match score. Facts are mutable current truth: applying a fact replaces the single `(subject,type)` row and its evidence set ([records/index.ts:130](../../apps/server/src/core/knowledge-v2/records/index.ts#L130)). Identity lifecycle is separate from evidence drift.

### Three Concrete Facts

These are real rows, shortened only for readability. Reproduce with `SELECT t.stable_key,f.type,f.value,f.rationale,f.confidence,e.kind,e.locator FROM fact f JOIN target t ON t.id=f.target_id JOIN evidence e ON e.fact_id=f.id WHERE f.id=?`.

| Target | Type | Value and rationale | Confidence; evidence |
| --- | --- | --- | --- |
| `main/MSL/abort_exit:.bss` | `inferred_type` | "A 512-byte zero-initialized data section containing two arrays, `atexit_funcs[64]` and `__atexit_funcs[64]`..." The two 64 by 4-byte arrays exactly account for the section. | 0.99; `code://1e28b4203b/src/MSL/abort_exit.c#L1-L49`; fact `3ea7ef67-8351-4595-86dd-3e56d951f113` |
| `main/MSL/abort_exit:.sbss` | `state_behavior` | Callback depths drain toward zero in LIFO order; I/O and console hooks are one-shot because they are cleared after invocation; abort state skips only the normal cleanup stages. | 0.99; same code locator |
| `main/MSL/ansi_fp:.rodata` | `data_flow` | `__num2dec` walks `bit_values` by exponent bits and indexes `digit_values` by chunk length before decimal digit extraction. | 0.99; two code spans, lines 1-44 and 45-163 |

The row shape is concrete and citable. It is also heavily backfill-shaped: code evidence dominates, and the examples above describe program semantics rather than decomp tactics.

### Population Snapshot

| Table | Rows | Table | Rows |
| --- | ---: | --- | ---: |
| `target` | 22,237 | `target_status` | 22,210 |
| `entity` | 33,582 | `fact` | 119,611 |
| `evidence` | 264,410 | `link` | 30,574 |
| `worker_run` | 5,378 | `run_narrative` | 4,592 |
| `submission` | 14,791 | `pull_request` | 22,275 |
| `wiki_section` | 12,995 | `discord_message` | 76,452 |
| `event` | 0 | `index_task` | 1,869 |

Fact counts: purpose 23,325; data flow 23,050; inferred type 22,746; state behavior 20,629; game mapping 20,500; inferred name 9,361. Evidence counts: code 235,254; wiki 20,929; Discord 4,559; PR 2,858; attempt 810. Facts cover 22,158 of 22,237 current targets, 99.64%. The completed backfill stamped all 22,237 targets, but its audit found 4,531 out-of-scope links, 22,542 repeated unit-entity writes, 936 inferred names on named targets, 181 invalid citations, and a 581-link test-artifact concept. Population is not the same as quality ([handoff:9](../../objectives/knowledge-system-v2/handoffs/4-librarian-audit-sync-cycle.md#L9), [handoff:20](../../objectives/knowledge-system-v2/handoffs/4-librarian-audit-sync-cycle.md#L20)).

All facts have evidence, averaging 2.21 rows each. Confidence is unusually top-heavy: 116,838 facts are at least 0.75, 2,771 are 0.5-0.75, two are 0.25-0.5, and none equals 1.0. Only 7 of 109 pattern entities have any fact. Run history covers 839 targets; narrative history covers 823. All 4,592 narratives say `produced_by='backfill'`, not `live`. Of 5,378 runs, 540 matched, 2,515 improved, 1,415 made no change, and 908 errored; 783 error runs lack narratives.

### Inputs

Archival inputs are merged PRs and comments, Discord messages/threads, and the mirrored wiki. Operational inputs are worker attempts and current code. PR rows may attach directly to a target or its unit entity; attempt rows preserve deterministic outcome/integration plus narrative; code supplies current identity and citable spans ([target-ledger.ts:43](../../apps/server/src/core/knowledge-v2/views/target-ledger.ts#L43), [schema.ts:109](../../apps/server/src/core/knowledge-v2/storage/schema.ts#L109)). Search indexes Discord, wiki, PR, and attempt text. Graph-derived callers, callees, op-sequence analogs, match state, and file structure remain outside V2.

## 2. Worker Surfaces as Designed

The `60-worker-surfaces` design says the boot context is ordered as packet, legacy graph card, then V2 target card. It also says the last two appear only when data exists, although implemented graph behavior emits an unavailable block ([worker-surfaces doc:40](../../docs/10-system-design/40-knowledge/60-worker-surfaces/doc.json#L40), [worker-surfaces doc:79](../../docs/10-system-design/40-knowledge/60-worker-surfaces/doc.json#L79)).

| Designed block | Designed content |
| --- | --- |
| `context_budget` | mode and inline-source limit |
| worker packet | repair request, target/source, baseline, tools, canonical paths, standards |
| graph file card | legacy structural neighbors |
| target card | V2 ledger, integration/conflict outcomes, facts by type, and links |

Budgets are full, compact, and minimal. They respectively allow 32,000/12,000/3,000 source chars; full tool XML or names only; full/5-rule/2-rule standards; full/compacted/minimal graph; and V2 caps of 20/8/3 ledger entries, 8/4/2 links, and 3/1/0 facts per linked subject ([worker-surfaces doc:144](../../docs/10-system-design/40-knowledge/60-worker-surfaces/doc.json#L144), [card.ts:134](../../apps/server/src/core/knowledge-v2/card.ts#L134)).

The named knowledge tools are the five retained legacy tools plus `kv2_subject_record`, `kv2_pr_search`, `kv2_discord_search`, `kv2_wiki_search`, `kv2_attempt_search`, and `kv2_resolve_locator`. The design says `ledger_search` retired on 2026-09-03 ([worker-surfaces doc:227](../../docs/10-system-design/40-knowledge/60-worker-surfaces/doc.json#L227)).

The designed sequence is boot projection, on-demand evidence queries, deterministic review-lint ship gate, worker closure, optional summarizer job, `run_closed` task, librarian curation, then apply. The summarizer is supposed to convert transcript/checkpoints into `worker_run`, submissions, and `run_narrative`; the librarian alone promotes durable claims to facts/links ([worker-surfaces doc:390](../../docs/10-system-design/40-knowledge/60-worker-surfaces/doc.json#L390)).

## 3. Worker Surfaces Implemented Today

### Boot Blocks and Caps

| Block | Actual source | Actual cap/condition |
| --- | --- | --- |
| `context_budget` | selected retry budget | source cap 32k/12k/3k chars ([context.ts:35](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L35)) |
| `repair_request` | `packet.repair_request` | omitted when empty ([context.ts:320](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L320)) |
| `target` + `target_file` | packet target; prefetched text or checkout file | head/tail truncation at source cap ([context.ts:221](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L221)) |
| `baseline` | `packet.baseline` | no explicit cap ([context.ts:312](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L312)) |
| `available_tools` | worker profile | full XML in full; names only otherwise ([context.ts:731](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L731)) |
| `canonical_tool_paths` | paths verified in worker checkout | no explicit cap ([tool-paths.ts:86](../../apps/server/src/core/agent-catalog/agents/running/worker/tool-paths.ts#L86)) |
| `decomp_standards` | legacy standards renderer | full, 5 rules, or 2 rules ([context.ts:744](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L744)) |
| `target_graph_file_card` | packet graph card or live legacy graph lookup | always emits; minimal is reduced, compact equals full ([context.ts:376](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L376), [context.ts:657](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L657)) |
| `target_knowledge_card_v2` | fresh read of `knowledge.sqlite` by stable key | absent if no target/card; ledger 20/8/3, links 8/4/2, linked facts 3/1/0 ([context.ts:701](../../apps/server/src/core/agent-catalog/agents/running/worker/context.ts#L701), [card.ts:134](../../apps/server/src/core/knowledge-v2/card.ts#L134)) |

`packet.ts` also carries run, claim, enabled capabilities, stop rule, and runner contract, but this renderer never interpolates them. The runner precomputes `knowledge_card_v2` and lookup tools, yet `context.ts` ignores both and reloads the card ([packet.ts:29](../../apps/server/src/core/agent-catalog/agents/running/worker/packet.ts#L29), [worker-cycle.ts:2388](../../apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts#L2388)).

The V2 card itself includes status, facts, links, ledger summaries, submissions, PRs, and events. It drops every fact's evidence array, submission hypothesis/runtime locator, and `workerRun.summary`. That last loss is easy to miss: the ledger query loads narrative summary, but `toLedgerEntry` does not copy it ([target-ledger.ts:45](../../apps/server/src/core/knowledge-v2/views/target-ledger.ts#L45), [card.ts:250](../../apps/server/src/core/knowledge-v2/card.ts#L250)).

### Tool Status and Replacement Map

| Old tool | Today | Replacement/status |
| --- | --- | --- |
| `ledger_search` | retired and absent | no rename; split across `kv2_subject_record`, `kv2_attempt_search`, `kv2_pr_search`, and `kv2_resolve_locator`; stale `knowledge_ledger` chunks are hard-filtered ([search.ts:16](../../apps/server/src/core/knowledge/graph/storage/search.ts#L16)) |
| `knowledge_graph_search` | still worker-visible | unchanged legacy graph, all active graph sources; not V2 ([knowledge wrapper:117](../../apps/server/src/core/tools/wrappers/knowledge.ts#L117)) |
| `code_graph_search` | still worker-visible | unchanged legacy code-graph slice ([knowledge wrapper:107](../../apps/server/src/core/tools/wrappers/knowledge.ts#L107)) |
| `code_graph_file_card` | still worker-visible and injected | unchanged legacy file context ([knowledge wrapper:84](../../apps/server/src/core/tools/wrappers/knowledge.ts#L84)) |
| `graph_related_functions` | still worker-visible | unchanged callers/callees/data refs/opseq analogs ([knowledge wrapper:144](../../apps/server/src/core/tools/wrappers/knowledge.ts#L144)) |
| `past_prs_search` | still worker-visible | unchanged distilled legacy PR graph; partially superseded by richer `kv2_pr_search` |
| `asm_window_search` | still worker-visible | unchanged capability tool for instruction-window donor search, not a V2 tool ([capabilities.ts:651](../../apps/server/src/core/tools/wrappers/capabilities.ts#L651)) |

Workers get six V2 tools. `kv2_entity_lookup` and `kv2_unit_context` exist but are librarian-only, despite unit context being the direct V2 route to unit members and recent PRs ([knowledge-v2 roles test:25](../../apps/server/src/core/tools/wrappers/knowledge-v2-roles.test.ts#L25)).

Every tool result is finally capped at 24,000 characters. V2 list requests are clamped to 25 items; defaults are 12 Discord, 8 wiki, 10 PR, and 10 attempt hits ([results.ts:10](../../apps/server/src/core/tools/runtime/results.ts#L10), [knowledge-v2 wrapper:180](../../apps/server/src/core/tools/wrappers/knowledge-v2.ts#L180)). Despite the read-only product contract, V2 wrappers open the normal store/index constructors, which run migrations; their query handlers are non-mutating, but the open path is not literally read-only ([knowledge-v2 wrapper:164](../../apps/server/src/core/tools/wrappers/knowledge-v2.ts#L164), [store.ts:28](../../apps/server/src/core/knowledge-v2/storage/store.ts#L28)).

### Design/Implementation Gaps

1. The docs describe a bounded V2 card, but do not warn that the card strips all direct evidence and run narrative content.
2. "Graph compact" is not implemented: compact and full use the same graph-card branch.
3. Missing graph data produces an explicit unavailable block; missing V2 data silently removes the block.
4. The runner's precomputed V2 card and lookup hints are discarded and recomputed/omitted.
5. The old graph card still appears when V2 exists, contrary to the rollout plan to stop dual injection after V2 had real facts ([epoch validation:42](../../objectives/knowledge-system-v2/handoffs/4-epoch-validation.md#L42)).
6. Both feedback lanes are opt-in. Worse, summary catch-up runs once when its processor starts; the current call graph has no worker-close enqueue for workers that finish later in that run ([run-loop.ts:164](../../apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts#L164), [summarizer job:92](../../apps/server/src/core/knowledge-v2/summarizer-job/index.ts#L92)).
7. New attempt text is not searchable until a separate indexing job/CLI updates FTS ([index/job.ts:24](../../apps/server/src/core/knowledge-v2/index/job.ts#L24)).
8. The project handoff itself says workers should remain stopped until worker context is overhauled ([audit handoff:41](../../objectives/knowledge-system-v2/handoffs/4-librarian-audit-sync-cycle.md#L41)).
9. Card `runs` aggregates the full ledger and has no budget cap; links are first by ID, not ranked by relevance/confidence; a link-only target gets no V2 card ([card.ts:219](../../apps/server/src/core/knowledge-v2/card.ts#L219), [card.ts:295](../../apps/server/src/core/knowledge-v2/card.ts#L295), [card.ts:153](../../apps/server/src/core/knowledge-v2/card.ts#L153)).

## 4. Target-Specific Retrieval Matrix

| Need for target `unit:symbol` | Exact route today | Verdict |
| --- | --- | --- |
| Prior run outcomes/submissions | `kv2_attempt_search({target_stable_key:"unit:symbol"})`; or `kv2_subject_record` | Available, capped and lossy. Attempt results include description/hypothesis snippets; subject ledger is capped at 10 entries ([tools.ts:573](../../apps/server/src/core/knowledge-v2/tools.ts#L573), [tools.ts:636](../../apps/server/src/core/knowledge-v2/tools.ts#L636)). |
| Full prior run narrative and notable observations | None. `kv2_resolve_locator(attempt://run/...)` returns run/submission records, not `run_narrative`; attempt FTS indexes description+hypothesis only | **Not available to worker**, although stored and available to librarian ([tools.ts:795](../../apps/server/src/core/knowledge-v2/tools.ts#L795), [fts.ts:106](../../apps/server/src/core/knowledge-v2/index/fts.ts#L106)). |
| Accepted PR summaries for target/unit | `kv2_subject_record` ledger, `kv2_pr_search({query:"symbol path"})`, then `kv2_resolve_locator(pr://...)` | Summary/discussion available. Exact accepted patch/diff is **not returned by V2**; use checkout/git or legacy PR archive if present ([tools.ts:528](../../apps/server/src/core/knowledge-v2/tools.ts#L528), [tools.ts:721](../../apps/server/src/core/knowledge-v2/tools.ts#L721)). |
| Sibling functions in same unit | `kv2_unit_context({target_stable_key})` | Implemented but **not available to worker**. Legacy `code_graph_file_card` provides same-file functions. |
| Matched analog functions | `graph_related_functions({source_path,symbol})`, then `kv2_subject_record({target_stable_key: analog})` | Available through hybrid legacy graph plus V2. V2 links alone do not model caller/callee/opseq similarity. |
| Compiler behavior or MWCC idioms | Search `kv2_subject_record` only if a pattern entity is already known; otherwise keyword search source silos; legacy `knowledge_graph_search`; `mwcc_debug_lookup` | No dedicated V2 idiom query/card. Facts can attach to pattern entities, so the model can support it, but workers lack `kv2_entity_lookup` and boot cards do not retrieve idioms. |
| Exact supporting evidence for a target fact | `kv2_subject_record`, then `kv2_resolve_locator({locator})` | Available on demand. Not in boot card. |

The attempt locator grammar even accepts `/transcript/<span>`, but the resolver ignores that parsed span ([locator.ts:148](../../apps/server/src/core/knowledge-v2/locator.ts#L148), [tools.ts:795](../../apps/server/src/core/knowledge-v2/tools.ts#L795)). PR ingestion retains comment path, line, and diff hunk, while worker resolution exposes only the archived comment body. `kv2_pr_search` also has no exact target filter or comment index in its hit, so search-to-evidence resolution is weaker than the contract implies ([prs.ts:336](../../apps/server/src/core/knowledge-v2/ingest/prs.ts#L336), [tools.ts:773](../../apps/server/src/core/knowledge-v2/tools.ts#L773)).

## 5. Feedback Loop

1. With `--worker-summary`, startup catch-up enqueues `worker_summary` for eligible closed worker states. The handler reads checkpoints, integration records, and condensed transcripts ([summarizer job:213](../../apps/server/src/core/knowledge-v2/summarizer-job/index.ts#L213)).
2. Mechanical code fixes the run outcome, scores, and integration. The summarizer supplies run summary, per-submission approach/outcome reasoning, and reusable observations. One transaction writes `worker_run`, `submission`, `run_narrative`, advances the watermark, and enqueues `run_closed` ([summarizer job:314](../../apps/server/src/core/knowledge-v2/summarizer-job/index.ts#L314), [summarizer job:338](../../apps/server/src/core/knowledge-v2/summarizer-job/index.ts#L338)).
3. With `--librarian-consumer`, librarian context loads the run, submissions, full narrative, current record/ledger, source, and analogs. The librarian may propose facts, evidence, links, entities, or merges. Apply validates and writes them ([librarian context:466](../../apps/server/src/core/knowledge-v2/librarian/context.ts#L466), [apply/index.ts:616](../../apps/server/src/core/knowledge-v2/apply/index.ts#L616)).

A diagnosis such as "stalled on f5/f6 `fcmpo` register swap after X, Y, Z" can be stored in `run_narrative` and flattened into submission description. The librarian sees the full version. The next worker does not: its boot card discards even the narrative summary, attempt search exposes only description/hypothesis snippets, locator resolution omits narratives, and narrative text is absent from FTS. If the librarian promotes a durable compiler fact, the worker may later see that fact, but failed hypotheses are intentionally not promoted directly. Thus the exact near-miss diagnosis is stored but not reliably reusable by the next worker ([worker summarizer prompt:73](../../apps/server/src/core/agent-catalog/agents/knowledge/worker-summarizer/prompt.ts#L73), [librarian prompt:177](../../apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/prompt.ts#L177)).

One real stored example proves the difference: the latest no-change narrative for `mnNameNew_GlyphVariantSetup` records the reference allocation `gobj=r31`, `user_data=r30`, args `r27-r29`, versus current args `r28-r30`, `user_data=r21`, plus when that observation is reusable. SQL can return it with `target JOIN worker_run LEFT JOIN run_narrative WHERE stable_key=?`; no worker tool can return the same payload.

## 6. Recommended Worker Changes

Each proposal names a boot/tool budget. Budgets are character targets, not new global context limits.

1. **Prior-run capsule, 1,500 chars full / 900 compact / 400 minimal.** Query the newest 3/2/1 `worker_run + run_narrative` rows for the exact target. Include outcome, score delta, integration, summary, top two observations, and unresolved diagnosis. This directly addresses the 11/44 winning deep reads and the current narrative black hole.
2. **Evidence-backed target facts, 2,000 / 1,200 / 600 chars.** Keep the current six fact values, but add confidence plus the best locator and `why` for each from `fact + evidence`. Prefer PR/attempt evidence over code when equally confident. This turns a card claim into an immediately testable lead.
3. **Accepted-PR capsule, 1,200 / 700 / 300 chars.** From target/unit `pull_request`, include the newest exact-match PRs, attribution, summary, and resolvable PR locator. Add patch-file paths or git commit IDs during ingest so a worker can open the actual diff. This targets the audit's accepted-PR recovery wins.
4. **Analog capsule, 1,200 / 700 / 300 chars.** Use `graph_related_functions` for the top two opseq analogs and join each to `target_status`, latest matching PR, V2 facts, and latest successful run. Show only matched/high-score analogs. This targets sibling and matched-analog wins without duplicating the whole graph card.
5. **Compiler idiom card, 1,500 / 900 / 400 chars.** Represent MWCC allocator, inline, scheduling, compare, and packed-layout idioms as `pattern` entities with facts/evidence. Retrieve by mismatch class, instruction window, compiler version, and top graph analog. The schema already supports entity facts and target-to-entity links; add worker access to entity lookup or a purpose-built `kv2_compiler_idiom_search` ([knowledge-record.ts:23](../../apps/server/src/core/knowledge-v2/views/knowledge-record.ts#L23)).
6. **Narrative retrieval tool, response cap 6,000 chars.** Extend `kv2_resolve_locator(attempt://run/...)` or add `kv2_run_narrative` to return summary, observations, and bounded full narrative. Index summary and observations immediately after the summary transaction. This makes target-specific diagnoses actually retrievable.
7. **Worker unit context, response cap 4,000 chars.** Grant `kv2_unit_context` to workers and add target-symbol/outcome filters. Use it when the exact target lacks history. This replaces blind broad PR queries with bounded sibling evidence.
8. **One boot retrieval plan, 500 chars.** Render exact ready-to-call queries for the target: subject record, attempt history, target/unit PRs, top analog, and fact locators. The runner already computes `lookup_tools`; stop dropping it ([worker-cycle.ts:2403](../../apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts#L2403)).
9. **Close the feedback gap before relying on freshness.** Enqueue `worker_summary` at every worker-close transition, enable summary/librarian lanes for production epochs, and index the transaction's new attempt/narrative rows. Until then, label card freshness with the latest summarized close time and pending count.
10. **Replace dual cards with one ranked worker card, 6,000 / 3,500 / 1,500 chars.** Preserve structural graph leads, then spend remaining budget on exact-target runs, accepted PRs, facts with evidence, and analogs. Remove low-value counts and duplicate search suggestions. This follows the measured behavior: target-specific prior evidence matters more than two overlapping catalog summaries.

## Bottom Line

Knowledge V2 has enough raw material to improve workers now. Its weak point is delivery. The current worker sees semantic summaries without citations and attempt metadata without the diagnosis. The first change should expose bounded exact-target narratives and evidence, then rank accepted PRs and matched analogs into the same boot card. A compiler-idiom entity layer is feasible after that, but it should not delay fixing the missing target history.
