---
covers: Centralized agent implementation layout and boundary from trigger/guardian process actors
concepts: [agents, prompt-builders, runtime, registry, process-actors, vertical-slice, kernel-context]
code-ref: decomp-orchestrator/apps/server/src/core/agent-catalog, decomp-orchestrator/apps/server/src/infrastructure/agent-runtime, decomp-orchestrator/apps/server/src/infrastructure/kernel/bridge
---

# Agents: Overview

Agent definitions live together in `apps/server/src/core/agent-catalog`.
The catalog is sectioned by workflow area: `agents/running`, `agents/pr`, and
`agents/knowledge`. Phase runtimes and jobs call into the catalog, but the
prompt builders, schemas for roles that own structured results, examples,
registry, context manifest, kernel catalog conversion, and dashboard preview
payload all stay next to each other.

Kernel/Pi invocation, artifact writing, prompt rendering, Pi-session state,
and JSON-output salvage live under `apps/server/src/infrastructure/agent-runtime`.

Trigger and guardian process actors are not agent roles. They live with the
phase that owns the workflow action, such as running process control under the
running phase and PR handoff jobs under the PR phase.

## File Tree

```text
apps/server/src/
+-- core/agent-catalog/
|   +-- index.ts
|   +-- registry.ts
|   +-- types.ts
|   +-- context.ts
|   +-- context/manifest.json
|   +-- kernel-catalog.ts
|   +-- kernel-preview.ts
|   +-- agents/
|       +-- running/
|       |   +-- integration-resolver/
|       |   +-- worker/
|       +-- pr/
|       |   +-- fixer/
|       |   +-- qa-repair/
|       |   +-- reconcile/
|       |   +-- reviewer/
|       |   +-- splitter/
|       +-- knowledge/
|           +-- curator/
|           +-- pr-indexer/
+-- core/tools/
+-- core/session-runtime/phases/
+-- core/knowledge/
+-- infrastructure/agent-runtime/
|   +-- kernel-pi-runner.ts
|   +-- runtime/
|   +-- state/
+-- infrastructure/kernel/
    +-- bridge/
```

## Section Scope

### What This Section Owns

- The central agent registry.
- The app-owned role catalog for current Pi agent roles.
- Role prompt builders and canonical typed agent files.
- Output parsing for roles with structured result contracts, plus advisory note
  parsing where a runtime records metadata without giving the agent report
  ownership.
- Tool profile metadata used by role prompt builders.

### What This Section Does Not Own

- SQLite state transitions after a parsed response.
- Trigger loops, guardian wrappers, restart policy, and claim-recovery command
  orchestration.
- Board target ranking logic.
- Knowledge file contents, except for selecting and rendering them into prompts.
- Kernel/Pi process execution, which is infrastructure.

## Child Nodes

- [Worker agents, integration resolver, and scheduler delegation](10-director-worker.md)
- [PR indexer, splitter, and reviewer agents](20-pr-review.md)
- [Knowledge-curator agent](25-knowledge-curator.md)
- [Agent runtime](30-runtime.md)

## Kernel Catalog And Context Contract

`apps/server/src/core/agent-catalog/kernel-catalog.ts` is the app-owned kernel
catalog conversion for the backend Pi roles. Each role owns the canonical
`agent.ts`, `prompt.ts`, `context.ts`, and `tools.ts` files: `agent.ts` defines
kernel metadata, `prompt.ts` owns the stable PromptKit system prompt and prompt
bundle entrypoint, `context.ts` declares loader inputs and builds the rendered
runtime context packet, and `tools.ts` declares the role tool surface. Each
phase job or backend command builds the same `PiPromptBundle` used for artifacts
and previews. Prompt builders attach `kernelContext` inputs from the context
module to that bundle, and the catalog converts those inputs into a kernel
`AgentContextResolver` alongside the `ParsedAgent` system prompt.

