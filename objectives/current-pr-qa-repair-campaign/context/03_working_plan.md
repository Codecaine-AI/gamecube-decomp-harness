<working_plan>
    <overview>
        1. context_and_baseline - Refresh objective context and establish the
           true current queue.
        2. validation_hook_discovery - Define score, build, and regression
           hook templates that can run from `qa-repair`.
        3. supervisor_preflight - Prove item locking, isolation, artifacts, and
           merge strategy before live concurrency.
        4. live_pilot - Run a tiny live batch and verify the full artifact and
           merge/revalidation loop.
        5. full_32_worker_campaign - Dispatch live workers up to concurrency
           32, merge validated patches serially, and refresh residual queues.
        6. final_handoff - Produce ship status, PR split plan input, preship
           evidence, state update, and final report.
    </overview>

    <operating_principles>
        - Fresh evidence beats saved replay artifacts. Use the replay only as a
          bootstrap if the branch has not changed or fresh scanning is blocked.
        - Each live Pi session owns one queue item at a time.
        - Parallelism happens in isolated workspaces or patch proposals; final
          mutation of the primary checkout happens serially with validation.
        - A wave is not complete until the queue has been regenerated from the
          current checkout after merged patches.
    </operating_principles>

    <phase id="1" name="context_and_baseline">
        <objective>
            - Determine the true current QA repair queue and create the initial
              campaign artifact root.
        </objective>
        <inputs>
            - `objectives/current-pr-qa-repair-campaign/goal.md`
            - `objectives/current-pr-qa-repair-campaign/current_state.md`
            - `objectives/qa-repair-lane/current_state.md`
            - `reports/qa-scan-open-pr-hardened-2026-06-13.json`
            - `.decomp-orchestrator-state/qa-repair-lane/qa_repairs/open-pr-hardened-replay/2026-06-13T14-47-55-494Z/summary.json`
            - `projects/melee/checkout`
        </inputs>
        <process>
            - Record `git -C projects/melee/checkout status --short`,
              `branch --show-current`, `rev-parse HEAD`, and merge-base
              against `origin/master`.
            - If the branch SHA differs from the replay or files changed since
              the replay, run a fresh dry-run queue. Example command shape:
              `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" --dry-run-agents qa-repair --run-id current-pr-qa-repair-campaign --base-ref origin/master --all-scan-files`.
            - If fresh scanning is blocked, replay the saved JSON explicitly:
              `bun run orch --project melee --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-campaign" --dry-run-agents qa-repair --run-id current-pr-qa-repair-campaign --base-ref origin/master --scan-json "$PWD/reports/qa-scan-open-pr-hardened-2026-06-13.json" --all-scan-files`.
            - Create `campaign_manifest.json` with baseline artifact paths,
              counts, branch SHA, base ref, and selected queue source.
        </process>
        <outputs>
            - `campaign_manifest.json` with baseline metadata.
            - Wave 0 `queue.json`, `summary.json`, `report.md`, and
              `ship_status.json`.
            - Updated `current_state.md` with queue counts and artifact paths.
        </outputs>
        <gate>
            - The campaign has a machine-readable starting queue and the state
              names whether it is fresh or replayed.
        </gate>
        <failure_handling>
            - If scanning fails, save stdout/stderr and do not start live
              agents. Diagnose scanner/tool failure first.
        </failure_handling>
    </phase>

    <phase id="2" name="validation_hook_discovery">
        <objective>
            - Define the validation command templates required for final clean
              status.
        </objective>
        <inputs>
            - `projects/melee/project.json`
            - `apps/cli/src/cli/commands/qa-repair.ts`
            - `apps/cli/src/cli/commands/regression-check.ts`
            - Current Melee build artifacts under `projects/melee/checkout/build/`.
        </inputs>
        <process>
            - Confirm command templates are valid when executed with cwd equal
              to `{repo_root}` because `qa-repair` runs hook commands from the
              project checkout.
            - Define a build hook, usually `ninja changes_all`.
            - Define a regression hook, usually an orchestrator CLI invocation
              from the checkout such as `bun --cwd <orchestrator-root> run orch
              --project melee --state-dir {state_dir} regression-check
              --run-id {run_id} --target changes_all --qa-base {base_ref}`.
            - Define or implement a score hook that emits JSON containing
              `score_impact` or `preTargetScore`/`postTargetScore` for the
              repaired item. If no suitable helper exists, add a narrow helper
              before full live dispatch.
            - Run each hook on a harmless dry/pilot item or no-op state and
              save stdout, stderr, exit code, and parsed fields.
        </process>
        <outputs>
            - `validation_hooks.json` with command templates, sample results,
              and any limitations.
        </outputs>
        <gate>
            - Full live campaign cannot start until build and regression hooks
              pass and score handling is either implemented or explicitly
              approved as a recorded exception.
        </gate>
        <failure_handling>
            - If hooks are too expensive per item, split them into per-item
              lightweight checks plus per-wave full regression, but record that
              policy in `validation_hooks.json` before continuing.
        </failure_handling>
    </phase>

    <phase id="3" name="supervisor_preflight">
        <objective>
            - Prepare a safe dispatcher for up to 32 concurrent live Pi repair
              workers.
        </objective>
        <inputs>
            - Baseline `queue.json`.
            - `qa-repair` CLI item selection flags: `--run-agents`,
              `--item-id`, `--max-items`, `--output-dir`, and hook flags.
            - `validation_hooks.json`.
        </inputs>
        <process>
            - Choose one supervisor design:
              `isolated_worktrees` preferred, where each worker runs in its
              own scratch worktree, exports a patch, and the primary checkout
              applies patches serially; or `patch_only_workers`, where agents
              produce patches without mutating the primary checkout.
            - Implement or script item leases with atomic lock files. Lease
              record must include item id, worker id, pid, start time, output
              dir, source path, and status.
            - Ensure every worker runs one item with a unique output dir:
              `qa-repair --run-agents --item-id <item-id> --max-items 1`.
            - Ensure final patch application is serial. After applying each
              patch to the primary checkout, rerun post-scan and relevant
              hooks for that item in the primary checkout before marking it
              clean.
            - Run dry-run workers at the intended scheduling shape without
              live Pi calls and verify no duplicate leases or output paths.
        </process>
        <outputs>
            - Supervisor script/config or documented manual command matrix.
            - `campaign_manifest.json` updated with supervisor mode and max
              concurrency 32.
            - Dry-run worker artifacts proving leases and unique output dirs.
        </outputs>
        <gate>
            - No live concurrency until the dry-run preflight proves all queued
              items are leased at most once and all outputs are uniquely
              addressable.
        </gate>
        <failure_handling>
            - If isolation cannot be created, reduce to sequential repair and
              ask the user before deviating from the requested concurrency 32.
        </failure_handling>
    </phase>

    <phase id="4" name="live_pilot">
        <objective>
            - Prove one or two live repairs can complete through agent,
              validation, patch merge, queue refresh, and state update.
        </objective>
        <inputs>
            - Supervisor from phase 3.
            - Validation hooks from phase 2.
            - One low-complexity queued item and one representative item if
              practical.
        </inputs>
        <process>
            - Lease selected items and run live `qa-repair` Pi sessions.
            - Save raw agent outputs, parsed JSON, diffs, post-scan, hook
              outputs, and merge/revalidation results.
            - Apply accepted patches serially to the primary checkout.
            - Regenerate the queue and confirm repaired items disappear or are
              correctly rerouted.
        </process>
        <outputs>
            - Pilot worker directories.
            - Updated `campaign_manifest.json` and `campaign_events.jsonl`.
            - Wave 1 refreshed queue artifacts.
        </outputs>
        <gate>
            - Pilot cannot leave untracked/conflicting edits outside its item
              paths, and clean pilot items must have primary-checkout
              validation evidence.
        </gate>
        <failure_handling>
            - If the pilot fails due to prompt quality, hook configuration, or
              merge strategy, fix the cause and rerun the pilot before opening
              concurrency.
        </failure_handling>
    </phase>

    <phase id="5" name="full_32_worker_campaign">
        <objective>
            - Process the remaining QA repair queue with up to 32 concurrent
              live Pi agents while preserving validation integrity.
        </objective>
        <inputs>
            - Latest refreshed queue.
            - Passing pilot artifacts.
            - Supervisor with max concurrency 32.
        </inputs>
        <process>
            - Dispatch waves up to 32 active workers until no queued items
              remain or all residuals are blocked.
            - Monitor worker completion, timeouts, invalid JSON, validation
              failures, patch conflicts, and repeated residual findings.
            - Merge accepted patches serially into the primary checkout and
              immediately revalidate each merged item.
            - After each wave, regenerate `queue.json`, `summary.json`,
              `report.md`, and `ship_status.json` from the primary checkout.
            - Requeue residual findings with attempt history. Mark an item
              `blocked` only with the last failure reason and artifacts.
        </process>
        <outputs>
            - Wave artifacts for every refresh.
            - Per-item worker artifacts for every live attempt.
            - `campaign_manifest.json` with final item routes.
        </outputs>
        <gate>
            - Exit the phase only when the fresh queue has no shippable queued
              error items, or all residual items are explicitly blocked,
              demoted, or false-positive with reasons.
        </gate>
        <failure_handling>
            - If three consecutive attempts on the same item fail for the same
              reason, stop reattempting that item and route it blocked with the
              evidence.
            - If global build/regression starts failing after merged patches,
              pause new dispatch, bisect recent accepted patches by manifest
              order, and requeue or revert only the campaign-owned patch that
              caused the failure.
        </failure_handling>
    </phase>

    <phase id="6" name="final_handoff">
        <objective>
            - Convert campaign results into PR handoff evidence.
        </objective>
        <inputs>
            - Final queue/ship-status artifacts.
            - Final campaign manifest and events.
            - Current primary checkout after accepted patches.
        </inputs>
        <process>
            - Run final QA scan and `qa-repair` queue generation against the
              current checkout.
            - Run final build/regression gate, preferably
              `regression-check --require-pr-promotion` with the project
              `changes_all` target unless policy says otherwise.
            - Run or prepare `pr-split-plan --ship-status <final ship_status.json>`.
            - Run preship review when a split plan exists, or record the exact
              blocker preventing it.
            - Write `final_report.md` and update `current_state.md` with
              artifact paths, counts by status, validation commands, and next
              action.
        </process>
        <outputs>
            - Final `queue.json`, `summary.json`, `report.md`,
              `ship_status.json`, `campaign_manifest.json`, and
              `final_report.md`.
        </outputs>
        <gate>
            - The user can see whether the current PR is clean for handoff, or
              exactly which files remain blocked and why.
        </gate>
        <failure_handling>
            - If final gates fail after all item-level validation passed,
              create a blocked final state with the failing gate artifacts and
              the narrowest next repair action.
        </failure_handling>
    </phase>
</working_plan>
