<implementation_scope>
    <owned_surfaces>
        - `objectives/current-pr-qa-repair-campaign/`: primary objective,
          state, and campaign handoff notes.
        - `.decomp-orchestrator-state/qa-repair-campaign/`: preferred
          campaign artifact root when using an explicit state dir from the
          orchestrator checkout.
        - `projects/melee/state/qa_repairs/`: acceptable artifact root when
          using the project default state dir through `--project melee`.
        - `scripts/` or `apps/cli/src/cli/commands/`: allowed only if a
          campaign supervisor, concurrent runner, hook helper, or manifest
          writer is required to execute the objective safely. Keep changes
          narrow and covered by tests.
        - `packages/core/src/qa/repair-lane.ts` and
          `apps/cli/src/cli/commands/qa-repair.ts`: allowed for small
          correctness fixes discovered while running the campaign, especially
          if skipped hooks or artifact merging would otherwise make the live
          run unsafe.
    </owned_surfaces>

    <read_only_references>
        - `objectives/qa-repair-lane/`: prior objective and MVP state. Read for
          context; do not rewrite except to append a factual cross-reference if
          necessary.
        - `docs/30-plans/2026-06-13-qa-repair-lane.md`: lane design.
        - `docs/10-system-design/60-score-and-pr-handoff.md`: handoff gate
          model.
        - `docs/20-implementation/cli/00-overview.md`: command behavior.
        - `projects/melee/project.json`: project descriptor and stable
          `melee-live` process name.
        - `reports/qa-scan-open-pr-hardened-2026-06-13.json` and `.md`: saved
          replay input and human baseline.
    </read_only_references>

    <generated_outputs>
        - `campaign_manifest.json`: campaign id, base ref, head sha, queue
          source, validation hook templates, max concurrency, worker records,
          item leases, patch paths, merge status, validation paths, and final
          route per item.
        - `campaign_events.jsonl`: append-only event log with timestamps for
          lease, worker start, worker finish, patch merge, validation, requeue,
          block, and completion events.
        - `workers/<worker-id>/<item-id>/`: per-worker command transcript,
          `qa-repair` output dir, patch/diff, post-scan, hook summaries, and
          merge/revalidation artifacts.
        - `waves/<n>/queue.json`, `summary.json`, `report.md`, and
          `ship_status.json`: refreshed queue artifacts after each wave.
        - `validation_hooks.json`: exact score/build/regression command
          templates used by the campaign and the evidence that each one works.
        - `final_report.md`: compact human handoff with counts by status,
          unresolved blockers, artifact links, and next PR command.
    </generated_outputs>

    <out_of_scope>
        - Broad redesign of Pi agent prompts, dashboard UI, or process
          controls.
        - Starting UI/dashboard/Agent Viewer servers.
        - Rewriting the Melee build system, objdiff tooling, or scanner rule
          policy beyond narrow fixes needed for this campaign.
        - Force-pushing, committing, or opening PRs unless the user explicitly
          asks for those operations.
        - Knowledge-curator ingestion of lessons learned, except for a short
          note in the final report if useful.
    </out_of_scope>
</implementation_scope>
