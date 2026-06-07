# Micro Patterns For Fast Optimization Objectives

Use these small patterns when implementing objective-local analysis runners.
They are deliberately generic; adapt names and metrics to the local codebase.

## Sweep Runner Checklist

Before writing a loop, check:

- Is every candidate represented in a `config_matrix.csv` row?
- Can feature columns be loaded once per shard?
- Can thresholds become arrays instead of Python conditionals per config?
- Can proxy metrics be reduced as counts rather than full boolean artifacts?
- Can shards or config chunks run with bounded parallelism?
- Is full graph/grouping validation limited to selected candidates?
- Are visual review outputs structured enough to join back to numeric rows?
- Does the matrix include anchors, unsafe comparators, ablations, interactions,
  near-misses, and production-shaped finalists?
- Can results be grouped by family, search pass, cohort, and risk class?
- Is there a way to explain why a candidate won, not only that it won?

## Config Matrix Generator Shape

Generate candidate rows from named families instead of hand-writing unrelated
configs. Keep the search structure visible in the row.

```python
def add_row(rows, *, config_id, family, search_pass, posture, **params):
    rows.append({
        "config_id": config_id,
        "family": family,
        "search_pass": search_pass,
        "posture": posture,
        "interaction_key": params.pop("interaction_key", ""),
        "ablation_of": params.pop("ablation_of", ""),
        "near_miss_reason": params.pop("near_miss_reason", ""),
        "risk_class": params.pop("risk_class", "unknown"),
        **params,
    })

rows = []
for score_min in (0.66, 0.70, 0.72, 0.74):
    for agree_min in (3, 4, 5):
        for brake in ("none", "strict_density", "endpoint_degree"):
            add_row(
                rows,
                config_id=f"endpoint_s{score_min:.2f}_a{agree_min}_{brake}",
                family="endpoint_rescue",
                search_pass="coarse",
                posture="high_recall" if brake == "none" else "rescue_plus_brake",
                score_min=score_min,
                agree_min=agree_min,
                brake=brake,
                interaction_key=f"score+agree+{brake}",
            )
```

Useful fields for deep searches:

- `family`, `subfamily`, `search_pass`, `posture`;
- `interaction_key`, `ablation_of`, `near_miss_reason`;
- `risk_class`, `allowed_to_promote`, `allowed_to_demote`;
- `feature_sources`, `required_brake`, `selection_reason`;
- `cohort_scope`, such as all rows, tiny parts, no-bridge rows, or high-risk
  repeated patterns.

## Config Arrays

Convert config rows into arrays once. This prevents repeated per-row parsing in
inner loops.

```python
def cfg_array(configs, name, dtype):
    return np.asarray([getattr(cfg, name) for cfg in configs], dtype=dtype)

score_min = cfg_array(configs, "score_min", np.float32)
agree_min = cfg_array(configs, "agreement_min", np.int16)
same_dim_required = cfg_array(configs, "same_dim_required", bool)
```

## Chunked Vectorized Masks

Use `edge_rows x config_chunk` masks, not nested `for edge in edges` and
`for config in configs` loops. Chunk configs to bound memory.

```python
def keep_mask_matrix(features, configs):
    raw = features["raw_score"].astype(np.float32)
    agreement = features["agreement"].astype(np.int16)
    same_dim = features["same_dim"].astype(bool)

    keep = (
        (raw[:, None] >= cfg_array(configs, "score_min", np.float32)[None, :])
        & (agreement[:, None] >= cfg_array(configs, "agreement_min", np.int16)[None, :])
    )

    required = cfg_array(configs, "same_dim_required", bool)
    keep &= (~required[None, :]) | same_dim[:, None]
    return keep

for start in range(0, len(configs), 512):
    chunk = configs[start : start + 512]
    keep = keep_mask_matrix(features, chunk)
    promoted_counts = keep.sum(axis=0)
```

## Feature-Family Ablation Rows

Create ablations mechanically so finalists can be explained. Each ablation
should remove or alter exactly one family of evidence.

```python
from dataclasses import replace

def ablations_for(config):
    out = []
    for field in ("use_score_gate", "use_dimension_gate", "use_topology_brake"):
        if not getattr(config, field):
            continue
        clone = replace(config, config_id=f"{config.config_id}__no_{field}")
        setattr(clone, field, False)
        clone.ablation_of = config.config_id
        clone.search_pass = "ablation"
        out.append(clone)
    return out
```

Use ablation rows to answer:

- Which feature family produced the gain?
- Which brake preserved safety?
- Which condition can be removed without changing results?
- Which condition is necessary only for one shard or cohort?

## Count-Only Reductions

When only counts are needed, reduce inside the chunk and discard the mask.
Do not materialize large boolean matrices as artifacts unless they are the
actual debugging target.

```python
for start in range(0, len(configs), 512):
    chunk = configs[start : start + 512]
    keep = keep_mask_matrix(features, chunk)

    same_counts = (keep & features["same_truth"][:, None]).sum(axis=0)
    cross_counts = (keep & ~features["same_truth"][:, None]).sum(axis=0)

    for cfg, same, cross in zip(chunk, same_counts, cross_counts, strict=True):
        rows.append({
            "config_id": cfg.config_id,
            "same_truth_promoted": int(same),
            "cross_truth_promoted": int(cross),
        })
```

## Dense Feature Matrix Scoring

For formula sweeps, put feature columns in a matrix and formula weights in a
weight matrix.

```python
features = np.column_stack([
    arrays["knn_cos"],
    arrays["eq_corr"],
    arrays["grad_corr"],
    arrays["phase"],
]).astype(np.float32)

weights = np.asarray([
    [0.40, 0.24, 0.34, 0.02],
    [0.38, 0.26, 0.34, 0.02],
], dtype=np.float32).T

scores = features @ weights
```

