# Charts And Current State

Charts make long decomp runs resumable. Render them after each batch and link them from `README.md` and `current_state.md`.

## Required Charts

`artifacts/charts/accuracy_progress.svg`:

- x-axis: candidate order or elapsed batch order.
- y-axis: `match_percent`.
- include baseline and best-so-far trend when possible.

`artifacts/charts/pareto_frontier.svg`:

- x-axis: mismatch count or reviewability score.
- y-axis: `match_percent`.
- highlight selected validation rows.

`artifacts/charts/mismatch_classes.svg`:

- bar chart of aggregate mismatch classes, or best-candidate mismatch classes when aggregate counts are too noisy.

Render with:

```bash
python decomp-orchestrator/knowledge/tools/sweeps/render_progress_charts.py \
  decomp-runs/<run>
```

## README Dashboard

Keep the top of `README.md` scannable:

```md
# Decomp Sweep: <target>

- Source: `src/...`
- Unit: `main/...`
- Symbols: `...`
- Baseline: 98.80%
- Best: 99.60% (`config_id`)
- Candidates evaluated: 42
- Pareto finalists: 5
- Analysis: `artifacts/analysis/sweep_analysis.md`
- Next sweep focus: hold direct compare shape, vary local lifetime/padding

![accuracy progress](artifacts/charts/accuracy_progress.svg)
![pareto frontier](artifacts/charts/pareto_frontier.svg)
![mismatch classes](artifacts/charts/mismatch_classes.svg)
```

## Current State

Use pseudo-XML blocks and keep it compact:

```xml
<current_state>
<last_updated>YYYY-MM-DD</last_updated>

<status>
- [one to five bullets]
</status>

<metrics_snapshot>
- Baseline: [percent]
- Best candidate: [percent] (`[config_id]`)
- Candidates evaluated: [count]
- Pareto finalists: [count]
- Analysis: `artifacts/analysis/sweep_analysis.md`
- Next sweep focus: [one-line hypothesis family]
- Latest chart: `artifacts/charts/accuracy_progress.svg`
</metrics_snapshot>

<analysis_snapshot>
- Worked: [specific source-shape observation]
- Failed: [specific optimized-away or regressing observation]
- Next: [concrete next sweep family]
</analysis_snapshot>

<next_actions>
- [concrete command, file, or decision]
</next_actions>

<risks_or_open_questions>
- [risk and required gate]
</risks_or_open_questions>
</current_state>
```

Do not paste large logs. Link `diff_text/`, `validation_results.csv`, and `run_summary.json`.
