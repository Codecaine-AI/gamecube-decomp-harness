# Visual Findings To Data Loop

Use this when an objective includes image review, visual case sheets, or
subagent visual reports. The purpose is to turn visual evidence into better
experiment design while keeping production logic truth-blind.

## Render The Right Cases

Render a balanced visual audit, not only wins:

- winner wins versus current baseline;
- new false merges or unsafe comparator additions;
- avoided false merges;
- candidate losses or regressions;
- no-bridge or missing-diagnostic cases;
- same-truth controls near risky cross-truth edges;
- representative cases from each shard or family when coverage matters.

Every sheet should have an index row with candidate id, shard, case id,
change type, current status, candidate status, relevant metric deltas, and
links to the numeric artifacts.

## Subagent Review Contract

For nontrivial visual audits, prefer assigning rendered sheet buckets to
subagents instead of having the main thread inspect every image. The main
thread should define the review contract, partition the sheets, preserve the
subagent reports, and synthesize their findings back into structured data.
Subagents should inspect the images and write observation-only reports.

Use the main thread directly only for a very small spot check, for validating
that sheets rendered correctly, or for resolving a specific ambiguity after
subagent review.

Subagent reports should include:

- visually safe, unsafe, ambiguous, or not recoverable;
- visible pattern: exposure bracket, clipping, same-room lookalike,
  viewpoint shift, repeated capture cycle, outdoor/walkthrough lookalike,
  aerial/ground mismatch, or strong repeated layout;
- deployable feature families that might separate the case, such as
  score/support, component density, endpoint degree, saturation/clip,
  dimension/layout, phase, agreement, or structural similarity;
- sheet paths and candidate ids.

They must not modify code, tune thresholds directly, or propose rules based on
truth labels, filenames, shard ids, or hand-picked image ids.

For a reusable prompt skeleton, see `micro_patterns.md`.

## Structured Synthesis

After subagent review, the main thread should write a structured synthesis
artifact. Prefer CSV or a compact Markdown table with:

- `case_id`
- `candidate_id`
- `change_type`
- `visual_pattern`
- `visual_safety`
- `risk_reason`
- `candidate_feature_hypothesis`
- `brake_feature_hypothesis`
- `do_not_use_fields`
- `next_sweep_family`

This lets numeric analysis join visual pattern families back to config rows,
feature columns, per-shard failures, and residual deltas.

## Deep Visual Mining

For objectives seeking large improvements, visual review should not only label
examples. It should create the next matrix. Ask the review to find:

- recurring recoverable cohorts, not isolated cases;
- visually plausible false merges that define the needed brake;
- matched safe controls for the risky pattern;
- cases that current feature columns cannot separate;
- stage clues, such as absent candidates, weak score rows, graph bridges,
  component splits, or output-only damage;
- families that should be evaluated as separate config-matrix branches.

The synthesis should map every recurring pattern to:

- candidate feature gates;
- brake feature gates;
- scope constraints;
- unsafe comparator rows;
- ablation rows;
- cohorts that must be reported separately.

If the visual report only says "these look similar" or "these look different,"
it is not deep enough for an optimization handoff. It must translate the visual
observation into deployable features and a measurable sweep plan.

## Convert To Experiments

Good visual-to-data conversion looks like this:

- Visual finding: same-room exposure endpoints are split.
- Deployable hypothesis: a narrow endpoint rescue using `same_dim`,
  `near_dim`, `agreement`, `cheap_norm`, `hist_cdf`, `edge_iou`, `phase`,
  and small-component gates.
- Required brake: repeated-stack guard using component density, support,
  endpoint degree, or cross-component structural support.
- Next experiment: paired sweep of endpoint rescue alone versus endpoint
  rescue plus the brake.

Bad conversion looks like this:

- "Merge cases like these filenames."
- "Use the reviewed visual label as a rule field."
- "Relax a threshold globally because some reviewed images looked groupable."

## Closing The Loop

Each visual audit should create one of these outcomes:

- a deployable feature sweep to test;
- a diagnostic gap to fix, such as missing bridge edges;
- a guardrail/brake family to pair with recall;
- a rejection, where the visual pattern is too ambiguous for the current
  feature surface.
- a stage-attribution finding showing the failure belongs earlier or later in
  the pipeline than expected.

When the same visual pattern appears repeatedly, treat it as a family and test
it with a config matrix. When it appears only as isolated cases, keep it as
debugging evidence, not production logic.
