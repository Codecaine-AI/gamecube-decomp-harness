# Worker Prompt and Context: What to Change

Date: 2026-09-03. Scope: the Melee function-worker system prompt, its injected boot context, the Knowledge V2 surfaces it reads, and the harness tools the prompt has to describe accurately. **This is a specification of changes, not an implementation.** Nothing in the repo was modified.

Evidence base:

- `analysis/worker-audit-2026-09-01/` — 1,627 worker runs, 44 deep-read exact/near-miss pairs, rollups (referenced as "the run audit").
- `A-knowledge-v2-audit.md` — the V2 store, what reaches a worker, feedback loop.
- `B-worker-prompt-audit.md` — prompt anatomy, injected context, staleness, rule coverage, pinned tests.
- `C-tooling-reference.md` — every worker tool's real contract, output shape, failure modes, and the per-residual-class evidence order.
- Direct checks in this session: rendered a real V2 card, measured a real boot context, counted store rows, confirmed the attempt search index is empty.

---

## 0. The short version

The run audit found that workers **read the diff correctly and then fail to act on it**: 36 of 43 stalls were post-diagnosis churn, zero were diff misreads. The prompt today has no instruction for what to do *after* the diff is read — no residual classification, no "name the live range before editing", no stop rule for a variant family, and it frames the permuter as a blind last resort rather than a bounded probe. Meanwhile the knowledge overhaul retired the one lookup surface that correlated most with exact matches (`ledger_search`, used by 98% of exact workers) and the V2 replacement does not yet deliver the equivalent: the summarizer already writes excellent per-run diagnoses and reusable tactics, but **no worker surface returns them**, and the attempt search index is empty.

Ranked changes (details in the numbered sections):

| # | Change | Kind | Addresses | Effort |
|---|---|---|---|---|
| 1 | Rewrite the workflow as a **diff-first loop**: read full diff → classify residual → name the compiler mechanism → one edit → re-diff, with a hard 2–3-repeat stop rule and an escalation ladder | prompt | 36/43 plateau churn; R1, R3, R4 | 1 day incl. tests |
| 2 | Add an **advanced tooling** section: evidence order per residual class, allocator limits (GPR-only), permuter-as-probe recipe, nested-failure reading rule | prompt | misuse of permuter/diagnostics; 9 tooling-gap pairs | 0.5 day |
| 3 | **Surface run narratives and observations to workers**: on the V2 card (run summary + top observations + unresolved diagnosis) and via a narrative-returning tool | KV2 + context | 11/44 "target-specific prior evidence" wins; ledger_search regression | 1–2 days |
| 4 | **Fix `kv2_attempt_search`**: FTS indexes only rows with a non-null hypothesis, and every hypothesis is null → the index has 5,378 empty rows, every text query returns nothing | KV2 bug | prompt tells workers to use a tool that silently returns nothing | 0.5 day |
| 5 | **Inject the first full diff at boot** (capped) so the worker starts from evidence, not from a 33K source dump | context | orient time; the diff is the classifier | 0.5 day |
| 6 | **Cap and rank the V2 card**; stop dual-injecting the legacy graph card; use the runner's precomputed card and retrieval plan instead of recomputing/discarding | context | 26K-char uncapped card; 2.4K graph card with dead fields | 1 day |
| 7 | **Typed handoff fields** (residual class, mechanism named, tried shapes, untried leads, evidence locators) and a matching summarizer schema so a near-miss diagnosis is structured, not prose | worker + summarizer | reusability of failed runs; R2 | 1 day |
| 8 | Give failed runs somewhere to go in the store: a `tactic`/`compiler_shape` fact type or pattern-entity path; revise the librarian line "a run that failed teaches only what the ledger already holds" | KV2 model + librarian | compiler-idiom knowledge has no slot | 1–2 days |
| 9 | Migrate the frozen V1 learnings (22,114 records; 2,893 symbols with non-refuted symbol-scoped learnings) into V2 as run-independent observations | KV2 migration | the retired corpus | 1 day |
| 10 | Tool fixes the prompt depends on: permuter per-candidate instruction deltas; `direct_compile_tu` argparse bug; permuter/wibo health check per worktree | harness | R5; 21% transport-error rate on direct compile | 2–3 days |

Do 1, 2, 4, 5 first: they are cheap, independent of the store model, and target the dominant failure directly. 3 and 6 make the knowledge overhaul actually pay off. 7–9 are the feedback loop. 10 is parallel harness work.

---

## 1. What the worker sees today

### 1.1 System prompt (11,067 chars)

Sections: `goal`, `definition_of_done`, `thinking` ("think like Sudoku"), `context_contract`, `workflow_context` with five phases (holistic file understanding → solved reference pass → hypothesis generation → hypothesis testing → edit and evaluate), `runner_validation_handoff`, `contracted_in_rules` (17 rules). Source: `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts`.

What it does well: evidence ranking (local > historical), hypothesis framing with falsifiers, keep-gains/revert-regressions, save best variant, structural pivot after plateau, write-set discipline, widening request contract.

What it lacks (B §4–5, mapped to the run-audit rules):

