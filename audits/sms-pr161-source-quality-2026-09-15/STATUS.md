# Audit Status

1. Complete: read every changed hunk across all 79 files.
2. Complete: verified strong candidates against source types, retained patches, worker records, and recorded scores. Confirmed allocation-size defects using saved target/candidate instructions.
3. Complete: REPORT.md, findings.json, coverage.json, and per-finding evidence. 19 findings across 16 files: 7 partial-function, 8 section-target, and 4 exact-function findings.

PR head: f37da262e537d5cc4e8a2e15ae311370a0d67039

Remote head rechecked and unchanged. Scores are historical checkpoint results, not a fresh combined PR-head build. No game-source, runtime, worker, or PR edits were made. Lint proposals are included; no lint implementation was performed.

Read [REPORT.md](REPORT.md), starting with F01, F02, F07, and F15.

Occurrence-count pass complete: all 19 findings now have explicit counting units and source locations in [COUNTS.md](COUNTS.md) and counts.json. The report and findings.json include the counts. F02 has 54 confirmed wrong-size allocation sites across 45 new local classes, with 53 undersized and one oversized allocation. Counts refer to the pinned audit snapshot and saved runner evidence, not runtime frequency.

Added the proposed data-section policy to REPORT.md and its generator: pause standalone section-target workers, allow evidence-backed data repairs during function reconstruction without a 100% prerequisite, and require source-quality checks independently of score. This records a recommendation only; no harness behavior was changed.
