# Task K: Worker defaults → gpt-6-astra, medium thinking, 12 workers

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Do not touch `games/melee/**`. Use sub-agents / parallel execution where useful.

OpenAI's `gpt-6-astra` (reasoning effort values low/medium/high/xhigh/max; 1,050,000-token context; 128,000 max output; $10/$50 per 1M in/out) becomes the WORKER default. Only the worker: the librarian-v2, backfill-librarian, worker-summarizer agents, the sync/ingest defaults, and the build-fixer `codex exec` calls stay on `gpt-5.6-sol`.

## Server
1. `apps/server/src/core/agent-catalog/agents/running/worker/agent.ts`: `model: "codex-lb/gpt-6-astra"`, `thinking: "medium"`.
2. `apps/server/src/core/cycle-runtime/phases/preparing/runtime.ts` `initRunCommand`: defaults `body.model` → `"gpt-6-astra"`, `body.thinkingLevel` → `"medium"`.
3. `apps/server/src/core/cycle-runtime/run-state/runs.ts` ~line 560–570 (default configuration snapshot): `model: "gpt-6-astra"`, `thinking_level: "medium"`, and `desired_workers`/workers default 12 if it is defined there.
4. `apps/server/src/core/cycle-runtime/phases/running/process-command.ts` `runningScheduling`: default max workers 16 → 12.
5. If any server-side list validates model ids or thinking levels (grep `gpt-5.6-terra`, `"xhigh"`, `ThinkingLevel`), add `gpt-6-astra` and make sure `medium` is accepted; if none exists, say so.
6. Leave `DEFAULT_PI_MODEL` (`pi-agent.ts`) alone unless it is the only source of the worker default — check `run-loop.ts` `--worker-thinking-level` / worker model resolution and make the worker path resolve to the run's configuration snapshot as today.

## Frontend
7. `apps/frontend/src/components/app/_lib/runSettings.ts`: `RUN_MODEL_OPTIONS` = `["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra"]`; default `model: "gpt-6-astra"`; keep `schedulingForWorkers(12)`; default `thinkingLevel` for the run = `"medium"`; bump the saved-settings version constant (the comment says to bump it when defaults change) so stale saved settings reset; keep `syncModel`/`syncThinking` as they are.
8. `apps/frontend/src/components/app/index.tsx`: `DEFAULT_THINKING_LEVEL` `"xhigh"` → `"medium"`; review the line ~116 that coerces `medium` back to the default on a version mismatch so it does not undo the new default.
9. The thinking-level select must offer low / medium / high / xhigh (and `max` if the select is a free list) — check the options source.

## Tests
Update `process-command.test.ts`, `process-control/runtime.test.ts`, and any test pinning `"xhigh"` or `gpt-5.6-sol` as the worker default (4 files). Run `cd apps/server && bun test src/core/cycle-runtime src/core/agent-catalog` and `bun run ui:check` — green. Print a table of every default changed (file, before → after) and DONE.