| Rule from the run audit | Support | In prompt today |
|---|---|---|
| R1 map register/stack mismatch to source value + live range before editing; one edge at a time | 37/44 | **absent** |
| R2 checkpoint gains, restore on regression, record failed shapes | 36/44 | partial — no structured record of failed shapes |
| R3 after each edit: full diff, classify residual (instruction / register / stack / scheduling / relocation / data-layout), freeze matched regions | 22/44 | **absent** |
| R4 stop a variant family after 2–3 identical diffs; get a new evidence class before continuing | 22/44 | partial — "treat as local maximum" with no cutoff |
| R5 permuter only for a bounded, named mismatch; rank by changed instructions; replay manually | 20/44 | **misframed** — "expensive last resort" with no recipe |
| R6 pivot to helper / inline / call boundary | 17/44 | partial |
| R7 validate exact beyond score (window, relocation policy, neighbors, gates, ablate cues) | 17/44 | partial |
| R8 relocation/data identity is a separate class — stop allocator edits once instructions match | 16/44 | **absent** |
| R9 frame/stack as explicit constraints; uniform displacement → one lifetime or `PAD_STACK` | 15/44 | **absent** |
| R10 exact-symbol history before long allocator search and at every plateau | 13/44 | stated in substance |
| R11 data-section full reconstruction | 9/44 | partial (section prompt only) |
| R12 escalate out-of-write-set fixes immediately | 6/44 | stated strongly |
| R13 liveness cues + ablation | 4/44 | **absent** |

Stale language still in the prompt: "opseq similarity leads", "opseq-analog solved function", "graph file card as first-pass" (the concept page was retired in `15259ff7`; the graph card is a documented legacy surface). The `graph_related_functions` model-facing description also still says "opseq analogs".

### 1.2 Boot context (~66K chars measured on a real epoch-1 worker; 54–75K by builder reconstruction)

| Block | Chars (measured) | Target-specific | Note |
|---|---:|---|---|
| `target_file` (source, CDATA) | 33,025 | yes | capped 32K/12K/3K by budget; head/tail truncation |
| `decomp_standards` | 18,561 | no | 13 rules with bad/preferred code pairs; enforced at the gate anyway |
| `available_tools` | 6,028 | no | one line per tool |
| `canonical_tool_paths` | 2,407 | checkout | |
| `target_graph_file_card` | 2,362 | file | legacy graph; `mismatch_patterns`, `tactics`, `review_risks` attachment counts are always 0 (no such tables exist in `graph.sqlite`) |
| `target` + `baseline` | ~1,300 | yes | score + priority reason string |
| `target_knowledge_card_v2` | 0 → **25,974** | yes | absent for every worker in the audit run (predates V2); rendered today for `grZebes_801D99E0` at `full` it is ~26K chars, uncapped |
| **first diff** | **0** | — | **not injected**; every worker must call `checkdiff_run` to see its own mismatch |

Two consequences. First, the worker's orientation budget is spent on source and standards, not on the mismatch. Second, with a populated V2 card the boot context grows to ~90K chars with the largest block being an uncapped JSON ledger — the card needs a character budget, not just an entry count.

### 1.3 Knowledge V2: what exists vs what is delivered

Store (`games/melee/knowledge/knowledge.sqlite`): 22,237 targets; 119,611 facts across six semantic types (`purpose`, `inferred_name`, `inferred_type`, `data_flow`, `state_behavior`, `game_mapping`); 5,378 worker runs, 14,791 submissions, 4,592 run narratives (4,591 with notable observations); 22,275 PRs; 30,574 links (roles `implements`, `exhibits`, `uses`, `related` — semantic, not caller/callee).

The summarizer output is genuinely good. Real stored observations:

> "When an otherwise nearly matching function differs only in its frame allocation and save-slot offsets, adjusting an existing PAD_STACK declaration can correct the generated prologue… reusable_when: the assembly diff shows a uniform stack-frame-size discrepancy (compiled 0x30 frame vs required 0x38)."

> "The target column sequence needs data->jobjs[7] and data->jobjs[8] to reuse the earlier scan-pointer registers, while the newly created column JObj remains live through the inlined translation setter… a candidate that fixes only the two reference registers or only the setter receiver is incomplete."

That second one is a *near-miss* run's diagnosis — exactly what the next worker on that target needs, and exactly the category the run audit says wins (11/44 pairs: recover target-specific prior evidence and convert it to the next experiment).

What a worker can actually get today:

| Content | On the boot card | Via a worker tool |
|---|---|---|
| Per-submission narrated approach + score + outcome | **yes** (ledger entries, newest first, 20/8/3 by budget) | `kv2_subject_record` (10 entries), `kv2_attempt_search` (snippets, by stable key only) |
| Run-level summary | no (loaded by the ledger view, dropped by `toLedgerEntry`) | `kv2_subject_record` → `workerRun.summary` |
| **Notable observations (tactics, reusable_when)** | **no** | **no tool returns them** |
| Unresolved diagnosis of the latest failed run | no (only as prose inside a submission description) | no |
| Fact evidence locators + why | no | `kv2_subject_record` + `kv2_resolve_locator` |
| Accepted PR diff | no | not in V2; summary/discussion only |
| Compiler idioms / MWCC shape knowledge | no | none — `mwcc_debug_lookup`'s "cached compiler-shape notes" corpus is 44 KB of cache/probe files; no fact type or entity carries tactics |
| Prior worker runs by *text* ("fcmpo register", "PAD_STACK") | — | **broken**: `buildAttemptFts` indexes `submission WHERE hypothesis IS NOT NULL`; 0 of 14,791 submissions have a hypothesis; `attempt_fts` holds 5,378 rows with empty text; any `kv2_attempt_search` call with a `query` returns zero results |

Feedback loop status: both lanes (`--worker-summary`, `--librarian-consumer`) are opt-in, summary catch-up runs once at processor start with no worker-close enqueue, and new attempt text is not indexed until a separate job runs. All 4,592 narratives are `produced_by='backfill'` — none from a live run. The librarian prompt explicitly says a failed run "teaches only what the ledger already holds", and the six fact types have no slot for a tactic, so observations are never promoted.

