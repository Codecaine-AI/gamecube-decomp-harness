# Implementation scope — file:line collision map

Verified 2026-08-30 by two exploration passes. Line numbers drift; symbol names
are the stable anchors. All paths relative to repo root.

## Phase A — ranking removal + flat admission

| # | Location | Change |
|---|----------|--------|
| A1 | `apps/server/src/core/cycle-runtime/phases/running/board/candidates.ts:36-58` | Delete `closenessPriority`; `candidateFromReportFunction` returns `{unit, sourcePath, symbol, size, fuzzy}` (keep `fuzzy < 100 && size > 0` filter). Drop `priority`/`reason`/`rank` from `TargetCandidate` (`apps/server/src/core/shared/types/board.ts:35-44`, incl. `BoardRankBreakdown`). |
| A2 | `apps/server/src/core/knowledge/board.ts:10` | Remove `withRankFeatureProvider` wrapper. Delete rank feature computation in `apps/server/src/core/knowledge/graph/queries/rank.ts` (~22 sub-scores, opseq stats, `dataRiskPenalty` at :322). Delete the editability splice at `board/snapshot.ts:231-234` (see A2b). |
| A2b | `apps/server/src/core/knowledge/graph/builders/code-graph.ts:90-97, 307-315` | `read_only_complete` derivation: verify `locked`/`blocked` are derived-only before full deletion; if operator-set anywhere, keep a thin path-based blocklist and delete the rest. |
| A3 | `apps/server/src/core/cycle-runtime/phases/running/scheduler/tick.ts:142-166, 167-213` + `run-state/epochs.ts:130-160` | Admission: all open candidates in report enumeration order; `admissionIndex` = enumeration order. Delete `candidateCap` (500) / `candidateMultiple` (4x) sizing. Add optional cap flag (run config / CLI, e.g. `epochTargetCap`), default unset = admit all; when set, first N by admission order. Delete `refreshEpochTargetPriorities` (`epochs.ts:540-579`). |
| A4 | `apps/server/src/core/cycle-runtime/run-state/worker-state.ts:297-340` | Claim query: `ORDER BY priority DESC` -> `ORDER BY admission_index ASC`; promote `active_source_claims` from ORDER BY tiebreaker to `WHERE active_source_claims = 0` (same-file exclusivity). |
| A5 | Consumer sweep | `grep -rn "priority" apps/server/src/core` + frontend. Known: worker packet (`agent-catalog/agents/running/worker/packet.ts:11-21` drops `priority`/`reason`), epoch_targets insert (`epochs.ts:381-459` writes 0), dashboard projections/columns (the "+N" column), `targets` table writes. Schema columns stay, written 0. |

## Phase B — section (data) targets

| # | Location | Change |
|---|----------|--------|
| B1 | `board/snapshot.ts:97-104` (+ JSONL fallback :157-181) | Second loop over `unit.sections`: non-`.text`, `size > 0`, `fuzzy < 100` -> candidate `{symbol: sectionName, kind: "section"}`. Add `kind: "function" | "section"` to candidate type + epoch_targets row (new nullable text column is acceptable if a schema change is unavoidable; prefer deriving kind from leading-dot symbol to honor no-migration constraint). |
| B2 | `board/snapshot.ts:118-141` `loadExactTargetKeys` | Also walk `unit.sections` so finished section targets auto-retire (pre-dispatch cancel at `epochs.ts:638-672` then works; avoids wasted sandboxes). |
| B3 | `agent-catalog/agents/running/worker/change-validation.ts:317-336` | `snapshotFromObjdiffReport`: when `params.symbol` starts with `.` (or function lookup misses), resolve `targetScore` from `rows.sections.find(name === symbol)`. Rows carry `{name, score, size}`; ladder (:643-666) then works unchanged. |
| B4 | `change-validation.ts:607-630, 661, 671-673` | Regression carve-out: for section targets, tolerate fuzzy movement on same-unit functions that were NOT exact in the baseline; exact functions stay protected. Keep section-kind compareRows as-is. Also review `:660` unit-metric rows (`matched_data_percent` self-regression during intentional data edits). |
| B5 | Thresholds | Unify on `EXACT_SCORE = 99.99999`: `change-validation.ts:28`, `micro-gates.ts:4`, bare `100.0` at `validation/objdiff/report.ts:405-406`, `section-measures.ts:43`, `snapshot.ts:137`, `code-graph.ts:90-91`. Single exported constant. |
| B6 | `agent-catalog/agents/running/worker/micro-gates.ts:183-286` | For section targets disable: `static_added_to_global_symbol` (:220-228), `/order/i` static rule (:229-232), `qualifier_changed_on_shared_global` (:262-286). Section-parity (:45-77) and undefined-symbols (:120-160) gates stay on. |
| B7 | `worker/packet.ts` + `worker/prompt.ts` | Packet carries kind + section name. Prompt: data-target branch — match the section by declaring/initializing remaining symbols from disassembly; `.bss` = declarations/order/size only; do not use m2c/permuter/mwcc-debug (function-param tools). |

## Verified non-issues (do not spend time here)

- `unit::.bss` targetKey: safe at all split sites (boundary-sync.ts:164,202;
  pr-worktrees.ts:200; score-tiers.ts:225; epoch-boundary.ts:169), DB schema
  (plain text, unique on (epoch_id, target_key)), commit-subject round trip.
- Merge/PR/integration flow: path-based, serialized (worker-output-queue.ts
  concurrencyLimit:1), symbol-agnostic. Conflicts route to agent resolution.
- Section-parity gate: only guards sections already 100% before the change; the
  target's own (sub-100%) section is skipped by design.
- undefined_symbols gate: data definitions remove undefineds, never add.
- Rank lookups on non-function symbols degrade silently (moot after Phase A).
- breakage-gate.ts:99 already classifies `.`-prefixed names as sections —
  precedent for kind-by-leading-dot.
