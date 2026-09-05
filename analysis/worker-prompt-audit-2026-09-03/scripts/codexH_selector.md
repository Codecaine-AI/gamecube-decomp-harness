# Task H: Agents page — preview-target selector

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Frontend only: `apps/frontend/src/pages/workspace/agents/index.tsx` and `apps/frontend/src/lib/api.ts` (+ tests if any). Do not touch server files (another task owns `kernel-preview.ts` and `routes/agents.ts`; the route already accepts `?target=<unit>:<symbol>` on `/api/kernel/agents` and defaults to `main/melee/mn/mnvibration:mnVibration_HandleInput`).

## Change
1. `fetchKernelAgents(form, options?: { target?: string })` appends `target=<value>` to the query when provided.
2. On the Agents page, above the `AgentCatalogViewer`, add a compact "Preview target" control: a text input (placeholder `unit:symbol`, e.g. `main/melee/mn/mnvibration:mnVibration_HandleInput`) with an Apply button and Enter-to-apply; persist the value in the page's URL search params (`?target=`) so a link is shareable, and re-fetch the payload when it changes. Show the server's warning string if the payload returns one for the worker (the existing `warnings` rendering covers it). Keep the existing style primitives used on that page (look at siblings under `pages/workspace/_components`) — no new dependencies.
3. Keep it visible for every agent tab but note in helper text that it only affects the worker preview.

## Verify
`bun run ui:check` (tsc for the frontend) passes; any existing frontend tests for the agents page pass. Print DONE.