The retired V1 learnings ledger held 22,114 symbol/file/area-scoped statements of precisely this kind ("remaining mismatch is register-allocation: target keeps the argument in r31 and the nametag pointer in r30…", "combined assignment/return regressed 94.6 → 92.3"), 2,789 of them corroborated at symbol scope. `ledger_search` over that corpus was used by 98% of exact workers vs 83% of near-misses. It is frozen under `knowledge/deprecated/ledger-v1` with no runtime reader and no V2 migration.

### 1.4 Tool facts the prompt must respect (from C)

- `checkdiff_run(full_diff=true)` is the classifier: it returns up to 24 mismatching instruction/data rows with `diff_kind`/`arg_diff`. It does not name a source variable or cause. Instruction parity can still hide strict relocation/data differences — no worker wrapper returns full relocation JSON.
- `mwcc_alloc_snapshot` / `_compare` expose **GPR coloring only** (vreg → physical, interference neighbors, simplify order). No FPR coloring, no source-variable identity, no live intervals, no comparison to retail. "Before/after" is two stages of one compile, not candidate vs target. Median 5.1 s.
- `mwcc_debug_diagnose_regflow` picks one compact register-only window; `_stack` reports frame/slot drift and candidate locals; `_inlines` suggests a boundary. All three fail without the instrumented compiler (`Unhandled function 190`, no `pcdump.txt`).
- `source_permuter_run` returns progress counters, best scalar score, and one unified source diff. **No per-candidate instruction delta.** Median 62 s. Observed failures: function not found at source path, parse failure, wibo exec-format, stale extracted baseline.
- `direct_compile_tu` has a 21% transport error rate, largely an argparse bug: the wrapper forwards both `function` and `unit` but the script declares them mutually exclusive.
- Many tools return an outer `status: ok` around a nested `exit_code: 1` / `file_not_found` / empty result. The prompt has to say: read the payload, not the envelope.
- `kv2_*` tools: zero calls in the audit run (they did not exist). No observed durations.

---

## 2. The target flow

The process the prompt should install, distilled from what exact workers actually did:

```
ORIENT ─────► READ THE DIFF ─────► NAME THE MECHANISM ─────► ONE EDIT ─────► RE-DIFF
  │               │                       │                      │              │
  │  boot card    │  checkdiff_run        │  which live range /  │  smallest    │  classify the new
  │  first diff   │  full_diff=true       │  slot / boundary /   │  source      │  residual; freeze
  │  prior runs   │  classify residual:   │  section rule moved  │  change that │  what now matches
  │  exact-symbol │  instruction |        │  it; what instruction│  the         │
  │  history      │  register | stack |   │  change you predict  │  hypothesis  │
  │               │  scheduling |         │                      │  predicts    │
  │               │  relocation | data    │                      │              │
  └───────────────┴───────────────────────┴──────────────────────┴──────────────┘
                                   ▲                                       │
                                   │         same residual 2–3× ───────────┘
                                   │                    │
                                   │                    ▼
                                   │      ESCALATION LADDER (new evidence class each rung)
                                   │      1. allocator / stack / inline diagnostic for the class
                                   │      2. exact-symbol history: prior runs, accepted PRs, matched sibling
                                   │      3. structural change: helper / inline boundary / indexed access
                                   │      4. bounded permuter probe on the named region; read deltas
                                   │      5. section/relocation evidence if instructions already match
                                   │      6. out-of-write-set fix → widening request or hand back
                                   └──────────────────────────────────────────────────────────────
                                                        │
                                                        ▼
                                              HANDOFF (typed: residual class, mechanism,
                                              tried shapes, untried leads, best checkpoint)
```

Evidence order per residual class (from C §"Diagnostic Flow", grounded in pair reports):

| Residual class | Decisive evidence, in order | Then one edit of this kind |
|---|---|---|
| Instruction shape / control flow | full diff → local instruction window vs source construct | one operand/call/loop simplification |
| Register-only GPR swap | full diff → map wrong operands to semantic values → `diagnose_regflow(show_lines)` → `alloc_snapshot(pair)` + `alloc_compare` → name the vreg / interference edge / coalescing boundary | one lifetime change (split, merge, rescope, remove a temp, reuse an existing temp) |
| Register-only FPR swap | full diff → objdump/regflow; state that allocator capture is GPR-only | one narrow lifetime/dependency probe on the float values |
| Stack slot / frame size | full diff → direct compile + objdump → `diagnose_stack(show_lines, show_mwcc)` → map local to slot | one declaration/scope/expression/helper change; `PAD_STACK` only for uniform displacement |
| Scheduling | full diff → dependency order in PCode/objdump | one dependency / pointer / call-shape change |
| Relocation / symbol | instructions pass but strict score fails → direct compile + relocation-aware objdiff → resolve left/right symbols | one literal / symbol / `.sdata2` order edit; verify strict + neighbors |
| Data-section layout | section diff → direct compile → objdump/nm/readelf → account exact bytes, binding, strings, relocs | one ownership/order/storage edit; verify raw bytes |
| Inline boundary | full diff + regflow shows a persistent live-range cluster → history/analogs → `diagnose_inlines` | extract one semantic helper around the coupled work; check frame + neighbors |

---

## 3. Prompt changes (section by section)

Target size after rewrite: ~15–16K chars (from 11K). The worker runs at `xhigh` thinking on a large-context model; the prompt is not the budget constraint, the 66K boot context is.

