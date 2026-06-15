<implementation_scope>
    <owned_surfaces>
        - `packages/agents/src/qa-repair/`: new prompt builder, templates,
          schema, parsing/validation helpers, and tests.
        - `packages/agents/src/index.ts`, `packages/agents/src/registry.ts`,
          `packages/agents/src/tools/profile-data.ts`,
          `packages/agents/src/tools/profiles.ts`: register the new role and
          tool profile, likely based on reconcile's whole-checkout tools plus
          `review_lint_scan`.
        - `packages/core/src/types/agents.ts`: add `qa-repair` to agent role
          types.
        - `packages/core/src/qa/`: queue/report/scan helper code if a shared
          deterministic layer fits the existing structure.
        - `apps/cli/src/cli/commands/`: new QA repair command(s), tests, usage
          text, and main command routing.
        - `apps/dashboard-server/src/server.ts`: Prepare Handoff state/stage
          integration and artifact disclosure.
        - `apps/dashboard/src/`: minimal status display only if needed for the
          new solid state; keep styling consistent with the existing handoff
          panels.
        - `apps/agent-viewer/src/server.ts` and
          `apps/agent-viewer/src/components/AgentViewer.tsx`: sample
          `qa-repair` preview and placeholder hydration/parsing alignment.
        - `docs/10-system-design/60-score-and-pr-handoff.md`,
          `docs/20-implementation/agents/00-overview.md`,
          `docs/20-implementation/cli/00-overview.md`, and the QA repair plan
          doc: update once implementation names and artifacts are real.
    </owned_surfaces>

    <read_only_references>
        - `packages/agents/src/reconcile/`: copy the boundary-agent pattern,
          but do not collapse QA repair into reconcile unless implementation
          evidence shows a separate role is worse.
        - `apps/cli/src/cli/commands/pr-preship-review.ts`: copy artifact and
          fail-closed review patterns where useful.
        - `apps/cli/src/cli/commands/regression-check.ts` and
          `packages/core/src/qa/scan-diff.ts`: reuse scanner invocation
          conventions instead of inventing a second scanner interface.
        - `tools/source_editing/review_lint/api/scan_diff.py`: authoritative
          deterministic QA gate.
    </read_only_references>

    <generated_outputs>
        - `state_dir/qa_repairs/<run-id>/<timestamp>/queue.json`: queue items,
          statuses, findings, proof links, attempts, and routing.
        - `state_dir/qa_repairs/<run-id>/<timestamp>/summary.json`: command
          inputs, counts, artifact paths, scan result, final disposition.
        - `state_dir/qa_repairs/<run-id>/<timestamp>/report.md`: human report
          of all files with errors/warnings and repair outcomes.
        - `state_dir/qa_repairs/<run-id>/<timestamp>/<item-id>/`: prompt,
          output, validation, scan, and patch artifacts per repair item.
    </generated_outputs>

    <out_of_scope>
        - Full GitHub PR opening automation changes unless required to keep
          dirty files out of the final plan.
        - New hardened QA rule design beyond fixtures needed for queue tests.
        - Large dashboard redesign or new UI server/process controls.
        - Knowledge-curator ingestion of QA repair lessons, except for notes in
          artifacts that future curator work can consume.
    </out_of_scope>
</implementation_scope>
