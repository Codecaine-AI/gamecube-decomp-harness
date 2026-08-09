---
covers: Worker-facing tool discoverability for decomp knowledge tools
concepts: [worker-tools, available-tools, knowledge-tools, prompt-surface]
code-ref: apps/server/src/core/tools/profiles, apps/server/src/core/tools/wrappers, apps/server/src/core/agent-catalog/agents/running/worker/context.ts
---

# Worker Tooling Prompt Surface

Date: 2026-06-07

Status: implemented in the worker prompt surface. This note remains as the audit
trail for the worker-facing tooling gap and describes the current prompt contract.

## Current Contract

Worker launches attach first-class Pi tools from the default worker tool profile.
The worker user prompt also includes a generated `<available_tools>` block so the
prompt artifact names the same callable tools in a compact, readable form.

`apps/server/src/core/tools/profiles/defaults.ts` owns the default
role tool bundles, including worker tool order.

Wrapper-local metadata files own the worker-facing `provider`, `type`, and
`useWhen` labels used by the prompt:
`apps/server/src/core/tools/metadata/knowledge.ts` for
knowledge-source wrappers and
`apps/server/src/core/tools/metadata/capabilities.ts` for
callable decomp capabilities.

`apps/server/src/core/tools/profiles/index.ts` resolves the active
profile, builds the actual Pi tool definitions, and renders
`<available_tools>` from those resolved tools. This keeps the prompt text
aligned with the tools Pi can call.

`apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` owns the universal worker
contract: edit boundary, evidence priority, validation, local regression ledger,
stop conditions, and JSON output shape.

`apps/server/src/core/agent-catalog/agents/running/worker/context.ts` owns the
target packet: current state, available tools, standards, embedded target file,
and the task.

## Worker Tool Policy

The tool table is an affordance guide, not source proof. Local source, headers,
symbols, splits, assembly, objdiff, and regression output outrank tool results
and external hints.

Useful tool results should answer a bounded target question:

- What does the graph know about this file, symbol, or related file?
- Has prior PR work touched this source slice, tactic, or review risk?
- Is an address, offset, action state, instruction, or external name documented?
- Does a similar opcode shape, mismatch pattern, type span, or MWCC diagnostic
  explain the next concrete source hypothesis?
- Does narrow validation pass for the target and affected neighbors?

Retained edits still need local validation evidence. Broad or stale tool hints
should be reported as weak evidence rather than converted into source churn.

## Related

- [Knowledge overview](00-overview.md)
- `apps/server/src/core/tools/profiles/`
- `apps/server/src/core/tools/wrappers/knowledge.ts`
- `apps/server/src/core/tools/wrappers/capabilities.ts`
- `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts`
- `apps/server/src/core/agent-catalog/agents/running/worker/context.ts`