### 3.1 Keep as-is

`goal`, `definition_of_done`, `thinking` (author-idiom / Sudoku framing is good and supported by the "recover authored structure" differentiator), the widening contract, destructive-command bans, m2c rule, tool-path rules, "do not create a manual ledger".

### 3.2 `context_contract` — reorder authority, retire legacy-first language

- Make the V2 target card the named primary historical source; demote the graph file card to "optional structural hints (same-file symbols, callers/callees)". Remove "first-pass solved-reference context" and "opseq analogs" wording.
- Add: "The injected `first_diff` block is your starting residual. Classify it before reading anything else in depth." (depends on §4.1)
- Add: "The card's `prior_runs` block carries the last runs' summaries, reusable observations, and the unresolved diagnosis. Treat an unresolved diagnosis as your first hypothesis, not as history." (depends on §4.2)

### 3.3 `workflow_context` — restructure the five phases into the diff-first loop

Draft text (bullets are the intended prompt lines; adapt to the prompt-kit DSL):

**Phase 1 — `orient`** (replaces `holistic_file_understanding`, shorter)
- Read the target, the first diff, the prior-run capsule, and the standards summary. Then the source around the target.
- Classify the first residual as one of: instruction shape, register-only (GPR or FPR), stack slot/frame, scheduling, relocation/symbol, data-section layout, inline boundary. Write the class and the specific rows down; every later step refers back to it.
- Only then read nearby matched code, headers, types, and data ownership — looking for what the residual class needs, not the whole file.

**Phase 2 — `exact_symbol_history`** (replaces `solved_reference_pass`)
- Before any edit, read what already happened on *this* symbol: the card's prior runs and observations; `kv2_subject_record` for the full ledger; `kv2_attempt_search({target_stable_key})` for outcomes; `kv2_pr_search` for the accepted PR on this symbol or its unit; `graph_related_functions` for a matched sibling, then `kv2_subject_record` on that sibling.
- A prior run's unresolved diagnosis, a matched sibling's shape, or an accepted PR's structure is a hypothesis to test first. A prior failed shape is a shape to skip unless you have new evidence.
- Resolve any locator you rely on. Search snippets are leads, not evidence. Empty results are normal and not negative evidence.

**Phase 3 — `name_the_mechanism`** (replaces `hypothesis_generation`)
- For the residual you classified, name the compiler mechanism that produces it: which source value's live range, which coalescing edge, which stack slot owner, which inline boundary, which section-order rule. Use the diagnostic for that class (see `advanced_tooling`) to get there; do not guess from the score.
- State the prediction: "if I change X, instruction Y becomes Z". A hypothesis without a predicted instruction change is not ready to test.
- Keep negative hypotheses that rule out tempting shapes already refuted by the ledger.

**Phase 4 — `one_edit_then_diff`** (replaces `hypothesis_testing` + first half of `edit_and_evaluate`)
- Make the smallest source change the hypothesis predicts. Compile, run `checkdiff_run(full_diff=true)`, and re-classify the residual.
- Freeze what now matches: do not touch regions whose instructions match unless the residual class forces it.
- Keep a verified improvement; revert a no-op or regression unless it is a deliberate restructuring you judge by whether the new shape can reach exact.
- **Stop rule:** when two or three variants in one family (declaration order, casts, scope, expression form, literal form) reproduce the same residual rows, that family is exhausted. Do not try a fourth. Go to the escalation ladder and come back only with a new evidence class.

**Phase 5 — `escalate`** (replaces second half of `edit_and_evaluate`)
- Take the rungs in order; each rung must add a new kind of evidence, not more variants:
  1. The class diagnostic you have not run yet (allocator snapshot for GPR, `diagnose_stack` for frame, `diagnose_inlines` for a persistent cluster).
  2. Exact-symbol history again, now with the specific residual in the query.
  3. Change the abstraction, not the syntax: extract or recover a semantic helper, move an inline boundary, replace long-lived pointer locals with indexed access, reconstruct the authored owner/subobject model from a matched sibling. Accept a temporary score drop; judge the new shape by whether it can reach exact.
  4. A bounded permuter probe on the named region (recipe in `advanced_tooling`).
  5. If instructions match and only the strict score fails: switch to relocation/section evidence and stop allocator edits.
  6. If the proven fix is outside your write set: send a `widening_request` or hand back with the diagnosis. Do not spend the turn on source-only substitutes.
- Hand back when you have a buildable improvement, a falsified hypothesis worth recording, or a diagnosed residual with no in-scope lever.

### 3.4 New section — `advanced_tooling`

Draft content (keep it factual; this is the section the tool audit exists for):

