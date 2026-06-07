# Experiment Composition

Use this when deciding how to lay out tests for a new optimization objective.
The best experiments create enough structured data to compare families,
understand tradeoffs, and reproduce the exact candidate later.

## Search Depth Target

Prefer a structured search over a small collection of hand-picked probes. The
objective should make it difficult to fool yourself with one lucky row. Before
implementation, write down:

- the main hypothesis families;
- the feature columns each family is allowed to use;
- the thresholds or weights that will be swept;
- the guardrails and brakes paired with high-recall candidates;
- the cohort breakdowns that could reveal hidden failures;
- the proxy metrics that are cheap enough to compute for every row;
- the full-validation gate for selected rows.

As a rule of thumb, a serious optimization objective should contain at least
one broad matrix and one narrowing pass:

- broad pass: hundreds or thousands of generated configs, cheap proxy metrics,
  and family-level ranking;
- narrowing pass: Pareto frontier, anchors, near-misses, ablations, and
  production-shaped variants;
- validation pass: full downstream validation only for the rows that explain
  the frontier.

Small objectives can intentionally be narrower, but the working plan should say
why a shallow search is enough.

## Baseline First

- Reproduce the current baseline from saved artifacts or a known command.
- Record score, exact, total, false merges, false splits, mixed cases,
  accepted/promoted edges, components, and per-shard deltas.
- Store the baseline artifact paths so every later row can be traced.
- Include one or more unsafe/high-recall anchors when useful. A failed anchor
  often explains the next useful brake better than the baseline alone.

## Config Matrix

Every candidate should be a row in a matrix-like manifest. Include:

- stable `config_id` and `family`;
- candidate description and deployable feature list;
- all thresholds and boolean gates;
- rule posture: baseline, anchor, production-shape, strong-research, high
  recall, rejected probe;
- selection reason and priority;
- whether the config is allowed to promote edges, demote edges, or only audit.
- expected risk class and required brake family, if any;
- feature provenance, such as raw edge feature, component summary, graph
  topology, visual-derived hypothesis, or audit-only truth measurement;
- whether the row is an ablation, interaction row, frontier candidate,
  near-miss, unsafe comparator, or production-shaped candidate.

Avoid hidden experiment state. If a runner needs a threshold, feature, or
special gate, put it in the config matrix or a clearly linked manifest.

Design the matrix so it can answer interaction questions, not only single-knob
questions. Useful dimensions include:

- family: endpoint rescue, low-agreement rescue, candidate backfill, cleanup
  brake, split rule, geometry support, or other domain-specific family;
- signal group: score, agreement, dimension/layout, saturation/clip, topology,
  component size, support density, metadata, or retrieval rank;
- threshold bands: conservative, Pareto knee, high-recall, and unsafe anchor;
- guard posture: no brake, strict brake, loose brake, and diagnostic-only
  truth upper bound when allowed for measurement;
- scope: singleton/tiny parts, medium groups, large groups, no-bridge cases,
  high-risk repeated patterns, or broad all-row application.

## Proxy Then Validate

Use proxy sweeps to screen thousands of candidates cheaply. Use full validation
to make decisions.

Good proxy rows include:

- same-truth promoted or retained count;
- cross-truth promoted or retained count;
- cross-truth rate;
- expected exact-gain proxy;
- per-shard risk summaries;
- candidate family and selection gate.
- cohort metrics such as group-size bucket, residual pattern, component size,
  edge role, or risk bucket when those are cheap enough to compute.

Full validation must include:

- aggregate metrics;
- per-shard metrics;
- by-ladder metrics when ladders exist;
- deltas against baseline and important anchors;
- residual examples for wins and regressions;
- false-merge audit rows for recall-oriented candidates.
- equivalence checks if the candidate later moves into production code.

Proxy evidence is allowed to be approximate, but it must be directionally
useful. If a proxy cannot explain why a candidate won or failed, add diagnostic
columns before running a bigger matrix.

## Candidate Selection

Do not select by score alone. Select:

- current baseline and production anchors;
- safest zero-risk candidate;
- strongest high-recall anchor;
- Pareto frontier rows;
- near-misses that explain a tradeoff boundary;
- ablations that isolate one suspected feature or brake.
- counterfactual rows that remove a promising feature, remove a brake, or move
  one threshold across the observed boundary;
- at least one row from every family that looks promising by proxy, even if it
  is not the aggregate winner;
- the smallest production-shaped row that captures most of the gain.

For production candidates, require no aggregate false-merge increase, no
shard-level false-merge spike, and no unexplained retained unsafe edge cluster.
For research candidates, state the allowed false-merge budget and the exact
brake hypothesis needed next.

For deep searches, write a `frontier_near_misses.csv` or equivalent artifact.
Near-misses are useful when they show:

- a tiny threshold change that crosses the safety boundary;
- a high-recall row whose risk is concentrated in one cohort;
- a brake that removes risk but destroys too much recall;
- a row that wins overall but fails one shard or bucket;
- a simpler row that ties a complex row and should be preferred.

## Deep-Win Diagnostics

The objective should try to discover why a candidate works, not only whether it
works. Add diagnostics that can expose these deeper wins:

- family-level lift: which feature family produced the gain;
- interaction lift: which pair or triplet of gates made the difference;
- brake efficiency: unsafe edges removed per same-truth edge lost;
- cohort lift: which residual or group-size bucket improved;
- risk localization: whether false merges are diffuse or concentrated;
- stage attribution: whether the bottleneck is candidate generation, scoring,
  graph cleanup, split/merge logic, or output repair;
- ceiling estimate: how much more gain remains in the same family.

When a candidate is strong but unsafe, do not only reject it. Extract the
unsafe rows, compare them to matched safe controls, and turn the separator into
a follow-up brake matrix.

## Performance Layout

- Vectorize feature scoring and threshold checks.
- Chunk config matrices so temporary `rows x configs` arrays stay bounded.
- Parallelize shard-local or config-local work with bounded workers.
- Prefer count-only reductions when the full boolean matrix is not needed.
- Keep expensive graph/grouping validation for finalists, not every proxy row.
- Before accepting a runner, scan for naive nested loops over rows and configs.
  Replace them with config arrays, chunked masks, matrix products, or grouped
  reductions. See `micro_patterns.md` for small implementation shapes.
- For large local analysis, consult `../debugging_analysis_acceleration.md`.

## Handoff Quality

At the end of each run, a future agent should be able to answer:

- What baseline was used?
- How many configs were tested?
- Which rows were selected for validation and why?
- Which candidate won, lost, or was rejected?
- Which visual patterns explain the result?
- Which deployable features should be tried next?
- Which artifacts reproduce the decision?
- What did the matrix prove was not worth pursuing?
- Which near-miss defines the next search boundary?
- Which production-shaped row should be implemented first if promotion is
  authorized?
