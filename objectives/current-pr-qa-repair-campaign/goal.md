<goal>
    - Supervise the current Melee PR QA repair campaign: refresh the
      `review_lint`/`qa-repair` queue, run Pi repair agents over every known
      error item with target live concurrency 32, validate repairs, requeue
      residuals, and produce a final ship-status handoff.
    - Complete only when a fresh current-PR scan has no blocking QA repair
      items, or every remaining item is routed as blocked/false-positive/
      demoted with artifacts and reasons.
</goal>

<context_refresh>
    <required_files>
        - objectives/current-pr-qa-repair-campaign/goal.md
        - objectives/current-pr-qa-repair-campaign/current_state.md
        - objectives/current-pr-qa-repair-campaign/context/00_problem.md
        - objectives/current-pr-qa-repair-campaign/context/01_constraints.md
        - objectives/current-pr-qa-repair-campaign/context/02_implementation_scope.md
        - objectives/current-pr-qa-repair-campaign/context/03_working_plan.md
        - objectives/current-pr-qa-repair-campaign/context/04_validation_and_handoff.md
        - objectives/qa-repair-lane/current_state.md
        - docs/30-plans/2026-06-13-qa-repair-lane.md
        - docs/10-system-design/60-score-and-pr-handoff.md
        - docs/20-implementation/cli/00-overview.md
        - projects/melee/project.json
    </required_files>

    <instruction>
        - At objective start and after compaction/resume, reread the required
          files and treat this bundle as the authority for this objective.
    </instruction>
</context_refresh>

<working_strategy>
    - Baseline from the latest current-PR scan/queue; refresh if the branch
      changed. The prior replay had 54 queued files, 800 errors, and 327
      warnings, but fresh evidence wins.
    - Before concurrency 32, use or add a supervisor with per-item locks,
      unique artifact dirs, isolated worktrees or patch-only workers, and a
      serial merge/revalidation gate.
    - Run dry-run and small live pilots first, then dispatch up to 32
      concurrent Pi agents. After each wave, regenerate the queue and requeue
      only residual/conflicted items.
    - Score/build/regression hooks are mandatory for final clean status.
      Skipped hooks are only acceptable for dry-run or labeled pilot evidence.
</working_strategy>

<success_metrics>
    - A campaign manifest records leases, workers, output dirs, attempts,
      patches, merge status, validations, and final routing.
    - Live artifacts exist for every queued item, or the item is skipped with a
      durable reason.
    - Fresh final QA artifacts show zero queued error items for shippable files,
      and `ship_status.json` is suitable for `pr-split-plan`.
    - Final validation includes QA scan, score/build/regression evidence, and
      PR split/preship results or blockers.
</success_metrics>

<non_goals>
    - Do not redesign the QA Repair Lane prompt or dashboard except for fixes
      required to run safely.
    - Do not start UI, dashboard, or Agent Viewer servers unless explicitly
      asked.
    - Do not bypass deterministic QA, score, build, regression, ship-set, or
      preship-review gates to declare success.
    - Do not revert unrelated dirty worktree changes.
</non_goals>

<completion_criteria>
    - The current PR has run through the campaign supervisor with target
      concurrency 32 after safety preflight.
    - Final `queue.json`, `summary.json`, `report.md`, `ship_status.json`, and
      campaign manifest are linked from `current_state.md`.
    - Final state records counts by status, remaining blocked items if any,
      validation commands/results, and exact next handoff action.
    - No objective completion until all queue items are clean, demoted,
      false-positive, or blocked with artifacts and reasons.
</completion_criteria>