- **Reading a diff.** `checkdiff_run(full_diff=true)` returns up to 24 mismatch rows with a kind (`DIFF_ARG_MISMATCH`, opcode change, missing/extra instruction) and both sides. Classify from the rows, not the percent. A percent above 99.9 can be a single register swap that needs restructuring; a percent below 95 can be one struct fix away.
- **Register-only residual (GPR).** `mwcc_debug_diagnose_regflow(function, show_lines=true)` names the semantic values in one compact window. `mwcc_alloc_snapshot(unit, function, capture="pair")` then `mwcc_alloc_compare(before, after)` show which virtual register changed color, degree, interference neighbors, or simplify-order position. These tools do not name a C local — you establish that mapping from the PCode operands and source. "Before/after" is two stages of one compile, not candidate vs target.
- **Register-only residual (FPR).** Allocator capture is GPR-only; expect no coloring for f-registers. Work from objdump and regflow, and probe one float lifetime at a time (distinct temporaries, promotion to function scope, literal form).
- **Stack/frame residual.** `mwcc_debug_diagnose_stack(function, show_lines=true, show_mwcc=true)` reports frame sizes, slot drift, and candidate locals. A uniform displacement across all stack references is one missing or extra slot: one lifetime, one inline boundary, or `PAD_STACK`. Scattered drift is not.
- **Inline boundary.** `mwcc_debug_diagnose_inlines` suggests a boundary; it cannot prove extraction improves codegen. Extract one semantic helper around the coupled work, then re-check frame size and neighboring functions.
- **Relocation / data identity.** When instruction rows match but the strict score does not, the residual is symbol, `.sdata2` order, binding, or section ownership. Use `direct_compile_tu` + objdump/readelf on the object; use `review_lint_sdata2_order_helper` only for pure `.sdata2` ordering. Stop allocator experiments; they cannot move a relocation.
- **Permuter as a probe, not a finder.** Run `source_permuter_run` only after you have named the function *and* the bounded region or helper that owns the residual, with `mutate_functions` limited to that scope and `max_iters` in the hundreds, not thousands. The tool returns a scalar score and one source diff — no instruction delta. Replay the interesting candidate with `source_permuter_replay`, then read its instruction delta with `checkdiff_run(full_diff=true)`. Treat the result as evidence about which source region controls the residual; hand-write the final edit. A broad search that "finds nothing better" is confirmation of a local maximum, not a reason to run a bigger one.
- **Ablation.** After any change that improves the score, remove each added cue one at a time and re-diff. A cue whose removal changes nothing is noise; delete it before handoff.
- **Read payloads, not envelopes.** Several tools return `status: ok` around a nested `exit_code: 1`, `file_not_found`, `unknown function`, or empty result. `direct_compile_tu` currently rejects calls that pass both `function` and `unit`; pass one. If the permuter reports the function was not found at its source path, fix the invocation before drawing any conclusion. If `mwcc_debug_*` reports `Unhandled function` / no `pcdump.txt`, the instrumented compiler is unavailable — fall back to objdump and allocator snapshot.
- **History tools.** `kv2_subject_record({target_stable_key})` is the full record and ledger; `kv2_attempt_search({target_stable_key, outcome?})` lists runs and submissions; `kv2_pr_search`, `kv2_discord_search`, `kv2_wiki_search` search text; `kv2_resolve_locator` opens any hit. `graph_related_functions` gives callers, callees, data refs, and instruction-shape analogs from the legacy graph. `past_prs_search` is the legacy PR digest. `asm_window_search` finds a donor for one 32-instruction construct; similarity is not provenance.

### 3.5 `contracted_in_rules` — edits

- Replace rule 13 ("`source_permuter_run` is expensive. Use it only as a last resort…") with: "Use `source_permuter_run` only as a bounded probe on a named region after the residual is classified and the mechanism hypothesis is written down. Read candidate instruction deltas via replay + full diff; never adopt a candidate on score alone."
- Add: "Stop a variant family after two or three variants reproduce the same residual rows. Escalate to a new evidence class before editing again."
- Add: "Do not run allocator or regflow diagnostics on a residual you have not classified as register-only."
- Add: "Once instruction rows match, treat any remaining strict-score gap as relocation/data identity and stop allocator edits."
- Add: "An exact score is not done: check the exact instruction window, relocation policy, neighboring functions, and review gates; ablate cues that only happened to match."
- Remove "opseq" and "graph file card as first-pass" wording wherever it appears; the `graph_related_functions` description should say "instruction-shape analogs".

### 3.6 `runner_validation_handoff` — typed fields (see §6 for the schema)

Add: "Your handoff JSON must carry `residual` (class, rows, mechanism named or `unknown`), `tried_shapes` (family, variants, effect), `untried_leads`, `best_checkpoint`, and `evidence_locators`. These fields are joined into the target's history and shown to the next worker on this target."

### 3.7 Tests to update

`prompt.test.ts` pins literal strings for: author/Sudoku thinking, phase names, opseq/KV2 wording, "last resort" permuter rule, m2c rule, tool paths, partial banking, widening/no-shims, runner ownership, and absence of `checkpoint_note`; plus loader order and compaction caps. A rewrite must update the literal-string test deliberately (phase names change; "last resort" wording goes away; opseq wording goes away). `kernel-catalog.test.ts` asserts `ledger_search` is absent — keep.

---

## 4. Context / packet changes

### 4.1 Inject the first diff at boot — new block `first_diff`

- Runner computes `checkdiff_run(function, full_diff=true)` at claim time (it already compiles for the baseline) and injects the result, capped at ~4,000 chars (full) / 2,000 (compact) / 800 (minimal, header rows only).
- Include the residual row count by kind so the prompt's classification step has something deterministic to start from.
- Place it directly after `target`/`baseline`, before `target_file`.
- Why: the diff is the classifier; today every worker spends its first calls rediscovering it, and the 33K source dump is what it reads first.

### 4.2 V2 target card — rank, cap, and carry the run narrative

Change `buildV2TargetCard` / `targetKnowledgeCardV2Xml`:

