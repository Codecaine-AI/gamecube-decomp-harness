# High-Value Optimization Patterns

These are reusable strategies that have produced useful signal in prior
optimization objectives.

## Matrix Sweep Plus Pareto Validation

Best for: thousands of threshold or feature-combination candidates.

Pattern:

- build `config_matrix.csv`;
- compute feature arrays once per shard;
- evaluate candidates in chunks with vectorized masks or matrix operations;
- reduce to same-truth, cross-truth, retained, promoted, and risk counts;
- select Pareto rows and anchors;
- full-validate selected candidates only.

Why it is valuable: it turns a broad search into a small validation set without
losing the tradeoff boundary.

Implementation cue: start from config arrays and chunked masks. If the runner
contains Python loops over every row and every config, the experiment is likely
too slow or too hard to scale.

## Coarse-To-Fine Interaction Search

Best for: finding deep wins when many weak signals only become useful in
combination.

Pattern:

- start with a coarse matrix over feature families, broad threshold bands, and
  strict/loose guard postures;
- rank families by proxy gain, risk, and shard stability;
- build a narrower interaction matrix around the best families;
- add one-factor ablations for every promising interaction;
- add near-miss rows just across the safety boundary;
- validate the simplest row that keeps most of the gain.

Why it is valuable: many useful rules are not visible in one-dimensional
threshold sweeps. The first pass finds the region; the second pass explains
which interaction actually matters.

Implementation cue: use config fields such as `search_pass`, `family`,
`interaction_key`, `ablation_of`, and `near_miss_reason` so the final report
can group results by search stage.

## Unsafe Anchor To Brake Mining

Best for: a high-recall candidate with a large score gain and unacceptable
false-merge or regression cost.

Pattern:

- keep the unsafe high-recall candidate as an explicit anchor;
- extract its added unsafe rows or failed cohorts;
- profile those rows against matched safe controls;
- build deployable brake families from the separating feature ranges;
- sweep rescue alone, brake alone, and rescue-plus-brake;
- report brake efficiency and retained recall.

Why it is valuable: rejecting the unsafe anchor loses information. The failed
candidate often points directly at the missing guardrail.

Guardrail: truth labels, reviewed visual labels, filenames, and shard ids may
identify measurement rows, but production brake inputs must stay deployable and
truth-blind.

## Stage-Attribution Matrix

Best for: pipelines where a metric failure may belong to candidate generation,
scoring, graph grouping, cleanup, split/merge repair, or output formatting.

Pattern:

- reproduce the same residual set under each relevant stage variant;
- emit candidate-present, edge-present, accepted-edge, successful-union,
  component, split, and final-output diagnostics;
- create config rows that change only one stage or one stage boundary at a
  time;
- classify residuals by first missing stage;
- route follow-up matrices to the earliest stage that can actually affect the
  failure.

Why it is valuable: it prevents wasting threshold sweeps on cases that are
invisible to that stage.

Implementation cue: use columns such as `candidate_exists`, `edge_exists`,
`accepted_by_score`, `successful_union`, `component_bridge_present`,
`split_changed`, and `first_missing_stage`.

## Cohort-First Residual Mining

Best for: broad residual sets where aggregate score hides multiple unrelated
failure modes.

Pattern:

- bucket residuals by size, shard, visual family, edge role, component size,
  score band, topology role, and available feature surface;
- estimate maximum recoverable value per bucket;
- build separate matrix families for the largest recoverable buckets;
- keep unsafe lookalike buckets as explicit risk cohorts;
- report gains and regressions by cohort, not only aggregate.

Why it is valuable: deep improvements usually come from a recurring cohort,
not from a global threshold move.

## Truth-Upper-Bound Then Blind Separator

Best for: diagnosing whether a failure family is separable before spending
time on production rules.

Pattern:

- create a diagnostic upper bound using truth labels or hand labels only in the
  objective-local analysis;
- measure whether the upper bound would materially improve the metric;
- profile the upper-bound changed rows with deployable feature columns;
- sweep blind approximations that use only deployable features;
- reject the family if the blind approximation cannot preserve enough gain or
  safety.

Why it is valuable: it separates "there is no useful signal here" from "the
signal exists but the current feature surface cannot express it."

Guardrail: the upper-bound row is measurement-only. It must never be promoted
or copied into production logic.

## Counterfactual Candidate Audit

Best for: explaining why two close candidates differ or why a complex rule is
worth its complexity.

Pattern:

- for each finalist, create counterfactual rows that remove one feature family,
  loosen one brake, tighten one rescue gate, or drop one stage condition;
- compare changed edge/group/residual rows against the finalist;
- report the smallest counterfactual that breaks safety and the simplest
  counterfactual that preserves performance;
- prefer the simpler equivalent row when a counterfactual ties the finalist.

Why it is valuable: it keeps objective reports from promoting accidental
complexity.

## Visual Taxonomy To Feature Hypotheses

Best for: residuals where the metric says something is wrong but not why.

Pattern:

- render persistent residuals and sampled wins/regressions;
- split review across observation-only subagents;
- synthesize recurring visual patterns;
- map each pattern to deployable features and candidate sweep families.

Why it is valuable: it prevents blind threshold twiddling and reveals whether
the next experiment belongs in candidate generation, scoring, cleanup, or
diagnostics.

## Recall Rescue Paired With False-Merge Brakes

Best for: candidates with large false-split recovery and unacceptable
false-merge growth.

Pattern:

- keep a high-recall anchor for comparison;
- add brake families that target retained cross-truth or false-merge edges;
- validate rescue alone and rescue-plus-brake;
- inspect false-merge added sheets and avoided false-merge sheets.

Why it is valuable: recall and precision signals often share features. The
paired design shows whether a brake actually separates the risk or merely
collapses recall.

## Targeted Near-Miss Audit

Best for: a strong research candidate that narrowly fails production gates.

Pattern:

- extract the retained unsafe or cross-truth edges;
- render those edges and matched same-truth controls;
- profile their deployable feature values;
- build a small hypothesis grid around the observed separator;
- validate all candidates against the same baseline.

Why it is valuable: it focuses search on the boundary that blocked promotion,
not on the whole parameter space.

## No-Bridge Diagnostic Backfill

Best for: residual splits with no selected bridge metric or absent candidate
edges.

Pattern:

- separate "no candidate exists" from "candidate exists but was pruned";
- emit top rejected inter-component edges or component-pair summaries;
- measure fanout and cross-truth rate before materializing candidates;
- render visual sheets for recovered and unrecovered cases;
- only then try a narrow candidate-generation or small-tail validation pass.

Why it is valuable: it avoids wasting Phase 03 threshold work on cases that are
invisible to Phase 03.

## Small-Tail Or Component-Aware Absorption

Best for: singleton or two-frame residual parts attached to a strong core.

Pattern:

- limit scope to small parts or terminal components;
- require strong layout, dimension, phase, support, or structural agreement;
- prevent chaining across ambiguous frames;
- validate against broad candidate expansion as an unsafe comparator.

Why it is valuable: many real recoveries are local tails, while broad neighbor
expansion creates too much cross-truth fanout.

## Production Mask Verification

Best for: after a validated candidate is promoted into production code.

Pattern:

- compare production mask counts against objective validation artifacts;
- verify promoted/retained edge counts, same-truth/cross-truth audit counts,
  and per-shard metrics;
- keep exploratory matrices and debug-only fields out of production source.

Why it is valuable: it catches mismatches between the research runner and the
actual production path before accepting the patch.
