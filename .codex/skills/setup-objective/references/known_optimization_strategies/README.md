# Known Optimization Strategies

Use this reference when an objective needs testing design, parameter sweeps,
diagnostic audits, visual review, or measurable optimization. The goal is to
lay out experiments so they produce broad, comparable data instead of isolated
one-off results.

## Depth Standard

For optimization objectives, do not stop at surface-level threshold tuning.
Design the objective so it can find deep wins: interactions between feature
families, stage boundaries, graph topology, residual cohorts, and safety
brakes. A good objective should leave behind enough structure that a future
agent can see both the winning candidate and the search space that made it
credible.

Default to a deep-search plan when any of these are true:

- prior simple sweeps have plateaued;
- the target metric is a tradeoff, such as recall gain versus false-merge risk;
- visual residuals show recurring families rather than isolated bugs;
- candidate behavior depends on multiple pipeline stages;
- the best known candidate is strong but unsafe;
- proxy evidence is cheap enough to evaluate hundreds or thousands of rows.

A deep-search objective should include at least three of these layers:

- feature-family ablations that isolate which signal class matters;
- interaction sweeps that combine promising gates, thresholds, and brakes;
- counterfactual or near-miss rows that explain why candidates fail;
- per-cohort analysis over shards, size buckets, residual families, or risk
  classes;
- visual audit sheets for wins, regressions, and unsafe comparators;
- Pareto-frontier selection with anchors and near-misses;
- production-shape validation of the small finalist set.

The working plan should name the expected search depth up front: approximate
config count, candidate families, proxy metrics, finalist count, validation
coverage, and artifacts. If the plan only lists "try a few thresholds" without
families, ablations, risk probes, or validation gates, it is probably too
shallow for a serious optimization objective.

## Default Optimization Loop

1. Reproduce the current baseline and write its metrics before changing
   anything.
2. Define a deployable feature matrix and a `config_matrix.csv` that records
   every candidate, threshold, feature column, family, and selection reason.
3. Run a cheap proxy sweep with vectorized or matrix operations. Keep per-shard
   rows and aggregate rows.
4. Rank candidates by Pareto tradeoff, not aggregate score alone. Include
   recall gain, false-merge risk, per-shard spikes, and retained unsafe edges.
5. Full-validate only selected anchors, Pareto rows, and near-misses across the
   required shards.
6. Emit residual examples, false-merge audits, and win/regression samples for
   the selected candidates.
7. Render visual sheets for wins, regressions, unsafe comparators, and missing
   diagnostic cases.
8. Use observation-only subagents to review visual sheets. They may describe
   patterns and deployable feature hypotheses, but they must not tune directly
   from truth labels, filenames, shard ids, or hand-picked images.
9. Convert visual findings into new deployable feature hypotheses, then run
   the next matrix sweep.
10. Promote only after full validation and a minimal production patch that
    excludes exploratory sweep machinery.

For hard objectives, iterate the loop inside the same objective when the first
matrix produces a strong but unsafe frontier. Typical second loops are:

- recall rescue plus a false-merge brake;
- broad proxy matrix plus narrow refinement around the Pareto knee;
- visual residual taxonomy plus a feature-specific follow-up matrix;
- production-candidate validation plus a mask-equivalence audit.

## Standard Artifact Layout

Prefer these names when they fit the objective:

- `artifacts/baseline_summary.json`
- `artifacts/config_matrix.csv`
- `artifacts/proxy_per_shard.csv`
- `artifacts/proxy_sweep_results.csv` or `artifacts/sweep_results.csv`
- `artifacts/pareto_frontier.csv`
- `artifacts/validation_configs.csv`
- `artifacts/validation_per_shard.csv`
- `artifacts/validation_results.csv`
- `artifacts/residual_delta_examples.csv`
- `artifacts/fm_edge_audit.csv`
- `artifacts/visual_audit/`
- `artifacts/visual_audit_index.csv`
- `artifacts/subagent_visual_notes.md`
- `artifacts/run_summary.json`

For deep searches, add richer handoff artifacts when relevant:

- `artifacts/config_family_summary.csv`
- `artifacts/ablation_results.csv`
- `artifacts/frontier_near_misses.csv`
- `artifacts/risk_bucket_summary.csv`
- `artifacts/counterfactual_edge_audit.csv`
- `artifacts/win_regression_examples.csv`
- `artifacts/production_mask_verification.csv`

## Strategy References

- `experiment_composition.md`: how to structure sweeps, validation, metrics,
  and artifact handoff.
- `visual_to_data_loop.md`: how to turn visual/subagent findings into
  deployable data-analysis hypotheses without leaking hand labels into rules.
- `high_value_patterns.md`: specific optimization patterns that have produced
  useful signal in prior objectives.
- `micro_patterns.md`: small code and artifact patterns for fast sweeps,
  bounded parallelism, visual-review prompts, and structured synthesis.

## Core Rule

Visual review is for hypothesis generation and risk diagnosis. Production rule
inputs must remain deployable and truth-blind. Truth labels, filenames,
hand-reviewed visual labels, and shard identity are allowed for measurement,
ranking, examples, and reporting only.