- **Character budget**: 6,000 / 3,500 / 1,500 chars by context budget (A §6.10), enforced by truncating entries, not by dropping the block.
- **Prior-run capsule** at the top: newest 3/2/1 runs for the exact target, each with outcome, score delta, integration, `run_narrative.summary` (currently loaded then dropped), top two `notable_observations` with `reusable_when`, and — once §6 lands — the structured `residual`/`tried_shapes`/`untried_leads` from the handoff. Mark the newest failed run's diagnosis as `unresolved_diagnosis`.
- **Ledger entries**: keep newest-first submissions but truncate each description to ~400 chars; the full text stays reachable via `kv2_subject_record`.
- **Facts**: keep the six values; add confidence and the best evidence locator + `why` for each (A §6.2).
- **Accepted-PR capsule**: newest exact-match PRs for target/unit with attribution, summary, and a resolvable locator; add commit ID / patch path at ingest so the diff is openable (A §6.3).
- **Analog capsule**: top two `graph_related_functions` analogs joined to `target_status`, latest matching PR, and latest successful run summary (A §6.4) — this is what "recover a matched sibling's authored structure" needs and what the legacy graph card does not provide.
- **Retrieval plan**: 5–8 ready-to-call queries for this target (subject record, attempt history, unit PRs, top analog record, fact locators). The runner already computes `lookup_tools` and `knowledge_card_v2` in `worker-cycle.ts`; `context.ts` discards both and recomputes — stop that.
- **Freshness stamp**: latest summarized close time and pending-summary count, so the worker knows whether the card includes the last run on this target.

### 4.3 Retire the dual card

Stop injecting `target_graph_file_card` when a V2 card exists (the rollout plan in `handoffs/4-epoch-validation.md` already says so). Fold its two useful items — same-file symbols and editability — into the V2 card or the `target` block. Drop `mismatch_patterns` / `tactics` / `review_risks` counts (always zero).

### 4.4 Standards block

18.5K chars of bad/preferred code pairs is a third of the boot context for rules that the lint gate enforces deterministically anyway. Options: (a) keep full at boot but move code pairs behind a `review_lint_scan` explanation, (b) inject the 13 rule titles + one-line descriptions (~3K) and the full text on repair only. Recommend (b) with a measurement: lint-failure rate before/after.

### 4.5 Budget ladder

With §4.1–4.4: full ≈ 33K source + 4K diff + 6K card + 6K tools + 2.4K paths + 3K standards ≈ 55K chars — smaller than today, with the diff and the history in it.

---

## 5. Knowledge V2 changes

### 5.1 Fix attempt search (bug)

`buildAttemptFts` (`index/fts.ts:106`) only indexes submissions with a non-null hypothesis; no submission has one. Index `description` unconditionally, plus `run_narrative.summary` and the flattened `notable_observations`. Then `kv2_attempt_search({query})` works, and a worker can search "uniform frame displacement PAD_STACK" across all runs. Re-run the index job after the change.

### 5.2 Narrative retrieval for workers

Either extend `kv2_resolve_locator(attempt://run/<id>)` to return `{summary, notable_observations, narrative}` (bounded, ~6K chars), or add `kv2_run_narrative({run_id | target_stable_key, limit})`. Today the librarian sees the full narrative; the worker sees nothing (A §5).

### 5.3 A place for tactic knowledge

The six fact types are semantic ("what the code does"). Nothing can hold "how MWCC shaped this" or "which source shape moved this residual". Two options, not exclusive:

- Add a `compiler_shape` (or `tactic`) fact type on targets, evidence kind `attempt`, value = the observation, rationale = `reusable_when`. Librarian promotes observations that a later run confirmed.
- Model recurring idioms as `pattern` entities (the schema supports entity facts and target→entity links; today 7 of 109 pattern entities have any fact) and give workers `kv2_entity_lookup` or a purpose-built `kv2_compiler_idiom_search` keyed by residual class. This is the "compiler idiom card" (A §6.5).

Revise the librarian prompt line "a run that failed teaches only what the ledger already holds": a failed run teaches the residual class, the tried shapes, and the unresolved diagnosis — and those are what the next worker needs.

### 5.4 Migrate V1 learnings

22,114 records; keep `corroborated` and `proposed` at symbol and file scope (about 17,800), drop `refuted` or store them as negative observations. Land them as run-independent observations attached to the target (or the new fact type), with the original evidence refs. 2,893 symbols regain the history that `ledger_search` used to return.

### 5.5 Feedback lanes on by default

- Enqueue `worker_summary` at every worker-close transition, not only at processor start.
- Run the summary and librarian lanes in production epochs (the handoff says workers should stay stopped until the worker context is overhauled — this spec is that overhaul).
- Index the new narrative rows in the same transaction or immediately after, so the next epoch's card and search include the previous epoch's runs.

### 5.6 Summarizer schema additions

Alongside the free-text narrative, add a structured block the mechanical join can carry into the card and the FTS index:

```json
"residual": {
  "class": "register_only_gpr | register_only_fpr | stack_frame | scheduling | instruction_shape | relocation_symbol | data_layout | inline_boundary | none",
  "rows": ["fcmpo cr0, f5, f0 vs fcmpo cr0, f6, f0 @ +0x17F0"],
  "mechanism": "second abs-delta compare reuses delta's register instead of the copied value",
  "resolved": false
},
"tried_shapes": [{"family": "float literal form", "variants": 3, "effect": "no change"}],
"untried_leads": ["reuse existing float temporary for the second sign compare"]
```

Source it from the typed handoff (§6) when present; let the summarizer infer it from the transcript otherwise.

---

## 6. Handoff schema (worker → runner → summarizer → next worker)

`parseWorkerCheckpointNote` accepts any JSON object today; the runner extracts only `facts` and `blockers`. Add optional typed fields, validated leniently (missing fields never reject a handoff):

