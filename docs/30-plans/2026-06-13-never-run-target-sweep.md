---
covers: Plan for one coverage pass over every unfinished Melee function target that has not had a worker agent session
concepts: [melee-run, coverage-sweep, queueing, worker-notes, unfinished-targets]
depends-on: [../20-implementation/99-appendix/50-pi-agent-run-reports.md]
---

# Never-Run Target Sweep Plan

**Date:** 2026-06-13
**Status:** Planning note only. Do not start this run from this document.

The next coverage sweep should put every unfinished Melee function target
through the worker system at least once. The goal is not primarily to maximize
matches in this pass; it is to ensure every still-open function has a durable
agent trail: worker transcript, report, facts/blockers when applicable, and a
runner-owned validation result or terminal reason.

## Current inventory

Inventory artifacts:

- `reports/open-targets-never-run-2026-06-13.md`
- `reports/open-targets-never-run-2026-06-13.csv`

The inventory used the current checkout report at
`projects/melee/checkout/build/GALE01/report.json` and cross-checked it against
the latest epoch report at
`projects/melee/state/epochs/2026-06-12T22-34-25-251Z/report.json`; the open
function target sets were identical.

Open target definition matches the orchestrator board builder:

- A report function is open when `fuzzy_match_percent < 100`.
- The queueable board target key is `(unit, symbol)`.
- The board skips missing/null fuzzy values by defaulting them to exact.

Current counts:

| Measure | Count | Percent of current open targets |
| --- | ---: | ---: |
| Current queueable open function targets | 886 | 100.00% |
| Open targets with no worker `pi_sessions` row | 485 | 54.74% |
| Open targets with no lease/event record at all | 476 | 53.72% |
| Open targets with lease/event records but no worker session | 9 | 1.02% |

There is one additional raw report oddity outside the queueable count:
`main/melee/ft/chara/ftKirby/ftkirbyspecialn ftKb_SpecialAirLw_IASA` has
`fuzzy_match_percent: null`. Before the sweep, inspect whether it is a real
unfinished function that should be normalized into the queue or ignored as a
reporting artifact.

The largest never-session clusters in the current inventory are:

| Source path | Never-session targets |
| --- | ---: |
| `src/sysdolphin/baselib/particle.c` | 37 |
| `src/melee/gm/gm_18A5.c` | 28 |
| `src/melee/mp/mplib.c` | 19 |
| `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | 19 |
| `src/melee/ty/toy.c` | 15 |
| `src/melee/gr/grbigblue.c` | 14 |
| `src/melee/cm/camera.c` | 13 |
| `src/melee/lb/lbaudio_ax.c` | 13 |

## Objective

Run one intentional coverage pass over every currently unfinished function that
has not had a worker session.

The post-run invariant should be:

- Every unfinished queueable function target in the fresh report either has at
  least one worker session in `pi_sessions`, or became exact/left the report
  before it needed coverage.
- Every terminal lease has a durable outcome: completed, needs rework, needs
  fact, stalled, provider error, or worker error.
- The carry-forward surface is richer: each still-open target should have
  agent-generated notes, facts, blockers, or at minimum a transcript explaining
  why it stalled.

## Non-goals

- Do not start this run as part of writing this plan.
- Do not treat the sweep as a PR handoff by itself.
- Do not chase data-section completion in this pass; this plan is about
  function targets from the board.
- Do not repeatedly grind the same target for exactness. This is a coverage
  pass, not a full repair campaign.

## Pre-run refresh

Regenerate the inventory immediately before the run. The June 13 CSV is a useful
planning snapshot, but the real queue should be derived from the then-current
report and then-current SQLite state.

Before queueing:

1. Ensure the checkout report is fresh enough for scheduling.
2. Recompute open queueable targets from `build/GALE01/report.json`.
3. Recompute target history from
   `projects/melee/state/orchestrator.sqlite -> pi_sessions -> leases -> queue -> targets`.
4. Filter to open targets that have no worker session.
5. Drop anything that became exact or disappeared from the report.
6. Decide what to do with the `fuzzy_match_percent: null` Kirby row if it still
   exists.

## Queueing approach

Use a direct never-run queue seed rather than the generic board refill helper.
`scripts/refill-queue-from-board.ts` is useful for broad graph-ranked refills,
but it does not specifically filter to targets with no worker session.

Preferred helper shape:

```sh
bun scripts/queue-never-run-targets.ts \
  --state-dir projects/melee/state \
  --repo-root projects/melee/checkout \
  --run-id <run-id> \
  --dry-run
```

Then apply:

```sh
bun scripts/queue-never-run-targets.ts \
  --state-dir projects/melee/state \
  --repo-root projects/melee/checkout \
  --run-id <run-id> \
  --apply