Live DB-backed spawns pass the resolver through the server kernel bridge into
`createSpawnAgent`. The kernel resolves `melee-session-context` plus the
role-specific inline inputs, emits context lifecycle events, injects the
assembled context as an `agent-context` custom message, and runs a short first
turn prompt that points at the injected context. The rendered context packet is
the audit artifact and dashboard preview context. Direct fallback paths that
cannot inject kernel context compose the rendered context with the short turn
prompt so dry-run and preview behavior still expose the full packet.

`contextLoaderKinds` is the stable manifest for the resolver inputs and viewer
summary. Keep dashboard Agent previews aligned with the prompt builders whenever
placeholders, prompt documents, or injected context change; raw
`{{PLACEHOLDER}}` text in `/api/kernel/agents` is a regression.

## PR Postmortem Agent Subprocess

The deterministic PR postmortem pipeline remains Python-owned for dump layout,
context construction, schema validation, and per-PR library writes. Live
model-reviewed postmortems enter the orchestrator through the internal
`kg-pr-indexer-agent` server job in `apps/server/src/core/knowledge/jobs/kg.ts`.

`kg-pr-indexer-agent` builds the same `prIndexerPrompt` used by the catalog,
passes role `pr-indexer` to `runMeleeKernelPiAgent()`, forces the kernel spawn
path for non-dry runs, attaches a `postmortem` spawn context, records the
resulting Pi session in harness state, and writes raw model output back to the
Python worker. The Python launcher forwards orchestrator state/run/project and
kernel DB settings so subprocess postmortems share the same app session,
container lineage, trace rows, and read API visibility as the rest of the
representative server job flow.

## Running Integration Resolver

`apps/server/src/core/agent-catalog/agents/running/integration-resolver/`
defines the pre-PR worker-output integration conflict agent. Its stable runtime
id is `integration-resolver`. The prompt receives one integration conflict queue
item plus a queue summary: failed `git apply` evidence, worker checkpoint ids,
explicit write sets, conflict paths, validation evidence, and conflict-group
metadata. It returns `melee_integration_resolver_result_v1` with worker-output
dispositions, path-level conflict resolutions, edits, validation rows, remaining
conflicts, carry-forward notes, and risks.

The runtime job `integration-resolve --item-file <path>` lives under the
running phase and spawns this agent with kernel kind `worker-integration`. The
runner still owns queue status updates, epoch acceptance, and full build/report
validation; clean worker checkpoint applies do not need this agent.

## PR Fixer, QA Repair, And Reconcile

`apps/server/src/core/agent-catalog/agents/pr/fixer/` defines the opened-PR
feedback fixer. Its stable runtime id is `pr-fixer`. The fixer receives
maintainer comments, review-thread findings, PR reviewer findings, diff
context, and validation evidence for one PR branch. It returns
`melee_pr_fixer_result_v1`: focused edits, validation rows, comment/finding
dispositions, remaining items, manual-review notes, and risks. The runner owns
remote PR state, including posting comments or marking threads resolved.

`apps/server/src/core/agent-catalog/agents/pr/qa-repair/` defines the bounded
QA repair queue surface.
Its stable runtime id remains `qa-repair` for compatibility with the existing
candidate-file repair lane. The fixer receives one repair item, fixes only the
listed deterministic findings, and returns the `melee_qa_repair_result_v1`
JSON contract. The runner owns final status: agent output must parse against
the schema, then the server job reruns the QA scanner before a file can become
`clean_same_match` or `clean_lower_score`.

The legacy reconcile prompt lives under
`apps/server/src/core/agent-catalog/agents/pr/reconcile/` and remains exported
as the PR phase reconcile prompt. It supports the existing operator-triggered
`reconcile` command while bundle-wide repair behavior stays separate from PR
comment fixing. `ship-validate` consumes the latest `regression-check`
summary; `sync-merge` runs after upstream sync fallout. Both refuse to run
while the run status is `active`.

The `pr-fixer` and `qa-repair` roles have separate tool profiles, registry
entries, prompt tests, and dashboard Agent prompt previews. Their context
packets include global decomp standards, targeted examples, attached tool lists,
and output schemas so preview rendering stays aligned with live context
construction.
