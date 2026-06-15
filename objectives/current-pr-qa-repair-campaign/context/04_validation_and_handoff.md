<validation_and_handoff>
    <validation_ladder>
        - Objective sanity:
          `python3 .codex/skills/setup-objective/scripts/validate_goal_length.py objectives/current-pr-qa-repair-campaign/goal.md`
          must pass whenever `goal.md` changes.
        - Baseline queue:
          run `qa-repair` in dry-run mode through `--project melee` and save
          the generated `queue.json`, `summary.json`, `report.md`, and
          `ship_status.json`.
        - Supervisor dry-run:
          exercise the 32-slot scheduling/lease/output-dir shape with
          `--dry-run-agents`; no item may be leased twice and no worker may
          share an output directory.
        - Hook validation:
          run score/build/regression hooks and save stdout/stderr/summary for
          at least one item before full live dispatch.
        - Pilot live validation:
          run one or two live items end to end and prove accepted patches are
          present in the primary checkout before post-scan/hook summaries are
          accepted.
        - Per-wave validation:
          after every live wave, regenerate the queue from the primary checkout
          and update the campaign manifest.
        - Final validation:
          run final QA scan/queue, final build/regression gate, PR split plan
          with `--ship-status`, and preship review when a plan exists.
    </validation_ladder>

    <artifact_contract>
        - `campaign_manifest.json` must include:
          `schema_version`, `campaign_id`, `base_ref`, `head_sha_start`,
          `head_sha_current`, `queue_source`, `max_concurrency`,
          `supervisor_mode`, `validation_hooks_path`, `waves[]`,
          `items{}`, and `final_status`.
        - Each `items{}` entry must include:
          `item_id`, `source_path`, `initial_rule_counts`, `lease_history[]`,
          `attempts[]`, `patches[]`, `merge_status`, `validation_paths`,
          `final_route`, and `routing_reason`.
        - `campaign_events.jsonl` must be append-only JSON lines with at least:
          `timestamp`, `event`, `item_id`, `worker_id`, `status`, and
          `artifact_path` when applicable.
        - Per-item attempt directories must contain the `qa-repair` prompt and
          output artifacts plus post-scan and validation summaries.
        - Final `ship_status.json` must come from the last refreshed queue and
          must be the one used for PR split planning.
    </artifact_contract>

    <acceptance_gates>
        - The fresh final queue has no `queued` or `in_progress` items for
          shippable files.
        - Every `clean_same_match` or `clean_lower_score` item has deterministic
          post-scan evidence and non-skipped final validation evidence.
        - Every `blocked`, `needs_rework`, `false_positive`, or demoted item is
          named in the final report with item id, source path, rule ids, latest
          artifacts, and next action.
        - The final build/regression gate passes, or the final state is
          explicitly blocked with the failing summary path.
        - `pr-split-plan --ship-status <ship_status.json>` has been run or the
          exact blocker preventing it is recorded.
        - Preship review has been run for the final split plan or the exact
          blocker preventing it is recorded.
    </acceptance_gates>

    <command_shapes>
        - Refresh from live scan:
          `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" --dry-run-agents qa-repair --run-id current-pr-qa-repair-campaign --base-ref origin/master --all-scan-files`
        - Refresh from saved replay JSON:
          `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" --dry-run-agents qa-repair --run-id current-pr-qa-repair-campaign --base-ref origin/master --scan-json "$PWD/reports/qa-scan-open-pr-hardened-2026-06-13.json" --all-scan-files`
        - One item live shape:
          `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" qa-repair --run-id current-pr-qa-repair-campaign --base-ref origin/master --run-agents --item-id <item-id> --max-items 1 --score-check-command <cmd> --build-check-command <cmd> --regression-check-command <cmd> --output-dir <unique-output-dir>`
        - Final regression shape:
          `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" regression-check --run-id current-pr-qa-repair-campaign --target changes_all --require-pr-promotion`
        - Final split shape:
          `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" pr-split-plan --base-ref origin/master --ship-status <final-ship-status-json> --json --output <plan-json>`
    </command_shapes>

    <handoff_update>
        - Update `objectives/current-pr-qa-repair-campaign/current_state.md`
          after baseline, hook discovery, supervisor preflight, pilot,
          each live wave, and final validation.
        - Final response should include only the highest-signal outcome:
          campaign status, final counts, blocked files if any, important
          artifact paths, and next command/action.
    </handoff_update>
</validation_and_handoff>
