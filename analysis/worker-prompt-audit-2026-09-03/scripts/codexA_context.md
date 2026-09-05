# Task A: Worker boot context — first diff, single knowledge card, no legacy graph card

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

Files you own: `apps/server/src/core/agent-catalog/agents/running/worker/context.ts`, `prompt.test.ts`, `packet.ts`, `change-validation.ts` (+ its tests), `apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts` (only the two spots named below), `apps/server/src/core/agent-catalog/kernel-preview.ts` and `kernel-catalog.test.ts` (both already have uncommitted edits from other work — make the smallest possible additional edits and do not revert anything there). Do NOT edit `prompt.ts` (already rewritten by the planner; treat it as fixed input) and do NOT edit `apps/server/src/core/knowledge-v2/**` (another task is adding `prior_runs`, `accepted_prs`, fact `evidence`, and a character budget to `card.ts`; if those fields are not present yet when you run, code defensively against their absence and note it).

Read first: `analysis/worker-prompt-audit-2026-09-03/worker-prompt-and-context-changes.md` §4 (context changes) and `B-worker-prompt-audit.md` §2 and §7 (current injected blocks; which tests pin what). Then read the new `prompt.ts` — its `context_contract` names exactly two contexts: `worker-packet` and `target-knowledge-card-v2`, and refers to a `first_diff` block inside the packet.

## Changes

### 1. Retire the legacy graph file card from the boot context
- Remove the `knowledge-graph-file-card` loader declaration and the `<target_graph_file_card>` block. Delete `compactTargetGraphFileCard`, `searchLeads`, `followUpQueries`, the opseq projection (`tool_id === "opseq"`, `top_opseq_analog`, `opseq_analogs`), and everything else that only served that block. Keep `workerPromptInputXml`'s exported shape working (drop `targetGraphFileCardXml` from `WorkerPromptInputXml`, update callers).
- Preserve the two useful items by folding them into the `<target>` block as attributes/children: `editability` (mode + reason) and `same_file_symbols` (up to 12). Source: `packet.knowledge_context.file_card` when present, otherwise the live legacy graph read that the old code did (`fileGraphCard`). If neither is available, omit them silently.
- Nothing in the boot context should emit "follow-up queries" or "search leads". The worker prompt tells the model which tools to call.

### 2. The V2 knowledge card becomes the single history block
- Prefer the runner's precomputed card: `packet.knowledge_context.knowledge_card_v2` (built in `worker-cycle.ts` `buildWorkerKnowledgeContext` at budget `full`). Fall back to `loadV2TargetCard` only when the packet has none. Re-project to the active budget when the packet card is `full` and the active budget is `compact`/`minimal` (call the card builder's budget re-projection if the other task exposes one; otherwise trim `ledger.entries`/`links` to the `BUDGET_CAPS` counts locally).
- Render it as `<target_knowledge_card_v2 context_budget="…">` with `details_json`, as today. When absent, render `<target_knowledge_card_v2 unavailable="true" reason="…"/>` so the model knows history was looked up and found empty (mirrors the old graph-card behavior; the prompt says "when the card is absent or thin, query the history tools yourself").
- Loader declaration: replace `knowledge-graph-file-card` with `target-knowledge-card-v2` (always present now, since an unavailable block is still emitted). Kernel-context inputs: `worker-packet`, `target-knowledge-card-v2`.

### 3. First diff at boot — `<first_diff>` inside the worker packet
- Data source: the runner already builds the object and runs `objdiff-cli report` in `captureWorkerChangeBaseline` (`change-validation.ts`). After the successful object build, also run the function-level diff and capture mismatch rows. Options, in order of preference: (a) `objdiff-cli diff` (check `build/tools/objdiff-cli` help / how `toolpacks/gamecube-decomp/validation/checkdiff/run.py` and `_impl/gamecube/tools/checkdiff.py:177-218` obtain instruction rows) for the target symbol, JSON output, parsed into rows `{ side: "left"|"right", address, kind, text }`; (b) invoke the checkdiff toolpack the same way the `checkdiff_run` wrapper does with `full_diff=true` and parse its row lines. Use whichever is already exercised by existing code paths; do not introduce a new subprocess contract if one exists.
- Add to `WorkerChangeBaseline` a `firstDiff: { status: "available"|"unavailable", reason?, score, rows: Row[], row_counts_by_kind: Record<string, number>, truncated: boolean } | null`, capped at 40 rows. Write it to `pre_worker_first_diff.json` beside the existing snapshot artifacts.
- In `worker-cycle.ts`, where `workerChangeBaseline` is captured (~line 1400) and `workerPacket(...)` is built, pass `firstDiff` into the packet as `packet.first_diff`. Update `packet.ts` (`workerPacket`) to accept and carry it.
- In `context.ts`, render `<first_diff status="available" score="…" rows="N" truncated="…">` with the rows as one line each (`left 8272: DIFF_ARG_MISMATCH lfs f3, lbl_804DA824@sda21`) and a `row_counts_by_kind` summary line, placed directly after `<baseline>` and before `<target …>`/`<target_file>`. Cap at 4,000 chars (`full`) / 2,000 (`compact`) / 800 (`minimal`; summary + first 6 rows). When unavailable, emit `<first_diff status="unavailable" reason="…"/>`.
- Dry-run agents and `build_failed` baselines produce `unavailable` with the reason; never throw.

### 4. Standards stay full
Do not change `decompStandardsBudgetXml` or the standards renderer. The full standards block remains at `full` budget.

### 5. Tests
- `prompt.test.ts`: the literal-string test at ~line 330+ pins old phase names and wording (`holistic_file_understanding`, `hypothesis_generation`, "Use opseq similarity leads…", "last resort", "Develop a few concrete hypotheses…", "Test the hypotheses with targeted deeper analysis."). Rewrite those assertions against the new `prompt.ts`: phase names `orient`, `exact_symbol_history`, `name_the_mechanism`, `one_edit_then_diff`, `escalate`; the `advanced_tooling` section; the stop rule; the permuter-as-probe rule; `context_usage` ids `worker-packet` and `target-knowledge-card-v2` (and `not.toContain('knowledge-graph-file-card')`); the section-target prompt still `not.toContain("holistic_file_understanding")` etc. Keep every assertion that still holds (Sudoku/author lines, m2c rule, find sweeps, canonical paths, handoff lines, widening/no-shims, runner ownership, absence of `checkpoint_note`, truncation and budget caps, prefetched source precedence).
- Loader/kernel-context assertions: inputs are now `[root…, "worker-packet", "target-knowledge-card-v2"]`; `<target_graph_file_card` must be absent; `"top_opseq_analog"`, `"follow_up_queries"`, `"search_leads"`, `"tool": "kv2_subject_record"` (as a follow-up query) must be absent from the rendered context; `<first_diff` present with both `available` and `unavailable` fixtures.
- `change-validation.test.ts`: add a test for `firstDiff` capture (mock the diff command like the existing objdiff report tests do) and for the unavailable path.
- `kernel-catalog.test.ts` / `kernel-preview.ts`: adjust only what breaks (e.g. an expected loader list or preview snapshot).
- Run: `cd apps/server && bun test src/core/agent-catalog src/core/cycle-runtime/phases/running/workers` and the repo typecheck (see package.json scripts). All green.

## Rules
- Keep the prompt-kit DSL and XML block style consistent with the existing renderer helpers (`jsonBlockXml`, `optionalAttribute`, `xmlText`).
- Do not rebuild or touch anything under `games/melee/`.
- Print a summary at the end: files changed, new packet field shape, rendered `<first_diff>` example from a test fixture, test results. Print DONE.
