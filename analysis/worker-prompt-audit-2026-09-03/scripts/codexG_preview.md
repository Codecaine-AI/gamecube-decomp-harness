# Task G: Kernel preview renders the worker context for a REAL target

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Do NOT edit `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` or `context.ts`. Do not modify `games/melee/**` (read-only). Use sub-agents / parallel execution where useful.

## Goal
`apps/server/src/core/agent-catalog/kernel-preview.ts` builds the worker preview from a synthetic `ftDemo_KernelViewerSample` packet, so the dashboard preview never shows real links, facts, prior runs, or related functions. Make the worker preview use a real target by default, with an optional selector.

## Changes
1. Add a preview option `target?: { unit: string; symbol: string }` (thread it through `KernelPreviewDeps`/the preview entry point and the API route that serves the kernel preview — find it with `grep -rn "kernel-preview\|buildKernelPreview" apps/server/src/api`; accept `?target=<unit>:<symbol>` on that route). Default when absent: `main/melee/mn/mnvibration:mnVibration_HandleInput` (an unmatched target with links, facts, and 16 narrated prior runs).
2. For the worker case, build the packet from real data, exactly like the runner does in `worker-cycle.ts` around `buildWorkerKnowledgeContext` and `workerPacket`:
   - `target`: unit, symbol, `source_path` resolved from the V2 store's unit locator (`loadV2TargetCard(...).target.source_path`) or the legacy graph; `fuzzy_match_percent` from `target_status`.
   - `knowledge_context`: `buildWorkerKnowledgeContext(source_path, graphDbPath, { unit, symbol, gameId })` — this yields `knowledge_card_v2`, `related_functions`, `file_card`.
   - `targetSourceText`: read `games/melee/checkout/<source_path>` from the repo root (fall back to a one-line placeholder if missing).
   - `first_diff`: if a `pre_worker_first_diff.json` exists for that symbol under `games/melee/state/runs/*/worker_state/*/runner_validation/` (newest by mtime; match on the artifact's symbol field or its sibling `pre_worker_unit_snapshot.json`), load it; otherwise `{ status: "unavailable", reason: "preview: no claim-time diff artifact for this target" }`.
   - Keep the existing synthetic packet as the fallback when the knowledge store or checkout is unavailable (tests run without them) — select it when `loadV2TargetCard` returns null AND the checkout file is missing.
3. Tests: `kernel-catalog.test.ts` / any preview tests must keep passing offline (use the fallback path); add one test that, given a stubbed store handle or the fixture flag, the selector is threaded through.
4. Run `cd apps/server && bun test src/core/agent-catalog src/api` — green. Print the route/query-param usage and DONE.
