<current_state>
<last_updated>2026-06-13</last_updated>

<status>
    - QA Repair Lane MVP is implemented across deterministic core, `qa-repair`
      agent role, CLI command, dashboard handoff state, dashboard Ship status,
      Agent Viewer preview, and docs.
    - Prepare Handoff runs QA repair after checkpoint/rework requeue and before
      PR split planning; its `ship_status.json` is passed to
      `pr-split-plan --ship-status`.
    - Live repair validation supports runner-owned QA, score, build, and
      regression checks before an item can become clean. Final targeted
      validation is green.
</status>

<completed>
    - Added `packages/core/src/qa/repair-lane.ts` with queue/report/summary,
      post-repair outcome validation, and split-plan ship-status generation.
    - Added `packages/agents/src/qa-repair/` with prompt templates, schema,
      result validator, tests, registry entry, exports, and default tool
      profile.
    - Added `qa-repair` CLI support in
      `apps/cli/src/cli/commands/qa-repair.ts`, wired through main/usage and
      command exports. The command supports checkpoint candidates, explicit
      file lists, saved scan replay, all-scan-file fallback, dry-run prompt
      artifacts, `--run-agents`, `--item-id`, `--max-items`, and output dirs.
    - Added post-repair validation hooks:
      `--score-check-command`, `--build-check-command`, and
      `--regression-check-command`; their stdout/stderr/summary artifacts land
      under each item directory and nonzero exits block clean status.
    - Added dashboard-server state/API/Prepare integration and dashboard Ship
      details for QA repair counts and artifact links.
    - Added Agent Viewer preview support for `qa-repair` placeholder hydration
      and sample rendering.
    - Updated docs:
      `docs/30-plans/2026-06-13-qa-repair-lane.md`,
      `docs/10-system-design/60-score-and-pr-handoff.md`,
      `docs/20-implementation/agents/00-overview.md`, and
      `docs/20-implementation/cli/00-overview.md`.
</completed>

<in_progress>
    - None for the MVP implementation. Remaining work is policy/validation
      hardening beyond the MVP.
</in_progress>

<validation_commands>
    - `bun run check` passed.
    - `bun test apps/cli/src/cli/commands/regression-check.test.ts apps/cli/src/cli/commands/pr-preship-review.test.ts apps/cli/src/cli/commands/qa-repair.test.ts packages/core/src/qa/repair-lane.test.ts packages/agents/src/qa-repair/prompt.test.ts` passed: 35 tests.
    - `python3 -m pytest tools/source_editing/review_lint/tests` passed: 52 tests.
    - `bun run orch --repo-root "$PWD" --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-lane" --dry-run-agents qa-repair --run-id open-pr-hardened-replay --base-ref origin/master --scan-json reports/qa-scan-open-pr-hardened-2026-06-13.json --all-scan-files` passed.
    - `bun run orch --repo-root "$PWD" --state-dir "$PWD/.decomp-orchestrator-state/qa-repair-lane" --dry-run-agents qa-repair --run-id open-pr-hardened-replay --base-ref origin/master --scan-json reports/qa-scan-open-pr-hardened-2026-06-13.json --all-scan-files --run-agents --max-items 1` passed.
</validation_commands>

<artifacts>
    - All-files replay report:
      `.decomp-orchestrator-state/qa-repair-lane/qa_repairs/open-pr-hardened-replay/2026-06-13T14-47-55-494Z/`
    - Replay counts: 64 candidate files, 54 files with errors, 42 files with
      warnings, 54 queue items, 800 errors, 327 warnings, recommendation
      `repair_required`.
    - Prompt dry run for first item:
      `.decomp-orchestrator-state/qa-repair-lane/qa_repairs/open-pr-hardened-replay/2026-06-13T14-48-00-876Z/`
    - First item: `src-melee-cm-camera` for `src/melee/cm/camera.c`, with
      system/user/output prompt artifacts written under the item directory.
</artifacts>

<next_actions>
    - When ready to do live repairs, run `qa-repair --run-agents --item-id ...`
      or a bounded `--max-items` batch without global `--dry-run-agents`.
    - Decide whether any `clean_lower_score` result should ship through an
      explicit improvement lane; the MVP records and demotes it from match
      shipping.
    - Configure project-specific score/build/regression validation commands for
      live QA repair batches, or pass them per invocation with the
      `--*-check-command` flags.
</next_actions>

<risks_or_open_questions>
    - Live Pi repair was not exercised in this run; prompt rendering and
      deterministic validation paths were tested with dry-run/mocked agents.
    - Per-item live validation reruns `review_lint scan_diff` for the repaired
      file and can run score/build/regression command hooks. These hooks are
      opt-in command flags rather than project descriptor defaults.
    - The worktree contains unrelated dirty/generated files outside this
      objective; do not revert them as part of this work.
</risks_or_open_questions>

<important_paths>
    - `packages/core/src/qa/repair-lane.ts`
    - `packages/agents/src/qa-repair/`
    - `apps/cli/src/cli/commands/qa-repair.ts`
    - `apps/dashboard-server/src/server.ts`
    - `apps/dashboard/src/components/Sidebar.tsx`
    - `apps/agent-viewer/src/server.ts`
    - `apps/agent-viewer/src/components/AgentViewer.tsx`
    - `docs/30-plans/2026-06-13-qa-repair-lane.md`
    - `reports/qa-scan-open-pr-hardened-2026-06-13.json`
    - `reports/qa-scan-open-pr-hardened-2026-06-13.md`
</important_paths>
</current_state>
