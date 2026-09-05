# Task F: target_knowledge is emitted twice in the kernel-context inputs — make it one block

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Do NOT edit `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts`. Do not touch `games/melee/**`.

## Problem
`buildWorkerKernelContext` in `apps/server/src/core/agent-catalog/agents/running/worker/context.ts` renders `{{TARGET_KNOWLEDGE_XML}}` inside the worker-packet template (so `renderedContext` is correct: target → first_diff → target_knowledge → decomp_standards) AND pushes a second kernel-context input `{ loaderKind: "target-knowledge", content: targetKnowledgeXml }`. Anything that iterates `inputs` (the dashboard/kernel preview via `renderKernelContextInputsPreview`, the `.system.md` preview) shows the knowledge block twice — once inside `<worker-packet>` and again as `<target-knowledge>` at the bottom.

## Fix
Make it one block: keep `target_knowledge` in the packet template (order matters and is already right) and remove the separate `target-knowledge` kernel-context input and its loader declaration from `context.ts`. The worker's kernel-context inputs become `[root…, "worker-packet"]`. Remove `target-knowledge` from `MELEE_INLINE_CONTEXT_LOADER_KINDS` in `apps/server/src/infrastructure/kernel/bridge/loaders.ts` and from the kernel-catalog required-loader registration / `kernel-preview.ts` only if nothing else references it (grep first; if the bridge requires every declared inline loader kind to be produced by some agent, delete the declaration; otherwise leave the constant but drop the worker's use). The `usesContext("target-knowledge")` in `prompt.ts` refers to the XML block inside the packet — that is fine and stays; if `context_usage` ids must match declared loader refs for a test, update that test to accept the packet-internal block (or make the packet loader carry a `refs` note) rather than reintroducing the duplicate input.

## Verify
- `renderedContext` contains `<target_knowledge` exactly once; `inputs` contain it exactly once (inside the worker-packet content).
- `renderKernelContextInputsPreview(inputs)` shows one `<worker-packet>` section with the four blocks in order and no trailing `<target-knowledge>` section.
- Update `prompt.test.ts`, `kernel-catalog.test.ts`, bridge loader tests. Run `cd apps/server && bun test src/core/agent-catalog src/infrastructure/kernel src/core/cycle-runtime/phases/running/workers` — all green.
Print a summary and DONE.
