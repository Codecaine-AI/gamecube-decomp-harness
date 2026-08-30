<goal>
- Make section-level data symbols (.data/.rodata/.sdata/.sdata2/.bss) first-class work targets in the existing worker pipeline, so the harness can drive units to 100% data (unblocking unit linking and text matching), in the style of doldecomp/melee PR #3210.
- Fully remove board priority/ranking logic: no closenessPriority, no graph rank features, no risk penalties. Admission pipes every open candidate through in report order; an optional cap flag limits batch size. Claim order is admission order with same-file claim exclusivity.
- Owned surface: apps/server/src/core/cycle-runtime (board, scheduler, run-state, epochs), agent-catalog worker (packet, prompt, change-validation, micro-gates), knowledge/board + graph rank queries, related tests.
</goal>

<context_refresh>
- Reread objectives/data-targets-and-ranking-removal/goal.md.
- Reread objectives/data-targets-and-ranking-removal/current_state.md.
- Reread objectives/data-targets-and-ranking-removal/context/00_problem.md through 04_validation_and_handoff.md (02 has the exact file:line collision map).
</context_refresh>

<working_strategy>
- Phase A first (ranking removal): it deletes three data-target blockers outright (dataRiskPenalty, rank-miss degradation, read_only_complete candidate splice). Phase B (data targets) lands on the simplified board.
- Phase A: strip priority from candidates.ts; drop withRankFeatureProvider and graph rank queries; admit all open candidates in report enumeration order (admissionIndex = enumeration order) with optional cap flag (default: no cap); claim ORDER BY active_source_claims, admission_index and promote active_source_claims to a WHERE predicate (same-file exclusivity); sweep priority consumers (packet, dashboard, schema columns default to 0, no migration).
- Phase B: enumerate unit.sections (non-.text, size>0, fuzzy<100) as candidates with kind "section"; extend loadExactTargetKeys to sections; change-validation targetScore falls back to rows.sections for dot-prefixed symbols; regression carve-out tolerating non-exact same-unit function fuzz for section targets; unify exact thresholds on EXACT_SCORE=99.99999; disable the three banned-idiom rules for section targets; packet/prompt data-target branch (.bss = declarations only; skip m2c/permuter).
- All implementation via codex exec (gpt-5.6-sol, effort low unless a change proves interlocking); Fable plans/reviews only.
</working_strategy>

<success_metrics>
- Board snapshot from a real report.json yields section candidates for units with incomplete data, including units at 100% code.
- A worker attempt on unit::.sdata2 that improves the section score gets verdict passed (not no_official_score_change) and banks at boundary.
- No priority computation remains reachable; admission count equals open-candidate count when no cap flag is set.
- Two targets sharing a source file are never claimed concurrently.
</success_metrics>

<non_goals>
- No new tools; function-param tools stay unchanged (data workers simply do not use them).
- No decomp.me integration, no per-symbol data granularity (section-level only), no dashboard redesign beyond removing priority fields.
- No DB migrations; priority columns remain, written as 0.
</non_goals>

<completion_criteria>
- Phase A and B changes merged with tests: change-validation section verdict + carve-out + threshold, boundary-model unit::.bss round-trip, board test for section-candidate emission, claim-exclusivity test.
- bun test passes for apps/server; existing function-target flow verified unregressed via one shakedown epoch on the melee run.
- current_state.md updated with outcomes and any deferred items.
</completion_criteria>
