<current_state>
<last_updated>2026-06-16</last_updated>

<status>
    - Deterministic epoch orchestration is implemented and validated for this
      objective slice.
    - `run-loop` is the primary deterministic scheduler command. `trigger-agent`
      and `bootstrap` remain compatibility aliases, and `tick` handles one
      deterministic scheduler wake event.
    - `babysit` is the outer guardian wrapper and now defaults its child system
      command to `run-loop`; `--no-epoch-cycle` remains as the legacy
      continuous-refill compatibility mode inside the run loop.
    - The LM director hot path, director prompt/parser files, role registration,
      runtime exports, and Agent Viewer director preview are removed.
    - Full validation passed. The docs quick audit still exits nonzero because
      of repo-wide docs-structure debt outside this scheduler objective, but
      its broken-link finding was fixed.
</status>

<completed>
    - Added durable scheduler epoch state in
      `packages/core/src/state/epochs.ts` and schema tables
      `scheduler_epochs` / `scheduler_epoch_targets`.
    - Implemented epoch size parsing, fixed and `full` admission, distinct-source
      selection, existing queued/leased target adoption, ready-queue refill from
      admitted membership, priority refresh, fast-refresh counters, lease/report
      status transitions, epoch closing, and progress summaries.
    - Wired `statusSnapshot` to expose `schedulerEpoch` and `schedulerEpochs`.
    - Reworked `apps/cli/src/cli/commands/tick.ts` into a deterministic
      scheduler wake handler that handles one durable event and refills/adopts
      work without invoking a director session.
    - Reworked the run loop to maintain active scheduler epochs, close epochs
      at boundaries, start the next epoch after boundary work, expose epoch
      summary counters, emit `run_loop` result mode, and keep legacy continuous
      mode behind `--no-epoch-cycle`. The implementation remains in
      `apps/cli/src/cli/commands/trigger-agent.ts` for compatibility.
    - Added the coalesced fast run-evidence lane using
      `kg-maintain --no-tool-runners`, with started/finished/skipped/deferred
      events and no overlapping fast refresh tasks.
    - Tightened fast refresh so it only refreshes queued priority and ready
      refill inside the active admitted epoch set; it does not admit new
      out-of-epoch work.
    - Added full boundary knowledge-maintenance policy with
      `--full-kg-maintenance-mode full|no-tool-runners|skip`.
    - Wired CLI usage, babysit forwarding, project dashboard defaults,
      dashboard server launch args, UI form fields, and dashboard/sidebar
      progress display for epoch size, ready queue, fast refresh, boundary KG
      mode, and active scheduler epoch progress. The managed process name
      remains `melee-live`.
    - Added the primary `run-loop` CLI command, preserved `trigger-agent` and
      `bootstrap` aliases, retargeted `babysit`'s default child to `run-loop`,
      updated run-loop event/log source labels, and added smoke assertions for
      both the primary command and compatibility alias.
    - Removed tracked director files under `packages/agents/src/director/` and
      removed director role/type/tool-profile/export/Agent Viewer preview
      surfaces. Legacy `director_cycles` state remains readable for old stores.
    - Updated current scheduler terminology across the active system design and
      implementation docs, `EPOCH_ORCHESTRATION_UPDATE.md`, and
      `EVIDENCE_REFRESH_CADENCE.md`.
    - Fixed a knowledge graph source-slice type issue in
      `packages/knowledge/src/graph/source-slices.ts` that blocked typecheck.
    - Fixed closed-epoch queued adoption so repair/carry-forward queue rows from
      a prior epoch can be admitted into the next epoch.
    - Fixed the broken appendix link in
      `docs/20-implementation/00-overview.md`.
</completed>

