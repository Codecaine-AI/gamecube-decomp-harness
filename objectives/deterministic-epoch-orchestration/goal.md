<goal>
    - Implement deterministic epoch orchestration for the Melee run loop:
      configurable epoch size, fixed admission, ready-queue refill, coalesced
      fast run-evidence refresh, full epoch-boundary truth rebuild, outcome
      routing, dashboard status, and CLI/project-config support.
    - Remove the LM director from hot scheduling. Target admission, queue
      movement, replan/recovery, and routing must be deterministic and tested.
      Delete obsolete director prompts, parsers, role registration, runtime
      entry points, viewer previews, and docs.
    - Update docs so deterministic epoch scheduling is the current model.
</goal>

<context_refresh>
    <required_files>
        - objectives/deterministic-epoch-orchestration/goal.md
        - objectives/deterministic-epoch-orchestration/current_state.md
        - objectives/deterministic-epoch-orchestration/context/00_problem.md
        - objectives/deterministic-epoch-orchestration/context/01_constraints.md
        - objectives/deterministic-epoch-orchestration/context/02_implementation_scope.md
        - objectives/deterministic-epoch-orchestration/context/03_working_plan.md
        - objectives/deterministic-epoch-orchestration/context/04_validation_and_handoff.md
        - EPOCH_ORCHESTRATION_UPDATE.md
        - EVIDENCE_REFRESH_CADENCE.md
        - docs/10-system-design/10-run-director-loop.md
        - docs/20-implementation/cli/00-overview.md
    </required_files>

    <instruction>
        - At objective start and after compaction/resume, reread the required
          files and treat this bundle as the authority for this objective.
    </instruction>
</context_refresh>

<working_strategy>
    - Use `EPOCH_ORCHESTRATION_UPDATE.md` as the design seed: fast maintenance
      updates what was learned; full epoch maintenance updates what is true.
    - Build scheduler contracts first, then runtime/CLI, fast refresh, boundary
      routing, UI state, docs, and director deletion.
    - Keep graph writes serialized, leases authoritative, and report rebuilds at
      epoch/run boundaries.
</working_strategy>

<success_metrics>
    - `run-loop` runs without a director Pi session and still admits, refills,
      leases, refreshes, finishes, and restarts epochs; `trigger-agent` and
      `bootstrap` remain compatibility aliases.
    - Operators can configure epoch size, ready queue, fast refresh cadence, and
      boundary policy, and can inspect current epoch state in the dashboard.
    - Fast refresh updates learning/rank inputs without heavyweight runners;
      boundary refresh rebuilds report truth and routes outcomes.
    - No live runtime path imports director agent code or parser/templates.
</success_metrics>

<non_goals>
    - Do not change worker source-editing behavior, validation policy, or tool
      profiles except where prompts/context must stop referencing director
      packets.
    - Do not let workers directly mutate the canonical graph.
    - Do not run heavyweight tool runners after every worker completion.
    - Do not start UI, dashboard, Agent Viewer, or dev servers unless explicitly
      requested.
    - Do not rename the dashboard-managed Melee process away from `melee-live`.
</non_goals>

<completion_criteria>
    - Code, tests, docs, CLI usage, dashboard status, and objective state are
      updated for deterministic epochs and director removal.
    - `bun run check`, `bun run smoke`, and targeted scheduler tests pass, or
      skipped commands have concrete objective-local reasons.
    - Searches confirm no obsolete director runtime path remains outside
      archived objective history or migration notes.
    - `current_state.md` records final status, validation, artifacts, risks, and
      next actions.
</completion_criteria>
