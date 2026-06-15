<working_plan>
    <overview>
        1. baseline_and_contracts - Confirm current scanner/report inputs and
           define queue, summary, report, and agent output contracts.
        2. deterministic_queue - Implement scan ingestion, candidate filtering,
           queue generation, and all-files report output.
        3. qa_repair_agent - Add the Pi role, prompt, schema, CLI runner, and
           dry-run/live artifact path.
        4. validation_and_handoff_state - Add post-repair validation, Prepare
           Handoff routing, dashboard state, and PR-plan survivor filtering.
        5. viewer_and_docs - Wire Agent Viewer preview and update docs.
        6. smoke_and_open_pr_dry_run - Prove hardened findings flag, queue,
           validate, and report on the open PR candidate set.
    </overview>

    <operating_principles>
        - Keep deterministic artifact production independent from live Pi calls.
        - Prefer one queue item per source file for MVP; include all hard
          findings in that file to avoid repeated thrash.
        - Preserve existing codebase patterns for agent registration, CLI
          artifacts, and dashboard operations.
        - Treat `clean_lower_score` as a first-class success route, not a
          failed repair.
    </operating_principles>

    <phase id="1" name="baseline_and_contracts">
        <objective>
            - Lock the data contracts and reproduce the current evidence shape
              before changing behavior.
        </objective>
        <inputs>
            - `docs/30-plans/2026-06-13-qa-repair-lane.md`
            - `reports/qa-scan-open-pr-hardened-2026-06-13.json`
            - `tools/source_editing/review_lint/tests/fixtures/hardened_rules_smoke.patch`
            - Existing `pr-preship-review`, `reconcile`, and `scan-diff`
              command/helper implementations.
        </inputs>
        <process>
            - Inspect scanner JSON shape and current `QaScanInvocation` types.
            - Define TypeScript interfaces for queue items, queue summary,
              repair attempts, final dispositions, and report rendering.
            - Decide command naming after checking CLI conventions. Prefer a
              single `qa-repair` command if it can support both scan/report and
              item processing clearly.
            - Record any naming deviations in `current_state.md`.
        </process>
        <outputs>
            - Initial schema/types in the chosen core/CLI location.
            - A short state update naming command/artifact decisions.
        </outputs>
        <gate>
            - A fresh agent can tell exactly what JSON fields are required for
              queue, summary, and per-item repair results.
        </gate>
        <failure_handling>
            - If scanner JSON is insufficient for candidate filtering, add a
              small adapter layer rather than changing `review_lint` first.
        </failure_handling>
    </phase>

    <phase id="2" name="deterministic_queue">
        <objective>
            - Generate the QA repair queue and report without calling Pi.
        </objective>
        <inputs>
            - Phase 1 contracts.
            - Latest checkpoint/proof artifacts when available.
            - `review_lint scan_diff` output, either freshly invoked or passed
              as a JSON file for tests/dry runs.
        </inputs>
        <process>
            - Implement candidate-file resolution from checkpoint/proof inputs.
            - Filter scanner findings to candidate files.
            - Group hard findings by file into queue items; keep warnings in
              item/report context without making them hard blockers unless
              policy says so.
            - Render `queue.json`, `summary.json`, and `report.md`.
            - Add tests using fixture scan JSON that verify counts, grouping,
              candidate filtering, and no silent drops.
        </process>
        <outputs>
            - Queue/report code and CLI path.
            - Tests for queue generation.
            - Example report artifact under temp/test output.
        </outputs>
        <gate>
            - The hardened fixture produces queue items with the expected rule
              ids, and a sample open-PR scan JSON can render a report listing
              all files with errors.
        </gate>
        <failure_handling>
            - If no checkpoint exists in a dry run, support an explicit
              candidate file list or "all files in scan JSON" mode, but label
              the artifact as dry-run/non-handoff.
        </failure_handling>
    </phase>

    <phase id="3" name="qa_repair_agent">
        <objective>
            - Add the Pi agent role that repairs known QA findings from queue
              context.
        </objective>
        <inputs>
            - Queue item contract from phase 2.
            - `packages/agents/src/reconcile/` for boundary-agent structure.
            - `docs/20-implementation/knowledge/20-melee-pr-review-qa-standards.md`
              for standards context.
        </inputs>
        <process>
            - Create `packages/agents/src/qa-repair/` with `index.ts`,
              `prompt.ts`, `schema.json`, and templates.
            - Register `qa-repair` in agent role types, registry, exports, and
              default tool profiles.
            - Prompt stance: fix only known QA findings, preserve match where
              possible, remove violations even if score drops, re-run/record
              validation, return JSON only.
            - Add prompt/schema tests similar to reconcile/pr-preship tests.
            - Implement CLI runner support for dry-run prompts and live Pi
              execution over one item or a bounded queue.
        </process>
        <outputs>
            - Agent role and tests.
            - CLI repair command artifacts:
              prompt files, agent output, parsed report, validation status.
        </outputs>
        <gate>
            - `--dry-run-agents` writes usable prompts for queue items, and
              invalid/missing agent JSON cannot mark an item clean.
        </gate>
        <failure_handling>
            - If live repair is too broad for MVP, complete dry-run artifact
              support plus mocked agent-output validation first, then record
              live Pi gaps in `current_state.md`.
        </failure_handling>
    </phase>

    <phase id="4" name="validation_and_handoff_state">
        <objective>
            - Make repair outcomes authoritative for PR handoff state.
        </objective>
        <inputs>
            - Queue and agent outputs.
            - Existing Prepare Handoff implementation in
              `apps/dashboard-server/src/server.ts`.
            - Existing PR split/ship-set verification behavior.
        </inputs>
        <process>
            - Implement post-repair validation: rerun QA scan for the relevant
              diff/file, run narrow score/build checks when available, and
              require ship-set verification before final PR readiness.
            - Route outcomes:
              `clean_same_match` -> match survivor,
              `clean_lower_score` -> improvement/carry-forward by policy,
              `needs_rework` -> requeue/demote with findings,
              `false_positive` -> fixture/rule follow-up,
              `blocked` -> operator-visible state.
            - Insert QA repair stage after checkpoint/proof collection and
              before split planning in Prepare Handoff.
            - Ensure final PR plan consumes only clean survivors and records
              dropped/demoted reasons.
            - Add dashboard/server state fields and minimal UI/status display
              for queued/repaired/demoted files and artifact paths.
        </process>
        <outputs>
            - Prepare Handoff integration.
            - State/report fields for QA repair stage.
            - Tests or dry-run coverage for dirty files excluded from the final
              PR plan.
        </outputs>
        <gate>
            - A handoff dry run with injected findings shows QA repair between
              checkpoint and split planning, and dirty files do not reach the
              final plan.
        </gate>
        <failure_handling>
            - If full dashboard UI is risky, first expose solid server state
              and artifact links; record UI polish as follow-up.
        </failure_handling>
    </phase>

    <phase id="5" name="viewer_and_docs">
        <objective>
            - Make the new agent visible and inspectable.
        </objective>
        <inputs>
            - QA repair prompt builder and sample queue item.
            - Agent Viewer server/client preview code.
        </inputs>
        <process>
            - Add a `qa-repair` sample preview route/context in Agent Viewer.
            - Ensure placeholder hydration matches the real prompt builder and
              no raw `{{PLACEHOLDER}}` text appears.
            - Update implementation docs with the real command names,
              artifact paths, and status fields.
            - Rebuild Agent Viewer bundle only if an existing server is serving
              `apps/agent-viewer/dist`; otherwise run check/build as
              validation without starting a server.
        </process>
        <outputs>
            - Viewer preview support.
            - Updated docs.
        </outputs>
        <gate>
            - `bun run agent-viewer:check` passes and the preview can render
              sample `qa-repair` prompts.
        </gate>
        <failure_handling>
            - If viewer build/check fails due to unrelated existing issues,
              isolate and report the exact failure before proceeding.
        </failure_handling>
    </phase>

    <phase id="6" name="smoke_and_open_pr_dry_run">
        <objective>
            - Prove the full signal path and produce the user-facing error
              report for the open PR candidate set.
        </objective>
        <inputs>
            - Hardened rules smoke fixture.
            - Open PR checkout/branch when available.
            - Queue/report/repair validation commands.
        </inputs>
        <process>
            - Add smoke tests:
              fixture -> `scan_diff --gate` findings,
              scan JSON -> queue items,
              dirty mocked repair -> rejected,
              clean lower-score mocked repair -> `clean_lower_score`.
            - Run targeted tests and type checks from
              `context/04_validation_and_handoff.md`.
            - Run a dry-run QA repair scan/report on the open PR candidate set
              or existing hardened scan JSON. Save the report under `reports/`
              or `state_dir/qa_repairs/...` and link it in `current_state.md`.
        </process>
        <outputs>
            - Passing smoke tests.
            - Open PR dry-run report listing all files with QA errors.
            - Updated `current_state.md` with commands, artifacts, and risks.
        </outputs>
        <gate>
            - The final report answers: if the hardened violations occur
              naturally in candidate files, are they caught, queued, and
              prevented from reaching the PR plan without validation?
        </gate>
        <failure_handling>
            - If the Melee checkout/open PR branch is unavailable, use the
              existing `reports/qa-scan-open-pr-hardened-2026-06-13.json` as
              the dry-run input and clearly label the run as replayed.
        </failure_handling>
    </phase>
</working_plan>