## Bounded Parallel Map

Parallelize independent shards or validation jobs, but keep writes centralized
and deterministic.

```python
from concurrent.futures import ProcessPoolExecutor, as_completed

def bounded_map(max_workers, fn, items):
    if max_workers <= 1:
        return [fn(item) for item in items]
    out = []
    with ProcessPoolExecutor(max_workers=max_workers) as ex:
        futures = {ex.submit(fn, item): idx for idx, item in enumerate(items)}
        for fut in as_completed(futures):
            out.append((futures[fut], fut.result()))
    return [result for _, result in sorted(out)]
```

## Proxy Frontier Selection

Select candidates that explain the tradeoff boundary, not just the top score.

```python
def select_frontier(rows, limit):
    anchors = [r for r in rows if r["family"] in {"baseline", "current"}]
    zero_cross = sorted(
        (r for r in rows if int(r["cross_truth_promoted"]) == 0),
        key=lambda r: -int(r["same_truth_promoted"]),
    )
    high_recall = sorted(rows, key=lambda r: -int(r["same_truth_promoted"]))

    selected = []
    for group in (anchors, zero_cross[:limit], high_recall[:limit]):
        for row in group:
            if row["config_id"] not in {r["config_id"] for r in selected}:
                selected.append(row)
    return selected[:limit]
```

## Frontier Near-Miss Selection

Select rows that explain the tradeoff boundary. A near-miss can be more useful
than another top-ranked row.

```python
def select_near_misses(rows, baseline_cross=0, limit=20):
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            int(r["cross_truth_promoted"]) > baseline_cross,
            abs(int(r["cross_truth_promoted"]) - baseline_cross),
            -int(r["same_truth_promoted"]),
        ),
    )
    out = []
    seen_keys = set()
    for row in sorted_rows:
        key = (row["family"], row.get("risk_class", ""), row.get("brake", ""))
        if key in seen_keys:
            continue
        row = dict(row)
        row["near_miss_reason"] = "closest_to_safety_boundary"
        out.append(row)
        seen_keys.add(key)
        if len(out) >= limit:
            break
    return out
```

Near-miss artifacts should include the exact metric that blocked promotion and
the smallest threshold or gate change that crossed that boundary.

## Brake Efficiency Metrics

For rescue-plus-brake matrices, report how much recall the brake preserves per
unit of risk removed.

```python
def add_brake_efficiency(row, rescue_anchor):
    unsafe_removed = int(rescue_anchor["cross_truth_promoted"]) - int(row["cross_truth_promoted"])
    same_lost = int(rescue_anchor["same_truth_promoted"]) - int(row["same_truth_promoted"])
    row["unsafe_removed_by_brake"] = unsafe_removed
    row["same_truth_lost_by_brake"] = same_lost
    row["brake_efficiency"] = unsafe_removed / max(1, same_lost)
    row["recall_preserved_rate"] = int(row["same_truth_promoted"]) / max(1, int(rescue_anchor["same_truth_promoted"]))
```

This makes it obvious whether a brake separates risk or simply shuts down the
rescue.

## Cohort Summary Rows

Aggregate every serious candidate by cohort. Use whatever cohorts matter for
the objective: shard, group-size bucket, residual pattern, component size,
edge role, score band, or visual family.

```python
def cohort_counts(keep, features, cohort_name):
    rows = []
    for value in sorted(set(features[cohort_name])):
        mask = features[cohort_name] == value
        rows.append({
            "cohort": cohort_name,
            "cohort_value": str(value),
            "promoted": int(keep[mask].sum()),
            "same_truth": int((keep[mask] & features["same_truth"][mask]).sum()),
            "cross_truth": int((keep[mask] & ~features["same_truth"][mask]).sum()),
        })
    return rows
```

The final report should call out any candidate that wins aggregate score but
loses a shard, cohort, or known risk bucket.

## Visual Review Prompt Skeleton

Use this shape for subagent visual review prompts.

```text
Review only the rendered sheets assigned to you.
Do not modify files.
Do not propose rules based on truth labels, filenames, shard ids, or
hand-picked image ids.

For each sheet, report:
- sheet path and candidate id;
- safe, unsafe, ambiguous, or not recoverable;
- visible reason: exposure bracket, clipping, viewpoint shift, same-room
  lookalike, repeated capture cycle, outdoor/walkthrough lookalike,
  aerial/ground mismatch, or strong repeated layout;
- deployable feature families that might separate it: score/support,
  component density, endpoint degree, saturation/clip, dimension/layout,
  phase, agreement, or structural similarity.

End with a compact synthesis of production-promising patterns, required
brakes, and patterns that current features likely cannot separate safely.
```

## Structured Visual Synthesis Row

Prefer one row per reviewed case or sheet so numeric analysis can join visual
findings back to sweep outputs.

```python
visual_row = {
    "case_id": case_id,
    "candidate_id": candidate_id,
    "change_type": "winner_win",
    "sheet_path": str(sheet_path),
    "visual_safety": "safe",
    "visual_pattern": "exposure_bracket",
    "risk_reason": "",
    "candidate_feature_hypothesis": "same_dim;agreement;hist_cdf;phase;small_part",
    "brake_feature_hypothesis": "component_density;endpoint_degree",
    "do_not_use_fields": "truth_id;filename;shard_id;visual_label",
    "next_sweep_family": "endpoint_rescue_plus_repeated_stack_brake",
}
```

## Anti-Patterns

- Python nested loops over every edge and every config.
- Recomputing feature arrays inside every config loop.
- Copying full masks or score matrices to artifacts when only counts matter.
- Selecting winners by aggregate score without shard false-merge checks.
- Treating visual labels as production features.
- Running full grouping validation for every proxy config.
