<problem>
    <objective_question>
        - Can the orchestrator run Melee decomp campaigns through deterministic
          epoch admission/refill/refresh/boundary routing, with no LM director in
          the hot scheduling path, while preserving worker throughput,
          evidence freshness, and operator observability?
    </objective_question>

    <current_baseline>
        - `trigger-agent` currently maintains a ranked queue, starts workers,
          runs background `kg-maintain`, and triggers epoch cycles by completed
          lease interval or legacy drain-to-zero mode.
        - `apps/cli/src/cli/commands/tick.ts` runs the LM director on durable
          wake events. The director emits `target_packets`; the runner parses
          them into high-priority queue candidates.
        - `packages/agents/src/director/` contains the director prompt,
          template, and output parsing contract. The prompt asks an LM to
          interpret board state, facts, blockers, stalls, and wake events.
        - `EPOCH_ORCHESTRATION_UPDATE.md` defines the target model: epoch size
          is operator-configurable, fast refresh updates learnings during an
          epoch, and full boundary maintenance updates compiled truth.
    </current_baseline>

    <why_current_state_is_insufficient>
        - The director's decisions are increasingly derivable from deterministic
          graph rank, status, locks, cooldowns, and epoch policy. Keeping an LM
          in the target-admission loop adds latency, cost, nondeterminism, and
          another failure mode without clear value.
        - Epoch size, ready queue size, candidate window, completed-lease
          checkpoint cadence, and fast maintenance cadence are related but not
          represented as one coherent scheduler model.
        - Documentation still mixes older drain-to-zero epoch language with the
          newer completed-lease checkpoint and graph-ranked queue behavior.
    </why_current_state_is_insufficient>

    <failure_modes>
        - `director_drift`: target admission depends on prompt interpretation
          instead of reproducible policy, making runs hard to audit.
        - `stale_truth_confusion`: fast graph evidence is mistaken for fresh
          compiled report truth, so matched/remaining counts or regressions are
          trusted before the epoch boundary rebuild.
        - `queue_starvation`: deterministic refills admit too few distinct
          source paths or fail to widen the candidate window, leaving workers
          idle.
        - `graph_write_overlap`: fast refresh and full boundary refresh write
          graph/index artifacts concurrently and corrupt or stale-publish rank
          evidence.
        - `director_half_removed`: old CLI/docs/viewer paths still expose a
          director mode even though runtime scheduling has moved elsewhere.
    </failure_modes>

    <prior_evidence>
        - `EPOCH_ORCHESTRATION_UPDATE.md`: separates fast learning refresh from
          full truth rebuild and names epoch size, ready queue size, and
          candidate window as distinct scheduler concepts.
        - `EVIDENCE_REFRESH_CADENCE.md`: defines attempt, epoch, run, and sync
          refresh boundaries and which tool evidence belongs at each boundary.
        - `docs/10-system-design/10-run-director-loop.md`: describes the
          current director and epoch queue cycle that this objective must
          replace or rewrite.
        - `packages/core/src/state/targets.ts`: already implements
          deterministic refill, priority refresh, distinct-source preference,
          and dedupe against prior run targets.
        - `apps/cli/src/cli/commands/trigger-agent.ts`: already owns worker
          spawning, queue refill, background maintenance, epoch cycle triggers,
          and therefore is the natural scheduler integration point.
    </prior_evidence>

    <expected_value>
        - A run can burn down the remaining Melee board through explicit,
          reproducible epoch policy. Operators see exactly what was admitted,
          completed, refreshed, matched, regressed, and routed, and no target
          selection depends on an opaque LM director decision.
    </expected_value>
</problem>
