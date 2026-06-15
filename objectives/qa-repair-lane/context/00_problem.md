<problem>
    <objective_question>
        - How do we turn known QA findings in PR-bound match/improvement files
          into a repair queue that a Pi resolver can patch and validate before
          PR split/review?
    </objective_question>

    <current_baseline>
        - Worker L1 QA lint can reject a worker's own fresh attempt and feed
          findings into `repair_request`, but it does not sweep all accumulated
          PR-bound files.
        - `reconcile --mode ship-validate` can fix regression/build failures
          at handoff, but it is regression-report oriented, not QA-finding
          oriented.
        - `pr-preship-review` is an adversarial non-mutating reviewer. It can
          block handoff but does not patch findings.
        - Hardened QA rules were added to `review_lint`; the open PR dry run
          produced `reports/qa-scan-open-pr-hardened-2026-06-13.md` and
          `.json`, with many files that should become queue items.
    </current_baseline>

    <failure_modes>
        - `known_bad_match_ships`: a file keeps an exact match by retaining a
          maintainer-rejected pattern, then reaches PR review.
        - `manual_repair_sinkhole`: pre-ship review finds issues but there is
          no durable queue, ownership, or validation loop to repair them.
        - `false_clean_agent_output`: an agent claims it fixed a finding, but
          the deterministic scan still flags the file.
        - `state_blindness`: the dashboard/viewer cannot tell whether handoff
          is in normal QA, QA repair, PR split, or pre-ship review.
        - `score_over_quality`: repair refuses to remove a known violation
          because it would lower exactness, even though lower clean score is the
          correct outcome.
    </failure_modes>

    <prior_evidence>
        - `docs/30-plans/2026-06-13-qa-repair-lane.md`: accepted flow diagram
          and desired queue/agent/handoff shape.
        - `docs/30-plans/2026-06-12-qa-rule-hardening.md`: hardened rule set
          and smoke-test motivation.
        - `tools/source_editing/review_lint/tests/fixtures/hardened_rules_smoke.patch`:
          fixture that should prove new rules are wired into the queue path.
        - `reports/qa-scan-open-pr-hardened-2026-06-13.md`: open PR dry-run
          report; use as the real workload shape when available.
    </prior_evidence>

    <expected_value>
        - By PR prep time, known deterministic QA errors are either fixed,
          demoted to carry-forward/rework, or explicitly escalated before the
          operator starts manual PR review.
        - The same mechanism gives the user a readable report of all files with
          errors and a durable queue for resolver attempts.
    </expected_value>
</problem>
