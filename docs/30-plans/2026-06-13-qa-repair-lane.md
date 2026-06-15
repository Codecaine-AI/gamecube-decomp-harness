# QA Repair Lane - Known-Finding Resolver For PR Prep (2026-06-13)

## Purpose

The hardened QA rules turn more maintainer-rejected source patterns into
machine findings. That creates a new workflow need: when a file is already a
match or useful improvement but the QA sweep finds known review-blocking
patterns, the system should repair those known findings before PR packaging
rather than sending the file straight to manual review or dropping all useful
work.

This lane is a PR-prep safety net. It is not a replacement for the worker
loop, the regression gate, or pre-ship review. Its job is narrower:

```text
QA REPAIR LANE

  proved source files
  (matches / accepted improvements)
          |
          v
  deterministic QA sweep
          |
          v
  findings grouped by file
          |
          v
  resolver-style repair agent
          |
          v
  re-proof: score + build + regression + QA
          |
          +--> clean, same match     -> ready_for_pr
          +--> clean, lower score    -> improvement/carry-forward policy
          +--> unresolved/regressed  -> needs_rework
```

## MVP Status

The MVP implements the lane as a first-class `qa-repair` command and Pi agent
role. The deterministic core builds one queue item per candidate source file
with error-severity `review_lint scan_diff` findings, writes durable queue,
summary, report, and ship-filter artifacts, and exposes those artifacts to the
dashboard handoff state.

The command writes:

```text
state_dir/qa_repairs/<run-id>/<timestamp>/
+-- queue.json
+-- summary.json
+-- report.md
+-- ship_status.json
+-- <item-id>/
    +-- qa-repair_<session>.system.md
    +-- qa-repair_<session>.user.md
    +-- qa-repair_<session>.txt
    +-- agent_result.json       when live output is parsed
    +-- post_scan.json          when live validation runs
    +-- validation.json         when live validation runs
```

`ship_status.json` feeds `pr-split-plan --ship-status`, so match slices keep
only candidate files that are clean after the QA repair lane. Queued,
unresolved, blocked, false-positive, or clean-lower-score items are demoted to
the local lane with explicit reasons until a policy deliberately routes them
elsewhere.

The live item validator reruns the diff-aware QA scan for the repaired source
file. When score, build, or regression command hooks are configured, the
runner executes them after the live repair and records their stdout, stderr,
and summary artifacts; any nonzero hook blocks clean status. Final ship-set
verification remains the PR-readiness gate for the assembled split plan.

## Current Resolver Pieces

Before this lane, the system already had three adjacent mechanisms, but none
of them was exactly this lane.

```text
CURRENT RESOLVER-LIKE SAFETY NETS

  worker attempt
        |
        v
  L1 worker QA lint / runner validation
        |
        +--> failed attempt
        |        |
        |        v
        |   same worker gets repair_request
        |   scope: fresh leased attempt only
        |
        +--> accepted attempt
                 |
                 v
            later PR prep


  hard run boundary
        |
        v
  reconcile agent
        |
        +--> ship-validate: regressions / build failures
        +--> sync-merge: conflicts / duplicate upstream work
        |
        scope: whole checkout, but regression/conflict oriented


  planned PR slice
        |
        v
  pr-preship-review
        |
        +--> finds reject/warn issues
        +--> blocks handoff on rejects
        |
        scope: non-mutating reviewer, not a patcher
```

The MVP fills the missing piece with a mutating QA resolver: a worker-like
repair lane for known findings after proof exists and before the PR split
becomes the operator's review surface.

## Target Flow