<validation_commands>
    - `bun test apps/cli/src/cli/commands/trigger-agent.test.ts` passed on
      2026-06-16: 4 tests, 4 assertions.
    - `bun test packages/core/src/state/epochs.test.ts` passed on
      2026-06-16: 9 tests, 28 assertions.
    - `bun run check` passed on 2026-06-16, including dashboard typecheck,
      Agent Viewer typecheck, and `review_lint` pytest with 67 tests passing.
    - `bun run smoke` passed with summary path
      `/var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/decomp-orchestrator-smoke-6Qe3BR/runs/c44b5139-b3fd-4566-8ba9-c553d6f4f13a/smoke_summary.json`.
    - Stale run-loop naming audit returned no matches for old trigger-agent
      ownership phrasing, trigger-actor wording, or the old `trigger_agent`
      result mode across live apps/packages/tests/current docs/objective files.
    - `rg -n "addDirectorCycle|director-cycles|@decomp-orchestrator/agents/director|\\.\\/director|directorPrompt|directorQueuedTargets|DirectorPrompt|target_packets|packages/agents/src/director" apps packages tests docs objectives -g '!objectives/deterministic-epoch-orchestration/artifacts/baseline_inventory.md'`
      found no live runtime imports or prompt/parser references. Remaining hits
      are negative smoke assertions and objective/project-workspace history.
    - `rg -n "runDirectorTick|DirectorTick|director tick|directorTick" apps packages tests docs objectives -g '!objectives/deterministic-epoch-orchestration/artifacts/baseline_inventory.md'`
      found no app/package/test runtime symbols. Remaining hits are
      deterministic-epoch objective planning and validation notes.
    - `python3 .codex/skills/docs-framework/scripts/audit.py docs` exits 2 on
      broad docs-structure debt. The 2026-06-16T11:29:10 rerun has zero broken
      links; remaining criticals are missing foundation split docs, missing
      `00-overview.md` in `docs/30-plans` and
      `docs/20-implementation/99-appendix`, and plan files without frontmatter.
    - `git diff --check` passed.
</validation_commands>

<in_progress>
    - None required for the deterministic epoch objective after the run-loop
      naming split.
</in_progress>

<next_actions>
    - Optional docs housekeeping outside this objective: add the missing docs
      framework overview/frontmatter files and decide whether to archive or
      rename preserved HTML artifacts that still describe the historical
      director model.
    - Optional follow-up: rename legacy filenames such as
      `apps/cli/src/cli/commands/trigger-agent.ts`,
      `docs/10-system-design/10-run-director-loop.md`, and
      `docs/20-implementation/agents/10-director-worker.md` once downstream
      links are ready. Their current contents or exported command surfaces
      already describe the scheduler model.
</next_actions>

<risks_or_open_questions>
    - Historical objective bundles and preserved HTML design artifacts still
      mention the old director model; these are not live runtime surfaces.
    - The run-loop implementation file is still named `trigger-agent.ts` to
      preserve low-risk imports while the command surface changes first.
    - The legacy `director_cycles` table/read paths remain intentionally for old
      state compatibility and status history. Current scheduler paths do not
      write director cycles.
    - Live non-dry-run boundary maintenance still depends on the selected
      project's report/build toolchain being available.
    - The worktree contains unrelated dirty QA/PR-flow and knowledge-source
      changes that predate or sit outside this scheduler slice; do not revert
      them without an explicit user request.
</risks_or_open_questions>

<important_paths>
    - `objectives/deterministic-epoch-orchestration/artifacts/baseline_inventory.md`
    - `objectives/deterministic-epoch-orchestration/artifacts/validation_summary.json`
    - `packages/core/src/state/epochs.ts`
    - `packages/core/src/state/epochs.test.ts`
    - `packages/core/src/state/schema.ts`
    - `packages/core/src/state/status.ts`
    - `apps/cli/src/cli/commands/tick.ts`
    - `apps/cli/src/cli/commands/trigger-agent.ts`
    - `apps/cli/src/cli/commands/babysit.ts`
    - `apps/cli/src/cli/usage.ts`
    - `packages/core/src/projects/resolver.ts`
    - `packages/ui-contract/src/dashboard.ts`
    - `apps/dashboard-server/src/server.ts`
    - `apps/dashboard/src/components/App.tsx`
    - `apps/dashboard/src/components/Sidebar.tsx`
    - `apps/dashboard/src/components/ProgressPanel.tsx`
    - `apps/agent-viewer/src/server.ts`
    - `apps/agent-viewer/src/components/AgentViewer.tsx`
    - `docs/10-system-design/10-run-director-loop.md`
    - `docs/20-implementation/cli/00-overview.md`
    - `docs/20-implementation/state/00-overview.md`
    - `docs/20-implementation/ui/00-overview.md`
</important_paths>
</current_state>
