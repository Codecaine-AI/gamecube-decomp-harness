---
covers: Shared agent runtime, rendered prompt artifacts, dry-run/live Pi adapter, and JSON salvage
concepts: [agent-runtime, pi-sdk, dry-run, artifacts, prompt-rendering]
code-ref: decomp-orchestrator/src/agents/runtime
---

# Agent Runtime

The runtime slice is the shared path for invoking Pi agents and writing prompt
artifacts. Role slices build prompts and parse outputs; the runtime handles the
common mechanics.

## Files

| File | Purpose |
| --- | --- |
| `src/agents/runtime/artifacts.ts` | Builds artifact paths for rendered prompts and outputs. |
| `src/agents/runtime/output-json.ts` | Salvages structured JSON from agent responses. |
| `src/agents/runtime/pi-agent.ts` | Calls live Pi sessions or writes dry-run outputs. |
| `src/agents/runtime/prompt-renderer.ts` | Renders template strings with prompt input data. |
| `src/agents/runtime/index.ts` | Re-exports runtime helpers. |

## Behavior

Dry-run mode writes the rendered prompts and a synthetic Pi output artifact
without calling the Pi SDK. Live mode uses the same rendered prompt pair and
passes provider, model, thinking level, timeout, cwd, and session metadata
through the Pi adapter.

## Key Rules

- Dry-run and live mode must share prompt rendering.
- Rendered system and user prompts are persisted for auditability.
- Runtime code should remain role-neutral.
- Output parsing belongs in agent slices unless the behavior is generic JSON
  salvage.

## Related

- [Agents overview](00-overview.md)
- [CLI overview](../cli/00-overview.md)