```text
TARGET FLOW

  +---------------------+
  | worker writes code  |
  +----------+----------+
             |
             v
  +---------------------+
  | worker hard check   |
  +----------+----------+
             |
       +-----+-------------------------------+
       |                                     |
       v                                     v
  +---------------------+           +----------------------+
  | pass                |           | fail                 |
  | record match /      |           | worker repair_request|
  | improvement proof   |           | loop until clean or  |
  +----------+----------+           | attempt wall         |
             |                      +----------+-----------+
             |                                 |
             |                                 v
             |                         needs_rework if still
             |                         unresolved
             v
  +-------------------------------+
  | prepare PR handoff begins     |
  +---------------+---------------+
                  |
                  v
  +-------------------------------+
  | candidate file set            |
  | matches + accepted proofs     |
  +---------------+---------------+
                  |
                  v
  +-------------------------------+
  | QA sweep every candidate file |
  +---------------+---------------+
                  |
       +----------+---------------------------+
       |                                      |
       v                                      v
  +---------------------+           +----------------------+
  | no findings         |           | findings             |
  | ready_for_pr        |           | qa_repair_queue item |
  +----------+----------+           +----------+-----------+
             |                                 |
             |                                 v
             |                      +----------------------+
             |                      | QA repair agent loop |
             |                      +----------+-----------+
             |                                 |
             |            +--------------------+--------------------+
             |            |                    |                    |
             |            v                    v                    v
             |   +----------------+   +----------------+   +----------------+
             |   | clean_same_    |   | clean_lower_   |   | unresolved or |
             |   | match          |   | score          |   | regression    |
             |   +-------+--------+   +-------+--------+   +-------+--------+
             |           |                    |                    |
             |           v                    v                    v
             |   ready_for_pr        improvement lane or    needs_rework with
             |                       carry-forward policy   concrete findings
             |
             v
  +-------------------------------+
  | split PRs from clean survivors|
  +---------------+---------------+
                  |
                  v
  +-------------------------------+
  | verify ship set               |
  +---------------+---------------+
                  |
                  v
  +-------------------------------+
  | pre-ship review               |
  +---------------+---------------+
                  |
                  v
  +-------------------------------+
  | open draft PRs                |
  +-------------------------------+
```

The important policy change is that a perfect score produced by a banned tactic
is not a valid match. Removing the violation is correct even if the function no
longer has the same exact match percentage. A clean lower-score result should
be preserved as useful work and either shipped in an explicit improvement lane
or carried forward, depending on the project's PR policy. Under the flow
described here, a clean non-regressing improvement can still be PR-bound when
the operator has chosen an improvement PR lane; otherwise it remains local
carry-forward rather than being discarded.

## Candidate Set

The QA sweep should run over PR-bound candidate files, not every file in the
checkout:

```text
CANDIDATE FILE SET

  latest checkpoint
        |
        +--> exact-match files
        |
        +--> accepted improvement files
        |    only when improvement PRs are enabled
        |
        +--> required support files
        |    headers / declarations / build support
        |
        +--> dirty worktree files
             only when they belong to the proof set

  all candidate paths
        |
        v
  diff-aware QA sweep vs base ref
        |
        v
  queue only findings introduced or moved by this candidate delta
```

The sweep should still use a diff-aware base comparison. Whole-file scans are
useful as advisory context, but the authoritative queue should be built from
findings introduced or moved by the candidate delta, with the moved-vs-invented
downgrade applied.

## QA Sweep Output

The sweep should normalize deterministic scanner output and optional
agent-review findings into one file-oriented report.

Each report records the scanner invocation, candidate inputs, and per-file
disposition:

```text
QA SWEEP REPORT

  run metadata
    base_ref
    head_sha
    scanner_command
    scanner_exit_code

  proof inputs
    checkpoint_path
    regression_report_path
    candidate_file_list

  per-file results
    src/melee/foo.c
      errors:
        m2c_residue_names x12
        assert_idiom_downgrade x1
      warnings:
        type_erasing_cast x3
      disposition: needs_qa_repair

    src/melee/bar.c
      errors: none
      warnings: none
      disposition: ready_for_pr

  aggregate results
    ready_for_pr: N files
    needs_qa_repair: N files
    warning_only: N files
```

The current hardened-rule dry run is the seed workload for this shape:
`reports/qa-scan-open-pr-hardened-2026-06-13.md` reports 54 files with errors
and 800 total errors against the open PR branch. That result should become a
queue, not just a Markdown report.

## Repair Queue Shape

A queue item should be small enough for focused repair but large enough to avoid
thrashing a file repeatedly. Default grouping should be one item per source
file, containing all hard findings in that file.

MVP item fields:

```json
{
  "schema_version": "qa_repair_queue_item_v1",
  "id": "src-melee-mn-mncount-c",
  "status": "queued",
  "source_path": "src/melee/mn/mncount.c",
  "lane": "match",
  "base_ref": "origin/master",
  "head_sha": "<sha>",
  "proofs": [
    {
      "symbol": "mnCount_802...",
      "before_status": "exact",
      "validation_artifact": "build/GALE01/..."
    }
  ],
  "findings": [
    {
      "rule_id": "m2c_residue_names",
      "severity": "error",
      "line": 123,
      "message": "m2c temporary/register residue name",
      "standard_id": "global_standard:conservative-naming",
      "excerpt": "s32 var_r30 = ..."
    }
  ],
  "validation": {
    "qa_scan": "review_lint scan_diff for this file",
    "target_check": "project-specific narrow check when available",
    "ship_set_check": "full ship-set verify before PR inclusion"
  },
  "attempts": []
}
```

Queue statuses:

