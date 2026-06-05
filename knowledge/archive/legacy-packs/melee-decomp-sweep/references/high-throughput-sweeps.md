# High-Throughput Sweeps

This is the default mode for serious decomp sweeps. Use it for broad signal discovery: hundreds to thousands of source-shape candidates, beam search, parameterized transform matrices, and explicit throughput targets such as 10,000 candidates/day.

Use a small curated batch only when bootstrapping a runner, testing a risky TU-level change, or answering a narrow user question.

## Candidate Definition

A candidate is one deterministic source variant plus its provenance:

- base source path and parent config
- transform list and parameters
- generated source hash
- compile object path
- symbol/unit objdiff output
- result row and optional first-mismatch summary

Do not count speculative transform specs that were deduped before source generation or never compiled as evaluated candidates. Record them separately as skipped queue rows.

## Required Pipeline

Separate generation, execution, and reduction.

1. **Generate queue**
   - Expand transform families into `artifacts/candidate_queue.csv`.
   - Assign deterministic IDs from parent, transform names, parameters, and a short hash.
   - Include parent config, depth, family tags, transform list, risk, and selection reason.

2. **Dedupe before compile**
   - Generate candidate source into a per-candidate temp path.
   - Hash full generated source and record it in `artifacts/source_hash_index.csv`.
   - Skip compile when the source hash was already evaluated or queued.
   - Optionally dedupe by normalized patch hash when source paths or comments differ but code is identical.

3. **Execute in parallel**
   - Use a worker pool with `--jobs`.
   - Each worker writes only:
     - `artifacts/candidate_sources/<config_id>/`
     - `artifacts/candidate_objects/<config_id>/`
     - `artifacts/diff_json/<config_id>.*.json`
     - `artifacts/diff_text/<config_id>.*.txt`
     - `artifacts/result_shards/<config_id>.json`
     - `artifacts/compile_logs/<config_id>.log`
   - Workers must not write `config_matrix.csv`, `sweep_results.csv`, `mismatch_ledger.csv`, `pareto_frontier.csv`, charts, production source, or shared build outputs.

4. **Reduce deterministically**
   - After workers finish, sort result shards by `config_id`.
   - Merge into `config_matrix.csv`, `sweep_results.csv`, `mismatch_ledger.csv`, `candidate_graph.csv`, and hash indexes.
   - Recompute Pareto/near-miss files from the merged CSVs.

5. **Analyze and expand**
   - Group by source hash, object SHA1, first mismatch window, frame size, and transform family.
   - Rank by deltas from parent, not only absolute percent.
   - Expand the next queue from high-signal clusters and ablate interactions that improved one metric but regressed another.

## Intelligent Search Inputs

Before generating a large queue, mine evidence that should shape the operator set.

- Current run artifacts: `sweep_results.csv`, `candidate_graph.csv`, diff text, object SHA1 clusters, first mismatch windows, suppression notes, and learned patterns.
- Target context: current source, nearby matched functions, headers, `symbols.txt`, `splits.txt`, rodata/sdata ownership, m2c/Ghidra output if present, and objdiff baseline JSON.
- Local decomp evidence: `decomp-orchestrator/knowledge/packs/melee-decomp/references/evidence-index.md` and `pr-dump/created_since_2026-03-01/analysis/`.
- Review corpus files: `human_pr_text.md`, `review_comments.md`, `diff_lines.jsonl`, `changed_files.jsonl`, and `decomp_tips_library.md`.
- Live GitHub PRs/issues only when the user asks for current project review context; prefer local PR dumps for repeatable sweep generation.

Use this evidence to define transform families and priors, not to copy code blindly. High-value Melee operators commonly include declaration order, first-use order, scoped local lifetimes, branch-local temps, loop form, helper inline/extraction shape, accessor choice, type refinement, `M2C_FIELD` cleanup bridges, literal/data ordering, scoped pragmas, and careful stack-pressure diagnostics.

Reject or heavily down-rank operators that the corpus and review standards mark as cleanup debt: fake statics, unscoped pragmas, raw pointer arithmetic when types are known, inline asm, macro redefinition, hidden UB, generated comments, and permanent fake padding.

## Intelligent Search Loop

Use the run as a feedback system:

1. **Plan operators** from target mismatch classes and decomp corpus patterns.
2. **Generate broad one-transform rows** to estimate each operator's effect.
3. **Allocate the next queue** from evidence:
   - about 50-70% to exploiting positive or repair-specific clusters
   - about 20-30% to interactions and ablations
   - about 10-20% to exploration from PR/corpus patterns not yet tried
