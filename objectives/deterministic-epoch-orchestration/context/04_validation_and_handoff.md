<validation_and_handoff>
    <validation_ladder>
        - `bun test <targeted scheduler tests>`: run newly added unit tests for
          epoch size parsing, admission, ready queue refill, fast-refresh
          coalescing, boundary routing, and director-removal behavior.
        - `bun run smoke`: prove orchestrator smoke flow still initializes,
          leases, records reports, handles events, refills, checkpoints, and
          exits without a director Pi session.
        - `bun run check`: full repository typecheck/UI check/Agent Viewer
          check/review-lint tests.
        - `bun run orch -- ... run-loop --dry-run-agents ...`: run a small
          deterministic scheduler smoke with an isolated state dir when a live
          project checkout is available. Capture returned scheduler summary;
          verify `trigger-agent` and `bootstrap` remain aliases.
        - `rg` audit: confirm no live imports of `packages/agents/src/director`,
          `runDirectorTick`, or director prompt templates remain outside
          explicitly allowed migration/objective docs.
    </validation_ladder>

    <artifact_contract>
        - `objectives/deterministic-epoch-orchestration/artifacts/baseline_inventory.md`:
          director reference map, baseline behavior, and tests affected.
        - `objectives/deterministic-epoch-orchestration/artifacts/validation_summary.json`:
          commands run, exit codes, timestamps, pass/fail/skipped status, and
          paths to relevant output logs when useful.
        - Scheduler runtime summaries must expose epoch id/ordinal, size mode,
          admitted count, ready queue count, completions, active leases, fast
          refresh age/count, full boundary result, and routing summary.
    </artifact_contract>

    <acceptance_gates>
        - Runtime target scheduling is deterministic and does not invoke the
          director role.
        - Epoch boundaries rebuild report truth before removing matched targets,
          computing remaining count, or treating regressions as authoritative.
        - Fast refresh has a no-overlap guarantee and does not run heavyweight
          tool runners.
        - `Full` mode handles board exhaustion cleanly and does not spin on an
          empty unmatched set.
        - Dashboard process controls remain attached to `melee-live`.
        - Docs describe the deterministic scheduler as current behavior and do
          not leak raw or stale director prompt placeholders.
    </acceptance_gates>

    <report_contract>
        - A final report is optional if `current_state.md` contains the full
          handoff. If written, `report.md` must summarize baseline, implemented
          scheduler behavior, removed director surfaces, validation results,
          residual risks, and follow-up recommendations.
    </report_contract>

    <current_state_update>
        - Before handoff, update `current_state.md` with completed work,
          active decision, commands run, important paths, risks, and next
          actions.
        - Include whether director files were deleted or retained only as
          migration history, and list every remaining `director` reference that
          is intentionally allowed.
    </current_state_update>

    <blocked_or_failed_handoff>
        - If the objective cannot complete, preserve artifacts, state the
          blocker, and define the smallest useful next step.
        - Do not mark the objective complete if deterministic scheduling works
          only by leaving a hidden director fallback in the normal runtime.
    </blocked_or_failed_handoff>
</validation_and_handoff>