```text
QUEUE ITEM LIFECYCLE

  queued
    |
    v
  in_progress
    |
    +--> clean_same_match
    |       |
    |       v
    |   ready_for_pr
    |
    +--> clean_lower_score
    |       |
    |       +--> improvement lane enabled -> ready_for_pr
    |       |
    |       +--> exact-only shipping      -> carry_forward
    |
    +--> needs_rework
    |       |
    |       v
    |   worker repair priority queue
    |
    +--> false_positive
    |       |
    |       v
    |   scanner fixture / rule refinement
    |
    +--> blocked
            |
            v
        operator/tooling intervention
```

| Status | Meaning |
| --- | --- |
| `queued` | Findings exist and no resolver attempt is active. |
| `in_progress` | A QA repair agent owns the item. |
| `clean_same_match` | Findings are gone and prior exact proof is preserved. |
| `clean_lower_score` | Findings are gone, no regression was introduced, but exact score was not preserved. |
| `needs_rework` | Findings remain, validation regressed, or the attempt budget was exhausted. |
| `false_positive` | A finding is proven not to apply and should become a rule fixture/update. |
| `blocked` | Tooling or repo state prevented meaningful repair. |

## QA Repair Agent Contract

The QA repair agent is a separate `qa-repair` role and command, not a hidden
mode of the worker loop. It has a candidate-file repair tool profile and
whole-checkout authority, but its input and definition of done are
QA-finding-oriented rather than regression-report-oriented.

Role stance:

- You are fixing known QA findings in already-proved source.
- Make the smallest source edits that remove the findings.
- Preserve the current match proof when possible.
- If preserving exactness requires a maintainer-rejected tactic, remove the
  tactic and report the lower clean score.
- Do not opportunistically refactor unrelated code.
- Re-run the QA scan and the configured validation before claiming success.
- Return structured JSON only.

Required schema output:

- item id and final status,
- findings fixed and findings remaining,
- source paths edited,
- before/after score or match proof,
- validation commands and artifact paths,
- whether the result is PR-ready, improvement-lane-ready, or needs rework,
- notes for future worker context when exactness was lost.

## Handoff Integration

The prepare handoff pipeline contains one lane between checkpoint/proof
collection and PR split planning:

```text
PREPARE HANDOFF WITH QA REPAIR

  MAIN RAIL

  01 pause intake
        |
        v
  02 pull upstream & rebase
        |
        v
  03 rebuild production baseline
        |
        v
  04 branch QA build/regression gate
        |
        v
  05 checkpoint matches / improvements / proofs
        |
        v
  06 QA sweep candidate files
        |
        v
  07 QA repair routing
        |
        v
  08 refresh proofs for clean survivors
        |
        v
  09 plan PR slices from clean survivors
        |
        v
  10 verify ship set
        |
        v
  11 run pre-ship review
        |
        v
  12 sync PR records
        |
        v
  13 save point


  QA REPAIR ROUTING DETAIL

  06 QA sweep result
        |
        +--> no findings
        |       |
        |       v
        |   clean survivor
        |
        +--> findings
                |
                v
          QA repair queue loop
                |
                +--> clean_same_match
                |       |
                |       v
                |   clean survivor
                |
                +--> clean_lower_score
                |       |
                |       +--> improvement lane enabled -> clean survivor
                |       |
                |       +--> exact-only shipping      -> carry_forward
                |
                +--> unresolved / regression
                        |
                        v
                    needs_rework

  Only clean survivors continue to step 08 and step 09.
  Carry-forward and needs_rework files are excluded from the PR plan.
```

This placement matters. If repair runs after split planning, the split plan may
include files that are about to change or be demoted. If repair runs before
checkpoint/proof collection, it has no authoritative list of PR-bound files.
The lane belongs after proof collection and before the split plan becomes the
operator-facing PR board.

## Outcomes And Routing

The resolver should make routing explicit:

- `clean_same_match`: mark the file ready for PR and keep the original match
  lane proof.
- `clean_lower_score`: mark the file clean, attach before/after proof, and
  route according to handoff policy. Improvement PR enabled means it can enter
  the improvement lane with clear disclosure; exact-only shipping means it
  becomes carry-forward evidence instead of a match PR file.
- `needs_rework`: enqueue the target at repair priority for the worker loop,
  with the exact QA findings and failed validation attached.
- `false_positive`: do not let the item silently pass. Add a scanner fixture or
  rule refinement task so the same false positive does not keep consuming
  repair time.

## MVP Implementation