4. **Score by parent-relative signal**:
   - percent and instruction-diff delta
   - frame-size correctness
   - first mismatch movement
   - saved-register or FPR assignment movement
   - relocation/data stability
   - object SHA1 novelty
   - reviewability risk
5. **Expand, suppress, or hand off**:
   - expand transform families with repeatable positive deltas
   - suppress families that hash to known objects or preserve the bad first window
   - hand off only cleaned, reviewable finalists to production-source validation or the permuter

Keep lower-percent rows when they uniquely repair a specific blocking mismatch. They often become useful interaction parents even when their absolute score is worse.

## Throughput Target

Default to a target of at least 10,000 compiled+scored candidates/day on a 12-core, high-RAM workstation unless the user sets a smaller budget.

Use this estimate:

```text
candidates_per_day = jobs * 86400 / avg_candidate_seconds
```

Examples:

- 12 jobs at 100 seconds/candidate is about 10,368/day.
- 12 jobs at 30 seconds/candidate is about 34,560/day.
- 8 jobs at 60 seconds/candidate is about 11,520/day.

Before a long run, benchmark a representative sample at `--jobs 1`, half cores, and full intended jobs. Pick the highest stable throughput that does not cause compiler failures, corrupted outputs, memory pressure, or objdiff contention.

Recommended knobs:

```text
--jobs 12
--budget 10000
--time-budget 24h
--beam-width 50
--max-depth 3
--symbol-only
--skip-unit-diff
--dedupe-source
--dedupe-object
--result-shards
```

Run unit-level or neighbor diffs only for:

- rows above the current frame-correct lead
- distinct-object ties at the lead tier
- candidates selected for validation
- candidates that touch headers, statics, data declarations, rodata, pragmas, or split boundaries

## Queue Schema

`candidate_queue.csv`:

```text
config_id,symbol,parent_config_id,depth,family,subfamily,transform_list,params,source_hash,status,skip_reason,priority,created_from,notes
```

`candidate_graph.csv`:

```text
config_id,parent_config_id,transform_list,depth,source_hash,object_sha1,match_percent,instruction_diff_count,frame_size,first_mismatch_key,cluster_id,selected_for_expansion,notes
```

`source_hash_index.csv`:

```text
source_hash,first_config_id,duplicate_config_ids,compiled,object_sha1,notes
```

`result_shards/<config_id>.json` should contain the config row, result row, object SHA1, source hash, frame size when known, first mismatch key, neighbor summary if run, and paths to logs/diffs.

## Beam Expansion

Use beam search when the space is large.

1. Start with broad one-transform rows.
2. Select clusters by multi-metric signal:
   - positive match percent delta from parent
   - instruction diff reduction
   - frame-size correctness
   - first mismatch window moves toward target
   - lower reviewability risk
   - no neighbor/data regression
3. Expand top clusters by composing compatible transforms.
4. Add ablation rows for every strong interaction.
5. Suppress transform families that hash to known objects or repeat unchanged first mismatch windows.

Keep a small exploration allowance for lower-percent rows that uniquely repair a specific window such as frame size, saved-register assignment, call argument order, relocation shape, or an early store sequence.

For long searches, maintain per-family statistics in `learned_patterns.csv` or a run-local analysis artifact: attempts, compile failures, source-hash duplicate rate, object-hash duplicate rate, best parent-relative delta, best absolute row, reviewability failures, and next action.

## Reporting Cadence

For long runs, do not stop after every tiny batch for full narrative reporting.

- Every 250-1000 rows or 30-60 minutes: merge shards, update summary CSVs, and record a compact `current_state.md` metric snapshot.
- Every major beam iteration: update `sweep_analysis.md`, `next_sweep_plan.md`, and charts.
- At the end of a budget: run full Pareto selection, near-miss clustering, learned-pattern extraction, and validation candidate selection.

## Parallel Safety

- Treat production `src/` as read-only during exploration.
- Treat shared CSVs and charts as reducer-only outputs.
- If the compiler or wrapper writes outside the candidate object directory, use isolated worktrees, copied build sandboxes, or serialize that phase.
- Never run multiple legacy runners in parallel if they directly rewrite `config_matrix.csv` or `sweep_results.csv`.
- Keep all worker outputs recoverable; a killed run should be resumable from queue status and result shards.