| Field | Shape | Purpose |
|---|---|---|
| `residual` | `{class, rows[], mechanism, resolved}` | what is left and why, in the vocabulary of §2 |
| `tried_shapes` | `[{family, variants, effect, checkpoint?}]` | what not to repeat |
| `untried_leads` | `string[]` | what the next worker should try first |
| `best_checkpoint` | `{score, checkpoint_id}` | which state to restore |
| `evidence_locators` | `string[]` | `attempt://`, `pr://`, `code://` locators the diagnosis rests on |
| `widening_request` | existing | unchanged |

These fields are what §4.2 renders as the prior-run capsule and what §5.1 indexes.

---

## 7. Harness / tool changes the prompt depends on

| Change | Why | Where |
|---|---|---|
| Permuter per-candidate instruction deltas: for retained top-K / improving candidates, run objdiff JSON, keep `{address, diff_kind, arg_diff, formatted}`, canonicalize residual sets, cluster, return cluster counts + representatives | turns the permuter into the sensitivity probe the prompt asks for (R5); today only score + one source diff | `toolpacks/gamecube-decomp/_impl/gamecube/tools/permute.py` (score server 129–206, loop 1187–1250, report 1057–1063); wrapper `capabilities.ts:420–473` |
| `direct_compile_tu`: accept exactly one of `function`/`unit`, or fix the argparse group | 21% transport error rate | `validation/checkdiff/api/direct_compile.py:20–24` |
| Per-worktree health check for permuter source path resolution and wibo exec; fall back to qemu-i386 automatically | 9/44 pairs lost time to tooling gaps | tool bindings / sandbox setup |
| Expose FPR coloring in `mwcc_alloc_snapshot`, or document GPR-only in the tool description | prompt must not promise what the tool cannot do | `gdb_allocator_snapshot.py:131–160` |
| Relocation-aware objdiff JSON in a worker wrapper (`checkdiff_run(strict=true)` or `objdiff_score_candidate` returning `functionRelocDiffs`) | relocation class has no first-class evidence tool | checkdiff / objdiff_score wrappers |
| Update tool descriptions: `graph_related_functions` ("instruction-shape analogs"), `source_permuter_run` (probe recipe, no instruction delta), `mwcc_alloc_snapshot` (GPR only) | descriptions are what the model sees in `available_tools` | `apps/server/src/core/tools/metadata/capabilities.ts` |

---

## 8. Rollout and validation

Order of work:

1. **Week 1 (independent, cheap):** §3 prompt rewrite + tests; §4.1 first-diff block; §5.1 attempt-FTS fix; §7 tool-description updates and the `direct_compile_tu` fix.
2. **Week 1–2:** §4.2–4.3 card rework (capsules, cap, no dual card, use precomputed card); §5.2 narrative retrieval; §5.5 lanes on by default.
3. **Week 2–3:** §6 typed handoff + §5.6 summarizer schema; §5.3 tactic slot + librarian prompt; §5.4 V1 migration.
4. **Parallel:** §7 permuter deltas and relocation-aware diff.

A/B for the prompt (the only change whose effect is not obvious): split the next epoch's claims by baseline-score band; half on the new prompt + first-diff block, half on the current prompt. Compare exact rate and median time-to-exact per band, and specifically the near-miss cohort's plateau-churn rate (variants per residual before escalation, computable from `tool_events.jsonl`). One epoch (~100–180 workers) is enough signal for the churn rules; two epochs for exact rate.

Measure, before and after: exact rate; median tool calls and minutes for near-misses; permuter calls per build; share of handoffs with a populated `residual` field; share of boot cards with a prior-run capsule; `kv2_attempt_search` non-empty result rate.

---

## 9. Decisions needed

1. **Standards at boot** (§4.4): full 18.5K vs titles-only with full text on repair. Recommend titles-only, measured by lint-failure rate.
2. **Tactic knowledge model** (§5.3): new fact type on targets vs pattern entities vs both. Recommend the fact type first (one migration, immediately renderable on the card), entities second.
3. **V1 learnings** (§5.4): migrate corroborated + proposed, or corroborated only. Recommend both with status carried as confidence.
4. **First-diff cost** (§4.1): the runner already compiles for baseline; confirm `checkdiff_run` at claim time fits the claim-admission latency budget. If not, inject the previous epoch's diff from the ledger and let the worker refresh it.
5. **Prompt A/B mechanics**: whether the run-loop can hold two prompt versions per epoch today, or whether this needs a per-claim `prompt_variant` field in the packet.

---

## Appendix A — Where each claim comes from

| Claim | Source |
|---|---|
| 36/43 stalls are post-diagnosis churn; 0 diff misreads; differentiators and R1–R13 | `analysis/worker-audit-2026-09-01/rollups/phase3_rollup.md` |
| `ledger_search` 98% vs 83%; permuter 57% vs 74.5%; median calls/minutes | `analysis/worker-audit-2026-09-01/phase1_stats.md` |
| Prompt anatomy, rule coverage, staleness, pinned tests, budgets | `B-worker-prompt-audit.md` |
| Boot context block sizes (33,025 / 18,561 / 6,028 / 2,407 / 2,362) | measured on `worker_state/fbe12874…/host-cwd/.pi-sessions/**/2026-08-26T17-02-31-592Z_01a03f05….jsonl`, message 4 |
| V2 card for `grZebes_801D99E0` = 25,974 chars at `full` | rendered in-session via `loadV2TargetCard` |
| Store counts; facts by type; narratives 4,592 / 4,591 with observations; runs by outcome; audit-run coverage 1,290 of 1,488 | `sqlite3 -readonly games/melee/knowledge/knowledge.sqlite` |
| `attempt_fts`: 5,378 rows, 0 with text | `sqlite3 -readonly games/melee/knowledge/knowledge-index.sqlite` + `index/fts.ts:106–135` |
| Submissions: 14,791, hypothesis populated in 0 | same store |
| V1 learnings: 22,114; by scope/status; 2,893 symbols | `games/melee/knowledge/deprecated/ledger-v1/learnings.jsonl` |
| Card drops narrative summary; tool replacement map; feedback-lane status; design/implementation gaps | `A-knowledge-v2-audit.md` |
| Tool contracts, output shapes, failure modes, medians, residual-class evidence order, permuter internals, allocator limits | `C-tooling-reference.md` |
| `mwcc_debug_lookup` corpus is 44 KB of cache/probe files | `games/melee/shared/tool-data/mwcc_debug/` |
| Legacy graph has no tactic / mismatch-pattern tables | `games/melee/graph/graph.sqlite` `.tables` |

