<goal>
    - Implement the QA Repair Lane MVP for PR handoff: candidate-file QA sweep,
      per-file repair queue, `qa-repair` Pi agent/prompt/schema, CLI runner,
      validation harness, reports, handoff state, and Agent Viewer preview.
    - Run it after checkpoint/proof collection and before PR split planning.
      Convert `review_lint scan_diff` findings in PR-bound files into repair
      items, let a resolver-style agent make minimal fixes, revalidate
      score/build/regression/QA, and route each file as `clean_same_match`,
      `clean_lower_score`, `needs_rework`, `false_positive`, or `blocked`.
    - Produce a dry-run/report path that lists every open-PR candidate file
      with QA errors, plus smoke tests proving hardened-rule findings become
      queue items and cannot falsely pass repair validation.
</goal>

<context_refresh>
    <required_files>
        - objectives/qa-repair-lane/current_state.md
        - objectives/qa-repair-lane/context/00_problem.md
        - objectives/qa-repair-lane/context/01_constraints.md
        - objectives/qa-repair-lane/context/02_implementation_scope.md
        - objectives/qa-repair-lane/context/03_working_plan.md
        - objectives/qa-repair-lane/context/04_validation_and_handoff.md
        - docs/30-plans/2026-06-13-qa-repair-lane.md
        - docs/10-system-design/60-score-and-pr-handoff.md
        - docs/20-implementation/agents/00-overview.md
        - docs/20-implementation/cli/00-overview.md
    </required_files>
    <instruction>
        - At objective start and after resume/compaction, reread these files
          and treat this bundle as the execution contract.
    </instruction>
</context_refresh>

<working_strategy>
    - Build this as a first-class agent lane: role catalog entry,
      prompt/schema/tests, CLI entry point, durable artifacts under
      `state_dir/qa_repairs/<run-id>/<timestamp>/`, and Agent Viewer preview.
    - Sequence: artifact/schema design -> queue/report generator ->
      `qa-repair` agent -> CLI runner and post-repair validation ->
      handoff/dashboard state -> viewer preview -> smoke/open-PR dry run.
    - Keep deterministic pieces separate from Pi calls. The queue builder and validation harness must be testable without live agents. The agent may propose edits, but runner validation decides item status.
    - Preserve match when possible, but never by retaining a maintainer-rejected
      tactic. Route clean lower-score results explicitly.
</working_strategy>

<success_metrics>
    - A command writes `queue.json`, `summary.json`, and `report.md` listing
      every candidate file with QA errors and rule counts.
    - `qa-repair` renders from queue context, has a JSON schema, records
      prompts/output artifacts, and appears in Agent Viewer.
    - Tests prove fixture findings flow through scan -> queue -> repair
      validation, and dirty mocked repairs are rejected.
    - Prepare Handoff exposes QA repair before PR split planning and excludes
      or demotes dirty files before the final PR plan.
</success_metrics>

<non_goals>
    - Do not rewrite the worker loop or make workers whole-checkout repair agents.
    - Do not make `pr-preship-review` mutating; it remains an adversarial reviewer.
    - Do not bypass `review_lint`, score/build/regression checks, or ship-set verification to mark an item clean.
    - Do not start UI, dashboard, or Agent Viewer servers unless explicitly asked.
</non_goals>

<completion_criteria>
    - Code, docs, tests, and objective state are updated for the MVP.
    - Dry-run mode works without live Pi calls and can produce the all-files QA
      error report for the open PR candidate set when available.
    - Validation commands in `context/04_validation_and_handoff.md` pass, or
      skipped commands have concrete reasons.
    - `current_state.md` records final status, artifacts, commands, residual
      risks, and next actions.
</completion_criteria>
