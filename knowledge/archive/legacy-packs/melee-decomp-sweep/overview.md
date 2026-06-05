---
name: "melee-decomp-sweep"
description: "Data-driven experiment design for doldecomp/melee decompilation using decomp-runs, candidate matrices, high-throughput intelligent parallel candidate queues, objdiff scoring, Pareto frontier selection, post-sweep analysis, next-sweep planning, permuter handoff, progress charts, and reproducible artifacts. Use when planning, scaffolding, running, analyzing, or reviewing broad source-shape sweeps for a Melee source file, function, translation unit, near-match set, or automation that should speed up decomp iteration without immediately editing production source."
---

# Melee Decomp Sweep

## Overview

Use this knowledge pack to turn decomp matching into a reproducible experiment loop. Keep exploratory artifacts under `decomp-runs/`, not `objectives/`, and promote only a cleaned winner back into `src/` after validation.

Default to high-throughput intelligent search for serious sweeps: generate many source-shape candidates, dedupe them, compile/diff them in parallel, reduce result shards, analyze signal, and expand the next queue from measured evidence. Use small curated batches only for planning, runner bring-up, risky TU-level edits, or user-requested narrow experiments.

This knowledge pack complements `melee-decomp`: use `melee-decomp` for symbol-level matching tactics and review standards, and use this pack for run layout, candidate matrices, high-throughput intelligent sweeps, metrics, Pareto selection, charts, and permuter handoff.

## Progress Triage

Distinguish the project progress metrics when choosing work. In this repo, "decompiled" or "matched" code means source that compiles to the original bytes; merely understanding the logic or producing equivalent C is useful but not a finished match. "Fully linked" is stricter and more lumpy: a whole object/TU may not count until all of its blocking code, data, and relocation details are complete.

Prioritize sweep time toward reviewable source that increases exact matched code or turns unknown/fuzzy functions into natural C. Do not spend unlimited effort on one pathological near-match only because it blocks a fully linked unit, unless it unlocks meaningful linked progress, protects a high-value object boundary, or reveals a reusable compiler/source-shape pattern.

## First Moves

1. Identify the run target: source file, symbol(s), unit name, current match percent, and whether the user wants planning only, a scaffold, a sweep runner, or candidate promotion.
2. Read `references/decomp-run-layout.md` before creating or modifying a run bundle.
3. For any serious run or runner change, read `references/high-throughput-sweeps.md`; it is the default execution model.
4. If creating a run bundle, prefer:

```bash
python decomp-orchestrator/knowledge/packs/melee-decomp-sweep/scripts/scaffold_decomp_run.py \
  --name itlinkbomb-motion3 \
  --source src/melee/it/items/itlinkbomb.c \
  --symbol itLinkbomb_UnkMotion3_Anim
```

5. Use the generated `decomp-runs/<run>/goal.md` as the `/goal` payload when the user wants Codex to run the sweep autonomously across turns.
6. If summarizing objdiff JSON, use `scripts/summarize_objdiff_json.py`.
7. If rendering progress charts, use `scripts/render_progress_charts.py`.

## Run Workflow

Use this phase order for serious runs:

1. **Target packet**: record `objdiff.json`, `build/GALE01/report.json`, `symbols.txt`, `splits.txt`, baseline objdiff JSON, risky neighbors, and data-section ownership.
2. **Search intelligence**: mine local run history, target diff windows, nearby source, `melee-decomp` references, and the local PR/review corpus for transform families that have worked in Melee before.
3. **Candidate queue and matrix**: create `artifacts/candidate_queue.csv` and `artifacts/config_matrix.csv` with explicit source-shape families, features, parent configs, parameters, risk posture, and selection reason.
4. **High-throughput sweep**: generate source variants, dedupe by source hash, run isolated workers in parallel, write per-candidate result shards, then reduce shards into shared CSVs. Target at least 10,000 candidates/day on a 12-core machine when candidate compile+diff latency permits it.
5. **Pareto and signal selection**: select anchors, safest improvements, frontier rows, near-misses, family representatives, repair-specific rows, and reviewable finalists. Do not select by percent alone.
6. **Post-sweep analysis and expansion**: analyze what worked, what failed, why it likely happened, and which hypothesis families should shape the next queue. Write `artifacts/analysis/sweep_analysis.md`, `artifacts/analysis/next_sweep_plan.md`, and learned-pattern rows.
7. **Permuter handoff**: seed permuter only from strong finalists and harvest outputs under `artifacts/permuter_runs/`.
8. **Charts and state**: render `accuracy_progress.svg`, `pareto_frontier.svg`, and `mismatch_classes.svg`; update `current_state.md` with the latest metric snapshot, analysis summary, next sweep focus, and chart links.
9. **Validation**: copy only a cleaned candidate into production source, then run the Melee validation ladder from narrow objdiff through object/TU/full build checks as needed.

## Reference Map

- `references/decomp-run-layout.md`: required file tree, artifact names, and state format.
- `references/high-throughput-sweeps.md`: default parallel queue/shard/reducer workflow, throughput targets, dedupe, PR/corpus-informed candidate generation, and beam expansion.
- `references/target-packet.md`: how to collect baseline metadata from Melee build artifacts.
- `references/candidate-matrix.md`: candidate families and matrix schema.
- `references/scoring-pareto.md`: metrics, reviewability scoring, Pareto and near-miss rules.
- `references/post-sweep-analysis.md`: worked/failed analysis, learned-pattern extraction, and next-sweep planning.
- `references/objdiff-permuter.md`: isolated compile/diff flow, compact diff summaries, and permuter handoff.
- `references/charts-and-state.md`: chart contract and `current_state.md` metric snapshot.
- `references/external-reference-notes.md`: useful ideas borrowed from `reference/ai-melee-decomp-main/` and what to avoid.

## Guardrails

- Keep exploratory candidates out of `src/` until a finalist is selected.
- Do not let parallel workers write shared CSVs, shared source, production `src/`, or shared `build/` outputs. Workers write only per-candidate directories and result shards; reducers merge shared artifacts after workers finish.
- Treat data, rodata, sdata, sdata2, headers, statics, includes, pragmas, and split/symbol changes as TU-level risks that require neighbor validation.
- Do not promote permuter slop, fake statics, raw offset math, unreviewable padding, or comments that only describe guesses.
- Do not confuse volume with signal. Prefer thousands of reviewable, provenance-rich source-shape experiments over random unreviewable mutations.
- Prefer real project types and accessors. Record fake-match tradeoffs explicitly when no clean option is known.
- Keep `current_state.md` compact; store evidence in artifacts and link it.