---

## Implementation status (2026-09-04)

Implemented in the working tree (not committed):

- §3 prompt rewrite — `prompt.ts` (Fable). Phases `orient → exact_symbol_history → name_the_mechanism → one_edit_then_diff → escalate`, new `advanced_tooling` section, stop rule, relocation rule, exact-beyond-score, typed handoff fields, opseq/graph-card language removed. Renders at ~22K chars.
- §4.1 first diff at boot — `change-validation.ts` runs `objdiff-cli diff … --format json-pretty` after the claim-time object build; rows land in `packet.first_diff` and render as `<first_diff>` after `<baseline>`, before `<target>`; artifact `pre_worker_first_diff.json`.
- §4.2/4.3 single knowledge card — legacy graph card retired; `editability` + `same_file_symbols` folded into `<target>`; no follow-up queries; runner's precomputed card used; `<target_knowledge_card_v2 unavailable="true" reason=…/>` when empty. Loader kind `target-knowledge-card-v2` registered in kernel catalog and bridge.
- §4.4 standards unchanged (full at `full` budget).
- §5.1 attempt FTS fix — indexes submission descriptions, narrative summaries, and observations; **live index not rebuilt** — run `bun run server:job -- kg2-index --fts --source attempt --rebuild`.
- §5.2 narrative retrieval — `kv2_attempt_search` (grouped, with narrative), `kv2_resolve_locator(attempt://…)` (narrative), `kv2_subject_record` (`prior_runs`).
- Card (`card.ts`) — `prior_runs` (summary, observations, `unresolved_diagnosis`), `accepted_prs`, fact `evidence`, character budget 8,000 / 4,000 / 1,500 with trim order: fact rationales → fact values → mechanical PR/event ledger rows → extra entries/links/PRs/observations → links → ledger to a floor of 3 submissions → facts → older prior runs. Identity fields are never truncated.
- §7 tool descriptions corrected; `direct_compile_tu` forwards one selector; permuter not-found is a top-level failure.

Not implemented (next): §5.3 tactic fact type + librarian stance; §5.4 V1 learnings migration; §5.5 feedback lanes on by default; §5.6 summarizer structured `residual`; §7 permuter per-candidate instruction deltas and relocation-aware diff wrapper; §8 A/B.

Tests: 658 pass across agent-catalog, cycle-runtime workers, knowledge-v2, tools, kernel bridge. Typecheck: two pre-existing `compile` option errors in `change-validation.ts` / `worker-cycle.ts` (present at HEAD) and two in `api/cycle/routes.test.ts` remain; none introduced here.

### Addendum (2026-09-04, later)

- Legacy knowledge tools (`code_graph_file_card`, `code_graph_search`, `knowledge_graph_search`, `graph_related_functions`, `past_prs_search`) removed from the worker profile; they remain registered for librarian/reconcile/QA/PR-splitter profiles. Callers, callees, and instruction-shape analogs now arrive in `<target><related_functions>` at boot, built by the runner from the legacy graph.
- V2 tools renamed to plain ids: `knowledge_record`, `attempt_search`, `pr_search`, `discord_search`, `wiki_search`, `resolve_locator` (librarian-only: `entity_lookup`, `unit_context`).
- Boot context reordered to `target → first_diff → target_knowledge → decomp_standards → available_tools`. `baseline`, `context_budget`, and `canonical_tool_paths` blocks removed (score is a `<target>` attribute; tool paths are on the sandbox PATH and stated as one prompt rule).
- `advanced_tooling` renders as twelve `<technique id name title>` blocks.
- Tests: 679 pass.
- Open for the tool audit: `<available_tools>` duplicates the tool schema and the technique blocks; see `tool-audit-table.md`.
- `<available_tools>` removed from the worker context; the 26 worker tool schema descriptions now carry what / returns and limits / when (see `tool-descriptions.md`). Prompt section renamed `advanced_techniques`. Boot context is now `target → first_diff → target_knowledge → decomp_standards`. Tests: 679 pass.
- Goal is the single line "Decompile the claimed target/symbol to a 100% match." The handoff section is now `submission`; all turn/epoch/budget language is gone from the prompt. The runner's continuation and exact-but-gates-failed messages no longer mention attempt counts or bonuses — the budget still governs internally, the worker only hears "validated and checkpointed at N%" / "rejected: reasons" + "continue toward exact". Dashboard Agents page previews a real target (`?target=unit:symbol`, default `mnVibration_HandleInput`); duplicate `target_knowledge` input removed. Tests: 771 pass; frontend typecheck passes.
