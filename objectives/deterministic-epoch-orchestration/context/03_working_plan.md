<working_plan>
    <overview>
        1. baseline_inventory - Map every director/runtime/docs dependency and
           capture current smoke behavior.
        2. scheduler_contracts - Define deterministic epoch state, admission,
           ready-queue, finish, refresh, and routing contracts.
        3. fast_refresh_lane - Implement coalesced in-epoch run-evidence refresh
           without heavyweight tool runners.
        4. trigger_runtime_rewrite - Wire trigger-agent and CLI/config to use
           deterministic scheduler behavior instead of director ticks.
        5. director_removal - Delete or retire director agent code, prompt
           previews, CLI command paths, and docs once runtime no longer needs
           them.
        6. dashboard_docs_validation - Add operator controls/status, update docs,
           and complete validation/handoff.
    </overview>

    <operating_principles>
        - Deterministic policy owns scheduling; LMs may remain workers,
          curator/review agents, or offline advisors only.
        - Keep epoch state explainable from SQLite rows, events, save points, and
          artifacts. A dashboard user should not need hidden process memory to
          understand the current epoch.
        - Implement compatibility layers only as short-lived bridges. The final
          state removes the old director runtime surface.
        - Prefer focused helpers over broad rewrites; reuse existing queue,
          lease, refill, epoch-cycle, and knowledge-maintenance primitives.
    </operating_principles>

    <phase id="1" name="baseline_inventory">
        <objective>
            - Establish the current dependency map and baseline behavior before
              removing the director.
        </objective>
        <inputs>
            - `apps/cli/src/cli/commands/trigger-agent.ts`
            - `apps/cli/src/cli/commands/tick.ts`
            - `packages/agents/src/director/`
            - `packages/agents/src/registry.ts`
            - `packages/core/src/state/targets.ts`
            - `packages/core/src/epoch/cycle.ts`
            - `tests/smoke.ts`
            - `docs/10-system-design/10-run-director-loop.md`
        </inputs>
        <process>
            - Search for `director`, `runDirectorTick`, `target_packets`,
              `pool_below_target`, `epoch_started`, and `kg-maintain` references.
            - Record which tests/smokes currently assert director behavior.
            - Run or inspect baseline validation. Prefer `bun run smoke` if the
              local environment is ready; otherwise run targeted tests and record
              the missing prerequisite.
            - Write `artifacts/baseline_inventory.md` if the dependency map is
              large enough to need a handoff artifact.
        </process>
        <outputs>
            - `objectives/deterministic-epoch-orchestration/artifacts/baseline_inventory.md`:
              director references, runtime dependency graph, relevant tests, and
              baseline command results.
            - `current_state.md`: updated with baseline status and first code
              target.
        </outputs>
        <gate>
            - A future agent can see exactly what must be replaced before
              deleting director code.
        </gate>
        <failure_handling>
            - If baseline validation fails for unrelated reasons, capture the
              exact failure and continue only when the failure does not mask
              scheduler/director behavior.
        </failure_handling>
    </phase>

    <phase id="2" name="scheduler_contracts">
        <objective>
            - Add the deterministic scheduler data contract and pure helpers
              before changing the trigger runtime.
        </objective>
        <inputs>
            - Output from phase 1.
            - `EPOCH_ORCHESTRATION_UPDATE.md`
            - Existing `QueueRefillResult`, target refill, lease, report, event,
              and epoch-cycle helpers.
        </inputs>
        <process>
            - Define epoch state fields: epoch id/ordinal, size mode, admitted
              target ids, ready queue size, candidate window, fast refresh
              counters, boundary status, and routing summary.
            - Decide whether epoch state lives in new SQLite tables, save-point
              payloads, or both. Prefer tables for active scheduling state and
              save-point payloads for historical boundary summaries.
            - Implement pure helpers for epoch size parsing, board admission,
              full-board scan for `Full`, admitted-set refill, completion
              detection, and routing summaries.
            - Add unit tests for `32/64/128/256/512/full`, exhausted board,
              distinct source selection, cooldown/stall exclusion, and repair
              priority preservation.
        </process>
        <outputs>
            - Core scheduler helpers and tests.
            - Schema migration or explicit decision not to migrate.
            - CLI/config option shape for later phases.
        </outputs>
        <gate>
            - Deterministic tests prove admissions/refills without invoking a Pi
              agent or director parser.
        </gate>
        <failure_handling>
            - If the fixed admitted-set model conflicts with existing queue
              dedupe/status behavior, add a narrow epoch membership table rather
              than weakening run-level target status semantics.
        </failure_handling>
    </phase>

    <phase id="3" name="fast_refresh_lane">
        <objective>
            - Make in-epoch learnings useful without running full boundary
              maintenance after every completion.
        </objective>
        <inputs>
            - Scheduler contracts from phase 2.
            - `runKnowledgeMaintenance` and `knowledgeMaintenanceArgs`.
            - `packages/knowledge/src/curator.ts`
            - `packages/knowledge/src/graph/rebuild.ts`
        </inputs>
        <process>
            - Add fast-refresh policy: interval, report-count trigger,
              no-overlap guarantee, no-new-report skip, and event rows for
              started/finished/skipped/deferred.
            - Start with `kg-maintain --no-tool-runners` if acceptable. If it is
              still too broad, add `kg-refresh-run-evidence` for worker-report
              ingestion, deterministic curator reduction, graph rebuild/patch,
              and rank inputs only.
            - After successful fast refresh, refresh priorities for
              queued-but-not-leased targets inside the current epoch.
            - Implement optional adjacency injection only behind an explicit
              policy/budget flag. MVP may keep this disabled and only reorder
              admitted targets.
            - Add tests for coalescing, no overlap, skipped unchanged refresh,
              and priority refresh after graph update.
        </process>
        <outputs>
            - Fast refresh command/policy wiring.
            - Refresh events and scheduler summaries.
            - Tests for refresh cadence and serialization.
        </outputs>
        <gate>
            - Worker completions can trigger or coalesce a light graph refresh,
              and heavyweight tool runners are not invoked by the fast lane.
        </gate>
        <failure_handling>
            - If graph rebuild is too expensive for the intended cadence, split
              deterministic report ingestion from graph rebuild and expose the
              slower portion as a lower-frequency fast-refresh substage.
        </failure_handling>
    </phase>

    <phase id="4" name="trigger_runtime_rewrite">
        <objective>
            - Replace director wake scheduling in `trigger-agent` with the
              deterministic epoch scheduler.
        </objective>
        <inputs>
            - Outputs from phases 2 and 3.
            - Existing trigger-agent worker spawning, provider pause, epoch
              cycle, and queue refill logic.
        </inputs>
        <process>
            - Add CLI/project config flags:
              `--epoch-size <n|full>`, optional
              `--epoch-ready-queue-size <n>`,
              `--fast-kg-maintenance-interval-ms <n>`,
              `--fast-kg-maintenance-report-count <n>`,
              `--no-fast-kg-maintenance`, and boundary maintenance policy.
            - Preserve existing defaults until the new mode is proven; map
              `--queue-target-size`, `--candidate-window`, and
              `--epoch-lease-interval` compatibility behavior explicitly.
            - Replace `nextUnhandledEvent -> runDirectorTick` with deterministic
              scheduler handling for worker completion, pool pressure, epoch
              admission, queue refill, and boundary triggers.
            - Ensure provider failures, lease recovery, drain/stop, and
              regression pause behavior still work.
            - Add runtime summaries for epoch config, admitted count, ready
              queue count, fast refresh age, and boundary status.
        </process>
        <outputs>
            - Trigger-agent runtime no longer calls `runDirectorTick`.
            - CLI usage documents the new scheduler flags.
            - Smoke tests cover dry-run scheduler behavior.
        </outputs>
        <gate>
            - `bun run smoke` or targeted smoke proves workers start from
              deterministic admissions and all wake events are handled without
              director output.
        </gate>
        <failure_handling>
            - If a specific wake event cannot be handled deterministically,
              implement a structured scheduler event and fallback policy rather
              than reintroducing an LM director.
        </failure_handling>
    </phase>

    <phase id="5" name="director_removal">
        <objective>
            - Remove the old director agent and all runtime/documentation
              surfaces that imply LM target scheduling remains active.
        </objective>
        <inputs>
            - Passing phase 4 runtime.
            - Director dependency inventory from phase 1.
        </inputs>
        <process>
            - Delete `packages/agents/src/director/` if no tests/imports require
              it, or leave only archived notes outside runtime exports if needed
              for migration history.
            - Remove director from agent role types, registry, exports, tool
              profiles, prompt previews, and CLI command lists.
            - Replace `tick` docs/usage with deterministic scheduler inspection
              or remove the command if it has no remaining purpose.
            - Update tests that asserted director wake behavior to assert
              deterministic scheduler behavior.
            - Run searches for obsolete references and classify each remaining
              mention as current docs, migration history, or bug.
        </process>
        <outputs>
            - No runtime director imports.
            - Updated tests and viewer code.
            - Reference audit recorded in `current_state.md` or artifacts.
        </outputs>
        <gate>
            - Typecheck passes and `rg` finds no live director runtime surface
              outside allowed migration/objective history.
        </gate>
        <failure_handling>
            - If a prompt preview or docs page still needs a director concept,
              rewrite it as deterministic scheduler context rather than keeping
              stale placeholders.
        </failure_handling>
    </phase>

    <phase id="6" name="dashboard_docs_validation">
        <objective>
            - Finish operator-facing controls/status, docs, and validation.
        </objective>
        <inputs>
            - Runtime from phase 4.
            - Director cleanup from phase 5.
            - Dashboard process-control code and UI components.
        </inputs>
        <process>
            - Add dashboard controls/status for epoch size, ready queue,
              candidate window, fast refresh cadence, fast refresh age,
              admitted/leased/completed counts, and boundary status.
            - Keep process name stable as `melee-live`; do not add UI controls
              that create per-mode process names.
            - Update `EPOCH_ORCHESTRATION_UPDATE.md`, `EVIDENCE_REFRESH_CADENCE.md`,
              system design docs, implementation docs, CLI usage docs, and
              Agent Viewer docs/previews as needed.
            - Run the validation ladder in
              `context/04_validation_and_handoff.md`.
            - Update `current_state.md` with completed work, commands, artifacts,
              risks, and next actions.
        </process>
        <outputs>
            - Dashboard UI/API changes.
            - Updated docs.
            - Validation summary in objective state and optional
              `artifacts/validation_summary.json`.
        </outputs>
        <gate>
            - Completion criteria in `goal.md` and validation gates in
              `context/04_validation_and_handoff.md` are satisfied.
        </gate>
        <failure_handling>
            - If full validation cannot run, record exact skipped commands,
              reasons, and the smallest follow-up needed before production use.
        </failure_handling>
    </phase>
</working_plan>
