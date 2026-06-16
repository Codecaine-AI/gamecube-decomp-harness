<implementation_scope>
    <owned_surfaces>
        - `apps/cli/src/cli/commands/trigger-agent.ts`: replace director wake
          scheduling with deterministic epoch scheduler behavior, add fast
          refresh triggers, and expose epoch summaries.
        - `apps/cli/src/cli/commands/tick.ts`: remove, repurpose, or replace
          director tick behavior with deterministic scheduler inspection if a
          compatibility command remains.
        - `apps/cli/src/cli/commands/kg.ts`: add or narrow fast run-evidence
          refresh support if `kg-maintain --no-tool-runners` is too broad.
        - `apps/cli/src/cli/args.ts`, `usage.ts`, `defaults.ts`, and command
          exports: add epoch size, ready queue size, fast-refresh, and boundary
          maintenance flags/config wiring.
        - `packages/core/src/state/`: add epoch/admission/refresh state helpers
          and migrations if save-point payloads are insufficient.
        - `packages/core/src/epoch/`: keep full boundary truth rebuilds and add
          explicit routing hooks if current cycle result is not enough.
        - `packages/core/src/board/` and `packages/knowledge/src/board.ts`:
          reuse graph-ranked candidates; adjust only if epoch admission needs a
          fixed-pool or full-board scan helper.
        - `packages/agents/src/director/`, agent registry/types, and exports:
          remove the director role once deterministic scheduling owns target
          packets.
        - `apps/dashboard-server/src/server.ts`, `apps/dashboard/src/`, and
          `packages/ui-contract/src/`: expose controls and read-only status for
          epoch size, progress, fast refresh age, and boundary state.
        - `apps/agent-viewer/src/`: remove or update director prompt previews
          when director prompt templates disappear.
        - `tests/smoke.ts` and focused unit tests: cover deterministic scheduler
          admission/refill/refresh/boundary behavior and director removal.
        - `docs/`, `EVIDENCE_REFRESH_CADENCE.md`, and
          `EPOCH_ORCHESTRATION_UPDATE.md`: promote the deterministic model into
          current docs.
    </owned_surfaces>

    <read_only_references>
        - `objectives/qa-repair-lane/`: reference as an example of a complete
          objective bundle, not as an implementation target.
        - `reports/pi-agent-tool-analysis-2026-06-11.html`: use only for
          background on worker/tool behavior if scheduling policy questions
          need empirical context.
        - `projects/melee/checkout/`: do not edit Melee source as part of
          scheduler implementation.
    </read_only_references>

    <generated_outputs>
        - `objectives/deterministic-epoch-orchestration/artifacts/`: optional
          destination for baseline summaries, dry-run scheduler traces, or
          validation result JSON produced during implementation.
        - `apps/agent-viewer/dist/`: rebuild only if an existing viewer server is
          serving the dist bundle and prompt preview behavior changed.
        - `apps/dashboard/dist/`: build artifacts may change during validation;
          do not start a new server for them.
    </generated_outputs>

    <commands_and_entrypoints>
        - `bun run orch -- run-loop ...`: primary runtime path to update and
          smoke in dry-run mode. Preserve `trigger-agent` and `bootstrap` as
          compatibility aliases.
        - `bun run orch -- kg-maintain ... --no-tool-runners`: initial fast
          refresh candidate until a narrower `kg-refresh-run-evidence` command
          exists.
        - `bun run orch -- epoch-run ...`: manual full boundary path; keep
          compatible with the new scheduler state.
        - `bun run check`: typecheck, UI check, Agent Viewer check, and
          review-lint tests.
        - `bun run smoke`: end-to-end orchestrator smoke coverage.
    </commands_and_entrypoints>

    <adjacent_surfaces_requiring_caution>
        - `apps/dashboard-server/src/server.ts`: process controls are sensitive;
          preserve `melee-live` and drain/stop semantics.
        - `packages/agents/src/worker/`: avoid prompt churn unless removing a
          director-specific field or context source requires it. If worker
          prompt placeholders change, align Agent Viewer preview hydration.
        - SQLite schema migrations in `packages/core/src/state/schema.ts`: keep
          old state readable and smoke-test fresh plus migrated stores.
        - Knowledge graph rebuild code: keep graph writes serialized and avoid
          expensive per-completion tool runners.
    </adjacent_surfaces_requiring_caution>

    <out_of_scope>
        - Changing worker decomp strategy, QA repair policy, PR split planning,
          or Melee source is outside this objective unless required by scheduler
          data-contract fallout.
        - Adding a new LM strategy/advisor agent is out of scope for the default
          runtime. Optional advisory reports may be proposed later but must not
          block director removal.
        - Rewriting the whole knowledge graph model is out of scope. Add the
          smallest fast-refresh command/state needed for in-epoch learning.
    </out_of_scope>
</implementation_scope>