```text
IMPLEMENTATION WIRING

  review_lint scan_diff JSON
             |
             v
  +---------------------+
  | queue builder       |
  | checkpoint + scan   |
  | -> queue.json       |
  +----------+----------+
             |
             v
  +---------------------+
  | qa-repair command   |
  | one item or all     |
  | bounded attempts    |
  +----------+----------+
             |
             v
  +---------------------+
  | qa-repair agent     |
  | prompt + schema     |
  | minimal edits       |
  +----------+----------+
             |
             v
  +---------------------+
  | validation harness  |
  | QA + score + build  |
  | + ship-set verify   |
  +----------+----------+
             |
             v
  +---------------------+
  | prepare integration |
  | clean survivors     |
  | feed split plan     |
  +---------------------+
```

1. **Queue builder.** `packages/core/src/qa/repair-lane.ts` ingests checkpoint
   candidates, explicit candidate lists, or all files from a saved scan replay.
   It filters findings to the candidate set, records ignored findings, groups
   errors by source file, and preserves warnings as item/report context.
2. **QA sweep report.** `qa-repair` writes `queue.json`, `summary.json`,
   `report.md`, and `ship_status.json` under
   `state_dir/qa_repairs/<run-id>/<timestamp>/`.
3. **Agent role.** `packages/agents/src/qa-repair/` owns the prompt builder,
   templates, schema, result validator, tests, registry entry, tool profile,
   and Agent Viewer preview.
4. **Repair command.** `apps/cli/src/cli/commands/qa-repair.ts` supports saved
   scan replay with `--scan-json`, checkpoint candidates with `--checkpoint`,
   explicit candidates with `--candidate-files` or `--candidate-list`, fallback
   replay with `--all-scan-files`, prompt-only runs via global
   `--dry-run-agents --run-agents`, item selection with `--item-id`, and
   bounded processing with `--max-items`.
5. **Validation harness.** Live agent output must parse as the QA repair
   schema, then the runner reruns the QA scanner for the repaired source file
   and executes configured `--score-check-command`, `--build-check-command`,
   and `--regression-check-command` hooks. Dirty, missing, invalid, blocked,
   false-positive-only, or command-failing outputs cannot become clean ship
   candidates. Score hooks may also return before/after scores or
   `score_impact` JSON to route clean lower-score repairs explicitly.
6. **Prepare integration.** Prepare Handoff runs the QA repair lane after
   checkpoint/requeue and before PR split planning. Its `ship_status.json`
   flows into `pr-split-plan --ship-status`, so only clean survivors remain in
   match slices.
7. **Dashboard surfacing.** The Ship details rail shows QA repair status,
   counts, and artifact links from the latest run summary.
8. **Policy switch.** The MVP records `clean_lower_score` explicitly and drops
   it from match shipping through `ship_status.json`; a future improvement-lane
   policy can opt into shipping those clean lower-score results.

## Smoke Tests

The smoke tests should prove the hardened rules are actually live in the system
paths where they matter:

```text
SMOKE TEST SIGNAL PATH

  hardened_rules_smoke.patch
        |
        v
  scan_diff --gate
        |
        +--> expected hard findings
        |
        v
  queue builder
        |
        +--> qa_repair_queue_item_v1 with expected rule ids
        |
        v
  mocked repair attempt
        |
        +--> still dirty -> rejected by post-repair validation
        |
        +--> clean but lower score -> clean_lower_score
        |
        v
  Prepare Handoff dry run
        |
        +--> QA repair stage appears before split planning
        +--> dirty files are absent from final PR plan
```

- A fixture diff containing each hardened rule must make `scan_diff --gate`
  produce hard findings.
- The same fixture must feed the queue builder and produce at least one
  `qa_repair_queue_item_v1` item with the expected rule ids.
- A mocked QA repair agent that claims success while the fixture still contains
  a finding must be rejected by post-repair validation.
- A mocked repair that removes the finding but lowers exactness must land as
  `clean_lower_score`, not `clean_same_match`.
- A Prepare Handoff dry run with injected findings must show the QA repair
  stage between checkpoint and split planning, and must keep dirty files out of
  the final PR plan.

Those tests answer the operational question directly: if these violations arise
naturally in a real candidate file, the sweep queues them, the repair lane sees
them, and post-repair validation prevents a false clean result from reaching
the PR plan.

## Decisions And Follow-Ups

- `qa-repair` is a brand-new agent role and CLI command. This keeps the queue
  status model and definition of done separate from `reconcile`.
- Improvement PR routing is explicit but conservative in the MVP:
  `clean_lower_score` is recorded and dropped from match shipping unless a
  later policy routes it into an improvement lane.
- The command processes one live agent pass per selected item. Operators can
  bound work with `--max-items` or focus with `--item-id`; broader retry policy
  remains a follow-up.
- Advisory warnings remain report/prompt context. Error-severity findings are
  the repair queue blockers.
