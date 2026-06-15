<validation_and_handoff>
    <validation_ladder>
        - Python QA rules:
          `python3 -m pytest tools/source_editing/review_lint/tests`
          must pass after scanner/fixture-related changes.
        - CLI/core targeted tests:
          run the new queue/repair command tests plus adjacent tests such as
          `apps/cli/src/cli/commands/pr-preship-review.test.ts` and
          `apps/cli/src/cli/commands/regression-check.test.ts` when touched.
        - Agent tests:
          run the new `packages/agents/src/qa-repair/*` tests and any registry
          or prompt tests touched by role registration.
        - Type/UI checks:
          `bun run check` if core/CLI/agents/dashboard/viewer types changed;
          at minimum run `bun run agent-viewer:check` when prompt previews are
          changed and `bun run ui:check` when dashboard code is changed.
        - Dry-run command:
          run the QA repair scan/report path with `--dry-run-agents` or an
          equivalent no-live-agent option and save the generated artifacts.
        - Open PR report:
          when the Melee checkout/branch is available, run the dry-run report
          over the open PR candidate set. If unavailable, replay
          `reports/qa-scan-open-pr-hardened-2026-06-13.json`.
    </validation_ladder>

    <artifact_contract>
        - `queue.json`: schema version, base/head metadata, candidate file
          list, all queue items, all findings, item statuses, attempts, and
          ignored/demoted reasons.
        - `summary.json`: command inputs, counts by severity/rule/status,
          artifact paths, validation command outcomes, dry-run/live flag, and
          final recommendation.
        - `report.md`: human-readable list of all files with errors, grouped
          findings, warnings, routing, and next action per file.
        - Per-item artifacts: rendered system/user prompts, agent raw output,
          parsed JSON, pre/post scan JSON, validation transcript, and any patch
          or diff saved by the runner.
    </artifact_contract>

    <acceptance_gates>
        - Hardened-rule fixture findings are caught by `scan_diff --gate` and
          become queue items.
        - Mocked dirty repair cannot pass post-repair validation.
        - Mocked clean lower-score repair is represented as
          `clean_lower_score` and routed by policy.
        - Agent Viewer can render `qa-repair` sample prompts without raw
          placeholders.
        - Prepare Handoff state shows QA repair before PR split and excludes
          non-clean survivors from the final plan.
        - Final report names every file with QA errors in the tested open PR
          input.
    </acceptance_gates>

    <handoff_update>
        - Update `objectives/qa-repair-lane/current_state.md` after each major
          phase with completed work, exact commands, artifact paths, current
          blockers, and next actions.
        - Final response should summarize command results and link the most
          important files/artifacts, especially the dry-run all-errors report.
    </handoff_update>
</validation_and_handoff>
