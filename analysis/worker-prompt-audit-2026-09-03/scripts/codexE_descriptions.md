# Task E: Drop the worker `<available_tools>` block; make tool schema descriptions carry the "when"

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed. Do NOT edit `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` (planner-owned; it now names the section `advanced_techniques`, not `advanced_tooling`). Do not touch `games/melee/**`.

## 1. Remove `<available_tools>` from the worker boot context
In `apps/server/src/core/agent-catalog/agents/running/worker/context.ts`, drop the `AVAILABLE_TOOLS_XML` block from the worker packet template for every budget (full/compact/minimal). The model receives the tool schema from the runtime; the block duplicated it. Delete the now-unused `availableToolsBudgetXml` and the `tools` budget field if nothing else reads it. Other roles' contexts are out of scope — leave `availableToolsPromptXml` itself in place if other agents use it.

## 2. Tool schema descriptions carry what + returns + when
For every tool in `defaultWorkerToolProfile` (`apps/server/src/core/tools/profiles/defaults.ts`), rewrite the `description` string that reaches the model's tool schema (in `apps/server/src/core/tools/wrappers/capabilities.ts`, `wrappers/knowledge-v2.ts`, and any other wrapper that registers a worker tool). Each description must be one to three sentences covering, in this order: (a) what it does, (b) what it returns and what it cannot tell you, (c) when in the diff-first loop to use it. Fold in the current `useWhen` text from `apps/server/src/core/tools/metadata/*.ts` where it adds the "when"; keep the `useWhen` metadata fields in place (other consumers render them) but they are no longer the worker's source. Be factual — the return-shape and limit claims must match the implementations (see `analysis/worker-prompt-audit-2026-09-03/C-tooling-reference.md` for each tool's real contract; e.g. `mwcc_alloc_snapshot` is GPR-only, `source_permuter_run` returns a scalar score and one source diff, `checkdiff_run` `full_diff` returns up to 24 rows with left=target/right=current, `direct_compile_tu` takes exactly one of `function`/`unit`, `attempt_search` returns run narratives with hits). Keep each under ~400 characters. No marketing words; no "last resort".

## 3. Tests
- `prompt.test.ts`: replace assertions on `<available_tools` / `compacted="true"` tool blocks with `not.toContain("<available_tools")`; rename any `advanced_tooling` assertion to `advanced_techniques`; keep everything else.
- `kernel-catalog.test.ts` / `kernel-preview.ts`: adjust only what breaks.
- Wrapper/metadata tests that snapshot descriptions: update to the new strings.
- Run `cd apps/server && bun test src/core/agent-catalog src/core/tools src/core/knowledge-v2 src/core/cycle-runtime/phases/running/workers src/infrastructure/kernel` — all green — and the repo typecheck (known pre-existing errors only).

## 4. Output
Write `analysis/worker-prompt-audit-2026-09-03/tool-descriptions.md`: a table of every worker tool with its new description (this is the audit input the operator asked for). Print a summary and DONE.
