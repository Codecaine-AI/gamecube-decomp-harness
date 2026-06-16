<constraints>
    <hard_rules>
        - No LM may be required for normal target admission, queue refill,
          replan, epoch finish, or boundary routing.
        - Worker leases and file locks remain authoritative. The scheduler must
          not bypass lease recovery, TTL, write-set, or active-lock protection.
        - Fast refresh may update graph/rank evidence from worker reports, but
          it must not claim report truth. Exact match removal and remaining
          counts require the full epoch-boundary report rebuild.
        - Full epoch maintenance must serialize graph publication after all
          inputs it depends on are ready: fresh report/code data, selected tool
          indexes, and curator/run evidence.
        - Dashboard process controls must continue to use the stable managed
          process name `melee-live`.
        - Follow AGENTS.md: do not start UI/dashboard/Agent Viewer servers unless
          the user explicitly asks.
    </hard_rules>

    <forbidden_shortcuts>
        - `rename_director_to_scheduler_only`: invalid because it leaves LM
          scheduling behavior hidden under deterministic terminology.
        - `remove_prompts_without_runtime_replacement`: invalid because workers
          would stop receiving queue admissions on wake events.
        - `full_kg_maintain_as_fast_refresh`: invalid if heavyweight tool
          runners or report rebuilds run after every few worker completions.
        - `queue_all_full_mode_without_policy`: invalid unless storage, UI, and
          lease behavior prove that materializing every target at once is safe.
        - `docs_only_cleanup`: invalid because code paths, CLI usage, UI
          status, and tests must all align with the new scheduler model.
    </forbidden_shortcuts>

    <data_and_feature_boundaries>
        - Deployable scheduler inputs: current report snapshot, graph-ranked
          board candidates, target/queue/lease/report/event tables, file locks,
          cooldown/stall status, epoch state, and explicit operator config.
        - Fast-refresh inputs: new worker reports, facts, blockers, stalls,
          validation summaries, deterministic curator output, and graph-owned
          enrichment.
        - Truth-boundary inputs: rebuilt report, report_changes, generated asm,
          selected tool-runner outputs, tool indexes, curator output, and graph
          rebuild result.
        - Diagnostic-only inputs: optional advisory summaries or post-epoch
          analysis. These may guide future policy but must not be required for
          target admission.
    </data_and_feature_boundaries>

    <risk_budget>
        - `worker_starvation`: deterministic scheduler should keep schedulable
          ready targets at or above open worker slots whenever board candidates
          exist. If not, emit a structured scheduler event explaining why.
        - `graph_refresh_overlap`: zero overlapping graph publication writes.
          If a refresh is already active, coalesce the trigger and record a
          skipped/deferred refresh event.
        - `director_residue`: zero runtime imports of `packages/agents/src/director`
          or `runDirectorTick` after cleanup, excluding archived objective notes.
        - `full_boundary_regression`: respect existing regression pause/requeue
          thresholds and preserve repair priority above normal board candidates.
    </risk_budget>

    <promotion_or_completion_gates>
        - `scheduler_hot_path`: `run-loop` can complete a dry-run/smoke run
          without invoking the director role, while `trigger-agent` and
          `bootstrap` remain command aliases.
        - `epoch_state_visibility`: state/events/artifacts explain epoch id,
          size/mode, admitted count, ready queue count, completions, fast
          refreshes, full boundary result, and routing.
        - `director_removed`: typecheck and smoke tests pass with director
          runtime files removed or unused, and docs no longer tell operators to
          rely on an LM director for scheduling.
    </promotion_or_completion_gates>
</constraints>
