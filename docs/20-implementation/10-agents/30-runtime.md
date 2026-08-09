---
concepts: [agent-runtime, pi-sdk, dry-run, artifacts, prompt-rendering, kernel-context]
---

# Agent Runtime

Shared agent runtime, rendered prompt artifacts, dry-run/live Pi runner, kernel context bridge, and JSON salvage.

Sources: [apps/server/src/infrastructure/agent-runtime/runtime](/apps/server/src/infrastructure/agent-runtime/runtime), [apps/server/src/infrastructure/agent-runtime/kernel-pi-runner.ts](/apps/server/src/infrastructure/agent-runtime/kernel-pi-runner.ts), [apps/server/src/infrastructure/kernel/bridge](/apps/server/src/infrastructure/kernel/bridge).

The runtime slice is the shared path for invoking Pi agents and writing prompt
artifacts. Role slices build prompts and parse outputs; the runtime handles the
common mechanics.

## Files

| File | Purpose |
| --- | --- |
| `apps/server/src/infrastructure/agent-runtime/runtime/artifacts.ts` | Builds artifact paths for rendered prompts and outputs. |
| `apps/server/src/infrastructure/agent-runtime/runtime/output-json.ts` | Salvages structured JSON from agent responses. |
| `apps/server/src/infrastructure/agent-runtime/runtime/pi-agent.ts` | Calls live Pi sessions or writes dry-run outputs. |
| `apps/server/src/infrastructure/agent-runtime/runtime/prompt-renderer.ts` | Renders template strings with prompt input data. |
| `apps/server/src/infrastructure/agent-runtime/runtime/index.ts` | Re-exports runtime helpers. |
| `apps/server/src/infrastructure/agent-runtime/kernel-pi-runner.ts` | Converts catalog prompt bundles into kernel spawn inputs and chooses dry-run/direct or DB-backed kernel spawn behavior. |
| `apps/server/src/infrastructure/kernel/bridge/spawn-agent.ts` | Bridges converted agents, context resolvers, tools, session binding, prompt artifacts, and trace writers into `createSpawnAgent`. |
| `apps/server/src/infrastructure/kernel/bridge/loaders.ts` | Registers Melee session and inline context loaders for kernel context resolution. |

## Behavior

Dry-run mode writes the full rendered prompts and a synthetic Pi output
artifact without calling the Pi SDK. DB-backed live mode uses kernel
`createSpawnAgent` through the server-local kernel bridge: converted catalog
agents read each role's typed `agent.ts` definition, provide the rendered
PromptKit system prompt as `ParsedAgent.body`, pass a short first-turn prompt,
and attach an optional `AgentContextResolver` built from
`PiPromptBundle.kernelContext`.

When a resolver is present, the server bridge passes it to the kernel spawn
pipeline. The kernel resolves the declared context inputs, emits context
lifecycle trace events, injects the assembled context into the Pi session, and
then triggers the short turn prompt. Prompt artifacts still persist the full
rendered context packet so dry-run, audit, and dashboard previews show the
complete injected input.

## Key Rules

- Dry-run and live mode must share prompt rendering.
- Rendered system and user prompts are persisted for auditability.
- Resolver-aware live spawns must pass `AgentContextResolver` through the
  server kernel bridge; dry-run/direct paths must compose the rendered context
  packet with the short turn prompt when they cannot inject context.
- Runtime code should remain role-neutral.
- Output parsing belongs in agent slices unless the behavior is generic JSON
  salvage.

## Related

- [Agents overview](00-overview.md)
- [Server jobs overview](../20-server-jobs/00-overview.md)