```

The helper should:

- Read `build/GALE01/report.json`.
- Use the same target extraction rules as `candidateFromReportFunction`.
- Join the SQLite state to exclude `(unit, symbol)` pairs with any worker
  `pi_sessions` row.
- Call `prioritizeQueuedTargets()` so existing non-open target rows can be
  requeued and true new targets can be inserted.
- Write a dry-run summary with counts by source path, current DB status bucket,
  and proposed priority.
- Use a reason prefix such as `never-run-sweep:` so dashboard/status views make
  the run intent obvious.

The helper can reuse the priority formula from the board builder. The initial
ordering should stay close to normal board priority, but all selected targets
should be queued for this campaign, not just the top candidate window.

## Run shape

The run should be a single pass over the seeded target set with bounded worker
time. Suggested posture:

- Keep worker thinking at the current fleet default (`xhigh`).
- Use a nominal 90-minute Pi session timeout:
  `--agent-timeout-seconds 5400`.
- Consider `--repair-attempts 0` for the coverage pass if "one worker session
  per target" is more important than giving failed post-return gates extra
  repair turns. Leave the default repair attempts if preserving likely exacts
  matters more than strict one-pass accounting.
- For clean coverage accounting, run from the pre-seeded queue as an explicit
  batch and disable automatic board refill during the pass. Otherwise the
  trigger loop can top the queue back up with ordinary board targets as soon as
  the seeded batch starts draining.
- Capture manual checkpoints before and after the batch. If mid-run epoch
  checkpoints are required, add a no-refill epoch mode first or split the
  never-run list into explicit batches.

Command sketch for the actual run, after the queue seed exists:

```sh
bun run orch --project melee \
  --agent-timeout-seconds 5400 \
  trigger-agent \
  --run-id <run-id> \
  --max-workers 32 \
  --worker-thinking-level xhigh \
  --no-epoch-cycle \
  --queue-target-size 0 \
  --candidate-limit 0 \
  --candidate-window 0 \
  --queue-refresh-interval-ms 0 \
  --queue-low-watermark 0 \
  --schedulable-low-watermark 0 \
  --no-blocked-queue-replan \
  --max-idle-iterations 3
```

If strict coverage accounting is the priority, add:

```sh
  --repair-attempts 0
```

The exact queue size should be adjusted after the pre-run refresh. If the fresh
never-run list is too large for one operational window, split it into explicit
batches at queue-seeding time rather than letting generic board refill mix in
other targets.

## Monitoring

During the run, track:

- Remaining open targets with no worker session.
- Terminal outcomes by bucket: confirmed exact, confirmed improved, no-change,
  needs rework, needs fact, stalled, provider error, worker error.
- Worker-hour spend after the 90-minute timeout setting.
- Targets still open because they were skipped by source-file locks.
- Any targets that repeatedly fail before producing a useful transcript.

The coverage metric should be separate from success rate. A stalled report is
still useful coverage if it leaves durable notes and does not silently vanish.

## Completion criteria

The sweep is complete when a regenerated inventory shows:

- `open targets with no worker pi_sessions row = 0`, except for newly introduced
  targets that appeared after the sweep started.
- The June 13 never-session target set has either a worker session, reached
  exact, or is documented as intentionally excluded.
- No active leases remain, or active leases are intentionally recovered into
  durable terminal reports.
- A post-run report captures counts, outcome mix, and the remaining open
  targets by prior outcome.

Recommended post-run artifacts:

- `reports/open-targets-never-run-<date>.md`
- `reports/open-targets-never-run-<date>.csv`
- A run-analysis refresh using the Pi agent report scripts, if the run size is
  large enough to compare against the June 12 surface report.

## Risks and decisions

**Inventory drift:** The report may change before the run. Always regenerate
the target set immediately before queueing.

**Generic refill pollution:** Trigger-agent can refill from the board. For this
campaign, use the seeded-batch command shape above or implement an explicit
no-generic-refill mode before running it under normal epoch cadence.

**Strict one-pass vs. repair turns:** `--repair-attempts 0` gives cleaner
coverage accounting. Default repair attempts may produce more exacts but can
spend multiple turns on the same target.

**Provider/tool errors:** A target with only a provider error may still lack
useful notes. Decide whether provider-error-only targets get one retry bucket
after the main pass.

**Null fuzzy row:** The Kirby null-fuzzy report entry needs a quick decision
before the run so the final "all unfinished targets covered" claim is precise.

**Data completion:** Even after every function target has a worker session, the
project will still have data and unit-completion work outside this function
coverage metric.

## Follow-up implementation note

The only code needed before executing this plan is the one-shot queue seeding
helper. Keep it dry-run by default and pure to the live run state until
`--apply` is passed. It should be small and local, modeled after
`scripts/refill-queue-from-board.ts`, but with a never-session filter and a
full selected-target summary.
