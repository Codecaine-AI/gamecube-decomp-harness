<constraints>
    <hard_rules>
        - Do not start `bun run ui:server`, `bun run ui`, any UI dev server,
          dashboard server, or Agent Viewer server unless the user explicitly
          asks.
        - Keep the dashboard-managed Melee process name `melee-live`; do not
          add controls or config that let this project process name drift.
        - The deterministic `review_lint scan_diff --gate` path is
          authoritative for known hard QA findings. Agent output alone cannot
          clean an item.
        - Final clean status for this campaign requires non-skipped
          score/build/regression evidence or an explicit recorded exception
          approved by the operator.
        - Do not run 32 mutating agents in the same checkout. Concurrency 32
          requires isolation: per-item worktrees, patch-only workers, or an
          equivalent lock/merge design that prevents concurrent writes to the
          same files and serializes final patch application.
        - Every live worker must write a unique output directory and campaign
          manifest entry before it starts a Pi session.
        - Do not mark the objective complete until all fresh queue items are
          `clean_same_match`, `clean_lower_score`, `false_positive`, `blocked`,
          or otherwise demoted with durable reasons and artifacts.
        - Preserve unrelated dirty worktree changes. Do not use destructive git
          commands such as `git reset --hard` or `git checkout --` unless the
          user explicitly asks.
    </hard_rules>

    <forbidden_shortcuts>
        - Do not rely on the saved 2026-06-13 replay if a fresh scan shows
          different findings.
        - Do not treat warning-only files as hard blockers unless the scanner
          or campaign policy promotes them; still report warnings for review
          context.
        - Do not hide lower-score repairs. If a QA-acceptable fix lowers score,
          route it as `clean_lower_score` and document the tradeoff.
        - Do not drop blocked files from the final handoff without recording
          file path, item id, rule ids, last validation artifacts, and next
          action.
        - Do not bypass `pr-split-plan --ship-status`, ship-set verification,
          regression gate, or preship review to call the PR ready.
    </forbidden_shortcuts>

    <validity_gates>
        - Baseline gate: a fresh or explicitly accepted replay `summary.json`
          and `queue.json` define the starting item set, counts, branch SHA,
          and base ref.
        - Supervisor gate: manifest, locks, worker output dirs, conflict
          handling, and serial merge/revalidation are proven by dry-run or a
          small pilot before live concurrency 32.
        - Hook gate: score/build/regression command templates are recorded in
          a campaign artifact and produce machine-readable summaries before
          final full-wave cleanup.
        - Item gate: every clean item has post-repair scan artifacts and
          validation summaries created after the patch that is present in the
          final checkout.
        - Refresh gate: after each wave, regenerate the QA repair queue from
          the current checkout and requeue residual findings.
        - Handoff gate: final `ship_status.json` is consumed by PR planning,
          and preship review either passes or records explicit blockers.
    </validity_gates>

    <risk_budget>
        - Concurrency can be reduced for pilot or diagnosis, but the intended
          full campaign mode is 32 live workers once safety gates pass.
        - A blocked item is acceptable only when the artifact trail makes the
          blockage actionable; a silent timeout is not a final route.
        - False positives are allowed only with scanner evidence and a
          follow-up rule/fixture note.
    </risk_budget>
</constraints>
