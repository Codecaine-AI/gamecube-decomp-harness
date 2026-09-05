# Task D: Retire legacy knowledge tools from the worker, rename the V2 tools, restructure the boot context

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

Do NOT edit `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` (already updated by the planner; treat as fixed input — it names the new tool ids and blocks). Do not touch `games/melee/**`. Files with uncommitted changes from other work (`git status`: librarian-v2, backfill, knowledge-v2 apply/drift, docs) may be edited only for the mechanical renames in part 1; make no other changes there.

## 1. Rename the V2 knowledge tools (global, mechanical)

| old id | new id |
|---|---|
| `kv2_subject_record` | `knowledge_record` |
| `kv2_attempt_search` | `attempt_search` |
| `kv2_pr_search` | `pr_search` |
| `kv2_discord_search` | `discord_search` |
| `kv2_wiki_search` | `wiki_search` |
| `kv2_resolve_locator` | `resolve_locator` |
| `kv2_entity_lookup` | `entity_lookup` |
| `kv2_unit_context` | `unit_context` |

Apply everywhere the id is a tool identifier: `apps/server/src/core/tools/metadata/knowledge-v2.ts`, `wrappers/knowledge-v2.ts`, `profiles/defaults.ts`, agent `coreTools` lists (worker, librarian-v2, backfill-librarian), librarian/backfill prompt strings, kernel-catalog test/preview, `roles` tests, and any docs under `docs/` that name them (`grep -rl kv2_ docs` — 8 files; BlockNote JSON: replace the `insert` text only). Keep TypeScript function names (`kv2AttemptSearch` etc.) as they are — only the model-facing ids and labels change. Labels: "PR Search", "Discord Search", "Wiki Search", "Attempt Search", "Knowledge Record", "Resolve Locator", "Entity Lookup", "Unit Context". After the rename, `grep -rn "kv2_" apps/server/src docs` must return nothing except `kv2-index`/`kg2` CLI names that are not tool ids.

## 2. Remove the legacy knowledge tools from the worker

Remove `code_graph_file_card`, `code_graph_search`, `knowledge_graph_search`, `graph_related_functions`, `past_prs_search` from `defaultWorkerToolProfile` and from the worker agent's `coreTools`. Leave them registered and available to the librarian/reconcile/QA/PR-splitter profiles (the legacy graph is still their source for callers/callees) — do not delete the tool implementations. Update the worker profile tests (`knowledge-roles.test.ts`, kernel-catalog test) accordingly.

## 3. Keep callers/callees/analogs without the tool: `related_functions` inside `<target>`

`buildWorkerKnowledgeContext` in `worker-cycle.ts` already opens the legacy graph. Add to `packet.knowledge_context` a `related_functions` object built from the same graph query `graph_related_functions` uses (`apps/server/src/core/tools/wrappers/knowledge.ts` / `core/knowledge/graph/...related-functions`): `{ callers: [{symbol, unit, matched}], callees: [...], analogs: [{symbol, unit, fuzzy_match_percent, score, exact_match}] }`, capped at 8 callers, 8 callees, 4 analogs (highest score first, prefer exact matches). In `context.ts`, render it inside `<target>` after `<same_file_symbols>` as `<related_functions>` with `<caller>`, `<callee>`, `<analog>` children. Omit silently when the graph is missing.

## 4. Restructure the boot context to: target → first diff → knowledge → standards → tools

New `WORKER_PACKET_CONTEXT_TEMPLATE` order and block set:

1. `<repair_request>` (only on repair)
2. `<target context_budget="…" fuzzy_match_percent="…" size="…">` — the `details_json`, `editability`, `same_file_symbols`, `related_functions`, and the `<target_file>` source, exactly as today. Fold the baseline score into a `baseline_fuzzy_match_percent` attribute on `<target>` and **drop the separate `<baseline>` block** (its board-wide totals are not target evidence). Drop the standalone `<context_budget>` block; keep `context_budget` as an attribute on `<target>` and add a one-line `note` attribute only for `compact`/`minimal` ("compact retry budget: read local files for full source").
3. `<first_diff>` — unchanged.
4. `<target_knowledge context_budget="…">` — rename from `target_knowledge_card_v2` (XML tag, loader kind `target-knowledge-card-v2` → `target-knowledge`, `MELEE_INLINE_CONTEXT_LOADER_KINDS`, kernel catalog registration, `kernel-preview.ts`). Unavailable form: `<target_knowledge unavailable="true" reason="…"/>`. Move it into the packet template so the order is enforced by the template, and keep it as its own kernel-context input.
5. `<decomp_standards>` — unchanged.
6. `<available_tools>` — unchanged content, but it must reflect the new worker profile (no legacy tools, new ids).
7. **Remove `<canonical_tool_paths>`** from the context. The sandbox already puts `build/binutils` and `build/tools` on PATH (`workerAgentToolEnvironment`) and exports the canonical path env vars; the prompt now carries a one-line rule instead. Keep `tool-paths.ts` and the env export as they are (other code reads the env); delete only the XML renderer and the `existingCanonicalToolPaths` prompt option if nothing else uses it (check `worker-cycle.ts` — the probe may stay for the env; the option on `WorkerPromptOptions` should go if unused).

## 5. Tests

- `prompt.test.ts`: update context assertions for the new order (`<target` before `<first_diff` before `<target_knowledge` before `<decomp_standards>` before `<available_tools`), absence of `<baseline>`, `<context_budget`, `<canonical_tool_paths>`, `relative_path="build/binutils…"`, `Broad find roots`; presence of `<related_functions>` with a fixture; loader kinds `["…root", "worker-packet", "target-knowledge"]`; `context_usage` ids `worker-packet` and `target-knowledge`; tool-name assertions use the new ids; no `kv2_`, no `graph_related_functions`, no `past_prs_search` anywhere in the rendered system prompt or context.
- Tool profile/role tests, kernel-catalog test, kernel bridge loaders test, knowledge-v2 wrapper tests.
- Run: `cd apps/server && bun test src/core/agent-catalog src/core/tools src/core/knowledge-v2 src/core/cycle-runtime/phases/running/workers src/infrastructure/kernel` — all green — and the repo typecheck (pre-existing `compile`-option and `api/cycle/routes.test.ts` errors are known; introduce none).

Print a summary: rename table applied, files changed, the new rendered block order from a fixture (first 40 lines), test counts. Print DONE.
