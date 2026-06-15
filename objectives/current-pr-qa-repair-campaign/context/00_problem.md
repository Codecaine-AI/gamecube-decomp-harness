<problem>
    <objective_question>
        - How do we safely drive the current Melee PR from known deterministic
          QA errors to a clean or explicitly blocked handoff by running many
          `qa-repair` Pi agents at once?
    </objective_question>

    <current_baseline>
        - The QA Repair Lane MVP has been implemented: it can build a queue
          from `review_lint scan_diff`, render prompts for the `qa-repair`
          role, run selected items with `--run-agents`, validate post-repair
          scans, write `queue.json`, `summary.json`, `report.md`, and
          `ship_status.json`, and expose handoff state.
        - A saved replay over the current PR hardened scan exists at
          `.decomp-orchestrator-state/qa-repair-lane/qa_repairs/open-pr-hardened-replay/2026-06-13T14-47-55-494Z/`.
        - Replay counts: 64 candidate files, 54 files with error findings,
          42 files with warnings, 54 queued items, 800 errors, 327 warnings,
          recommendation `repair_required`.
        - The first queue item in that replay is
          `src-melee-cm-camera` for `src/melee/cm/camera.c`.
        - `projects/melee/checkout` is on `codex/split-up/mn` at `ec038c4`
          with merge-base `a384731c3042` against `origin/master`.
    </current_baseline>

    <failure_modes>
        - `shared_checkout_race`: multiple live agents edit the same checkout
          at once, producing interleaved diffs, overwritten files, or
          validation evidence that does not match the final patch.
        - `stale_queue`: the campaign repairs the saved 54-item replay even
          though the branch has moved and the true current queue is different.
        - `hookless_clean`: an item is marked clean because skipped
          score/build/regression hooks did not fail the validator.
        - `partial_wave_handoff`: early successful items are shipped while
          unresolved queue items still have deterministic hard findings.
        - `agent_claim_trust`: live agent JSON claims a repair, but the
          deterministic post-scan or build evidence still rejects it.
        - `conflict_sinkhole`: independently good per-item patches conflict
          when merged into the primary branch and never get revalidated
          together.
    </failure_modes>

    <prior_evidence>
        - `objectives/qa-repair-lane/current_state.md`: implementation status,
          validation commands, and dry-run artifact paths for the lane MVP.
        - `docs/30-plans/2026-06-13-qa-repair-lane.md`: accepted lane shape
          and artifact contract.
        - `reports/qa-scan-open-pr-hardened-2026-06-13.md`: human report of
          the hardened current-PR scan.
        - `reports/qa-scan-open-pr-hardened-2026-06-13.json`: scanner JSON
          that produced the replay queue.
        - `apps/cli/src/cli/commands/qa-repair.ts`: current command behavior;
          `--item-id` and `--max-items` select items, but selected items run
          sequentially inside one invocation.
        - `projects/melee/project.json`: project descriptor with
          `processName: melee-live`, `baseRef: origin/master`, and
          `validation.qaTarget: changes_all`.
    </prior_evidence>

    <expected_value>
        - The current PR reaches handoff with deterministic QA findings fixed
          or explicitly routed before maintainer review.
        - The user gets a durable campaign ledger showing which Pi agents ran,
          what each changed, what validation passed, what remains blocked, and
          which files are safe for `pr-split-plan`.
    </expected_value>
</problem>
