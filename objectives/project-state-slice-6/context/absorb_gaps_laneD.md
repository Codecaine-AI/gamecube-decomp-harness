# Gap Absorption Ledger — Lane D

| Fact | Destination doc | Block added or extended |
|---|---|---|
| P006 | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | Extended `b-60-score-and-pr-handoff-the-pr-splitter-shapes-t-73`: campaign outcomes enter knowledge and standards before a subsequent Run consumes them. |
| P072 | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | Extended `b-60-score-and-pr-handoff-the-pr-splitter-shapes-t-73`: per-series `target_units` identifies the primary translation units. |
| P073 | `docs/10-system-design/50-ship-and-pr/10-score-and-pr-handoff` | Extended `b-60-score-and-pr-handoff-the-pr-splitter-shapes-t-73`: cross-module edits are allowed only in service of listed `target_units`. |
| P014 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-future-concurrency`: future operation should permit concurrent Run and PR progress. |
| P015 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Extended `b-60-operator-flow-and-pr-tracking-an-explicit-mid-run-hand-7`: PR workspace and session source share no mutable state. |
| P016 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Extended `b-60-operator-flow-and-pr-tracking-an-explicit-mid-run-hand-7`: exclusivity is a worker-capacity and operational-simplicity constraint, not source truth. |
| P018 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-future-concurrency`: concurrency design must revisit the single dispatch-lease decision. |
| P030 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Extended `b-60-operator-flow-and-pr-tracking-upstream-review-usually-18`: a campaign normally concludes before the next Run batch. |
| P039 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-campaign-shape`: `PrCampaignState.save_point_id: SavePointId`. |
| P043 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-campaign-shape`: `publication_policy.batch_size` integer. |
| P045 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-campaign-shape`: `activation_ids: PrPhaseId[]`. |
| P055 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Extended `b-60-operator-flow-and-pr-tracking-state-meaning-disp-21`: `in_review` requires an upstream-open series and no activation; prepared-only waiting remains `preparing`. |
| P079 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-series-shape`: `PrSeriesState.work_items[].summary: string`. |
| P081 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-series-shape`: `last_validation.validated_at` timestamp. |
| P082 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-series-shape`: `last_validation.source_revision: SourceRevision`. |
| P083 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-series-shape`: validation `result` string, with clean required for publication. |
| P101 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Extended `b-60-operator-flow-and-pr-tracking-state-meaning-adva-52`: `closed` means withdrawn or rejected without merging and is terminal. |
| P108 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Extended `b-60-operator-flow-and-pr-tracking-resolving-work-records-t-48` and added `b-gap-pr-workitem-statuses`: a review-thread answer can resolve an item without a push. |
| P109 | `docs/10-system-design/50-ship-and-pr/20-operator-flow-and-pr-tracking` | Added `b-gap-pr-workitem-statuses`: `resolved` is terminal and cannot be reclaimed. |
| S017 | `docs/20-implementation/40-state` | Extended `b-00-overview-table-purpose-8`, `campaigns` row: `ProjectSession` owns long-lived project timeline/head lineage; campaign means PR review workflow only. |
| R075 | `docs/20-implementation/60-ui/20-harness-state-workspace/20-state-summary-and-freshness` | Added `b-ui-recovery-point-marker`: trace/history surfaces render `run.recovered` as a visually distinct recovery-point marker while preserving event order. |

## Verification

All four touched destinations rendered successfully with:

`bun packages/docs-framework/packages/docs-cli/src/index.ts render <path>`

The rendered output for every destination had zero `[a-z]\\*[a-z]` emphasis-artifact matches.

## Deviations

None. P055 follows the canonical/source requirement that `in_review` has at least one upstream-open series; prepared-only waiting remains `preparing`.
