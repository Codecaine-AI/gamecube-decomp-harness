# Decomp Run Layout

Use a run bundle under `decomp-runs/` for each file, symbol, or tightly related symbol set. A run bundle is an experiment ledger, not an objective folder and not production source.

## Standard Tree

```text
decomp-runs/<run-slug>/
+-- README.md
+-- goal.md
+-- run.md
+-- current_state.md
+-- context/
|   +-- 00_target_packet.md
|   +-- 01_constraints.md
|   +-- 02_candidate_families.md
|   +-- 03_working_plan.md
|   +-- 04_validation_and_handoff.md
|   +-- 05_post_sweep_analysis.md
+-- artifacts/
|   +-- target_packet.json
|   +-- baseline_summary.json
|   +-- target_manifest.csv
|   +-- config_matrix.csv
|   +-- sweep_results.csv
|   +-- mismatch_ledger.csv
|   +-- pareto_frontier.csv
|   +-- frontier_near_misses.csv
|   +-- validation_configs.csv
|   +-- validation_results.csv
|   +-- learned_patterns.csv
|   +-- run_summary.json
|   +-- candidate_queue.csv
|   +-- candidate_graph.csv
|   +-- source_hash_index.csv
|   +-- analysis/
|   |   +-- sweep_analysis.md
|   |   +-- next_sweep_plan.md
|   |   +-- next_config_seeds.csv
|   +-- candidate_sources/
|   +-- candidate_patches/
|   +-- candidate_objects/
|   +-- diff_json/
|   +-- diff_text/
|   +-- result_shards/
|   +-- compile_logs/
|   +-- permuter_runs/
|   +-- charts/
|       +-- accuracy_progress.svg
|       +-- pareto_frontier.svg
|       +-- mismatch_classes.svg
+-- notes/
    +-- hypotheses.md
    +-- rejected_candidates.md
    +-- cleanup_notes.md
```

## File Responsibilities

- `README.md`: human dashboard with target, latest metrics, chart embeds, and finalist summary.
- `goal.md`: concise `/goal`-ready pseudo-XML objective for autonomous continuation.
- `run.md`: concise pseudo-XML execution contract for the run.
- `current_state.md`: compact resumable status, current metrics, chart links, next actions, and risks.
- `context/*.md`: stable instructions and phase gates.
- `artifacts/*.csv/json`: machine-readable evidence.
- `artifacts/result_shards/`: per-candidate worker outputs for high-throughput parallel sweeps; reducers merge these into shared CSVs.
- `notes/*.md`: exploratory hypotheses and rejection rationale that do not belong in state.

## Required Artifact Headers

`target_manifest.csv`:

```text
symbol,source_path,unit,size,baseline_percent,status,best_percent,best_config,next_action,notes
```

`config_matrix.csv`:

```text
config_id,symbol,family,subfamily,search_pass,parent_config_id,posture,transform_list,expected_mismatch_class,reviewability_risk,allowed_to_promote,selection_reason,notes
```

`sweep_results.csv`:

```text
config_id,symbol,compiled,compile_seconds,match_percent,score_delta,instruction_count,instruction_diff_count,arg_mismatch_count,insert_count,delete_count,replace_count,reloc_diff_count,data_diff_count,neighbor_regression_count,reviewability_score,notes
```

`mismatch_ledger.csv`:

```text
config_id,symbol,mismatch_class,diff_kind,ours,target,address,notes
```

`pareto_frontier.csv`:

```text
config_id,symbol,match_percent,reviewability_score,compile_seconds,mismatch_count,neighbor_regression_count,selected_for_validation,frontier_reason
```

`learned_patterns.csv`:

```text
pattern_id,search_pass,family,observation,evidence_configs,effect,next_action,confidence,notes
```

High-throughput optional headers:

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

## Current State Contract

Keep `current_state.md` short and update it after baseline reproduction, each sweep batch, Pareto selection, permuter handoff, validation, and handoff.

Use this compact block:

```xml
<metrics_snapshot>
- Baseline: [percent]
- Best candidate: [percent]
- Candidates evaluated: [count]
- Pareto finalists: [count]
- Best config: `[config_id]`
- Analysis: `artifacts/analysis/sweep_analysis.md`
- Next sweep focus: [one-line focus]
- Latest chart: `artifacts/charts/accuracy_progress.svg`
</metrics_snapshot>
```

Embed chart links only if the chart file exists:

```md
![accuracy progress](artifacts/charts/accuracy_progress.svg)
```
