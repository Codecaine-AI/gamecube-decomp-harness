<current_state>
<last_updated>2026-08-30</last_updated>

<status>
- MERGED TO MAIN as 45dde9ea (clean auto-merge over the committed dashboard WIP
  4a1928a2). 60 files, +778/-1117. Verified on merged HEAD in a clean worktree:
  board suite 7/7; pre-merge acceptance 314/314; zero new typecheck errors
  (13 pre-existing on main, unchanged); frontend typecheck clean.
- Epoch ordinal 11 (run 4a45af8a, epoch f717cebd, 96 old-code targets + 96
  queued worker jobs with stale enriched payloads) ROLLED BACK per Ford at
  2026-08-30 ~14:4x local; DB backup
  games/melee/state/orchestrator.sqlite.bak-before-epoch11-rollback-20260830.
  Run paused, no active epoch; next resume admits fresh under the new code
  (also loads fix 27c). 32 knowledge_absorption jobs left intact.
- DO NOT run repo-walking `bun test` from the main repo path: the operator
  session's fd watchdog kills them (see epoch-flow-redesign state log
  14d641b1). Verify in a clean worktree or with explicit files from apps/server.
- Phase C shakedown = the next resumed epoch; operator session
  (gamecube-decomp-harness-c1) notified of merge + rollback.
</status>

<completed>
- Decisions accepted by Ford: full ranking removal; admit-all with optional
  first-N cap; same-file claim exclusivity; section-level targets; no DB
  migration (priority columns written 0).
- A0 recon: editability locked/blocked is never written (type-level only) —
  splice deleted with no blocklist replacement. Priority consumer inventory
  swept (packet, dashboard, frontend work-tables, api).
- Phase A: closenessPriority + graph rank features deleted (rank.ts removed);
  admission = all open candidates in report order; --epoch-target-cap ->
  run snapshot epoch_target_cap -> scheduler (unset = admit all); claims
  WHERE active_source_claims = 0 ORDER BY admission_index (TTL-expired claims
  do not block); priority stripped from packet/dashboard/frontend.
- Phase B: unit.sections discovery (non-.text, size>0, fuzzy<EXACT_SCORE,
  kind "section" via leading-dot convention, no schema change); exact-section
  retirement in loadExactTargetKeys; verdict targetScore falls back to
  rows.sections; carve-out: section targets tolerate non-exact same-unit
  function fuzz + downward matched_data_percent, exact functions/sections stay
  protected; banned-idiom rules (static_added/qualifier_changed//order/i)
  skipped for section targets, parity + undefined-symbol gates unchanged;
  section-target prompt branch (bss = declarations only; no m2c/permuter);
  EXACT_SCORE=99.99999 unified in validation/objdiff/constants.ts.
- Compliance: six codex exec invocations (gpt-5.6-sol, low): A1 board/admission,
  A2 claims, A3 sweep, B1 discovery, B2 verdict, B3 packet/prompt, B4
  gates/thresholds. No direct Claude implementation.
</completed>

<in_progress>
- Nothing active. Branch awaits shakedown + merge.
</in_progress>

<next_actions>
- Phase C shakedown: merge or rebase branch (note: main has an in-flight
  uncommitted dashboard/boundary-viewer change touching cycle.ts,
  epoch-boundary.ts, work-tables — coordinate before merging), then run one
  epoch via run-operator and verify: section targets admitted, a data verdict
  `passed`, no same-file concurrent claims, conflict rate flat.
</next_actions>

<risks_or_open_questions>
- Merge with main's uncommitted epoch-flow-redesign work will conflict in
  frontend work-tables and possibly cycle.ts/epoch-boundary.ts.
- Report-delta classification now counts scores in [99.99999, 100) as exact
  (was bare 100) — intentional, but watch the first boundary report for
  surprising new-match rows.
- Claim exclusivity may reduce worker utilization when open targets cluster in
  few files; acceptable per Ford, revisit only if workers idle.
</risks_or_open_questions>

<important_paths>
- objectives/data-targets-and-ranking-removal/context/02_implementation_scope.md
  (file:line change map, Phase A rows A1-A5, Phase B rows B1-B7)
- apps/server/src/core/cycle-runtime/phases/running/board/snapshot.ts
- apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts
- apps/server/src/core/cycle-runtime/run-state/worker-state.ts
- apps/server/src/core/agent-catalog/agents/running/worker/micro-gates.ts
</important_paths>

<active_runs>
- None.
</active_runs>
</current_state>
