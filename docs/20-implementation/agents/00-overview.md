---
covers: Centralized agent implementation layout and boundary from trigger/guardian process actors
concepts: [agents, prompt-builders, runtime, registry, process-actors, vertical-slice]
code-ref: decomp-orchestrator/packages/agents/src
---

# Agents: Overview

Agent implementation is centralized under `packages/agents/src/`. Each role owns its
prompt builder, templates, schema or output parsing, and role-specific helpers.
Shared Pi invocation, artifact writing, prompt rendering, and JSON-output
salvage live in the runtime slice.

Trigger and guardian process actors are not implemented in `packages/agents/src/`
because they are not Pi agent roles. They live in the CLI/runtime command
surface and operate on process events and durable state.

## File Tree

```text
packages/agents/src/
+-- index.ts
+-- registry.ts
+-- types.ts
+-- context.ts
+-- context/
|   +-- manifest.json
+-- director/
|   +-- index.ts
|   +-- output.ts
|   +-- prompt.ts
|   +-- templates/
+-- worker/
|   +-- index.ts
|   +-- output.ts
|   +-- packet.ts
|   +-- prompt.ts
|   +-- context/
|   +-- templates/
+-- pr-review/
|   +-- index.ts
|   +-- prompt.ts
|   +-- schema.json
|   +-- templates/
+-- qa-repair/
|   +-- index.ts
|   +-- prompt.ts
|   +-- schema.json
|   +-- templates/
+-- knowledge-curator/
|   +-- index.ts
|   +-- prompt.ts
|   +-- schema.json
|   +-- templates/
+-- reconcile/
|   +-- index.ts
|   +-- prompt.ts
|   +-- schema.json
|   +-- templates/
+-- runtime/
    +-- artifacts.ts
    +-- index.ts
    +-- output-json.ts
    +-- pi-agent.ts
    +-- prompt-renderer.ts
```

## Section Scope

### What This Section Owns

- The central agent registry.
- Role prompt builders and templates.
- Output parsing and agent response contracts.
- Shared runtime integration with dry-run and live Pi sessions.

### What This Section Does Not Own

- SQLite state transitions after a parsed response.
- Trigger loops, guardian wrappers, restart policy, and lease-recovery command
  orchestration.
- Board target ranking logic.
- Knowledge file contents, except for selecting and rendering them into prompts.

## Child Nodes

- [Director and worker agents](10-director-worker.md)
- [PR-review agent](20-pr-review.md)
- [Knowledge-curator agent](25-knowledge-curator.md)
- [Agent runtime](30-runtime.md)

## Reconcile Agent

`packages/agents/src/reconcile/` defines the operator-triggered reconcile agent
with two modes. `ship-validate` consumes the latest `regression-check` summary
and fixes broken matches, fuzzy regressions, and metric regressions until the
QA gate is clean or its attempt budget escalates. `sync-merge` runs after an
upstream pull/intake: it resolves merge conflicts, prefers upstream for
duplicate matches (recording the local attempt as a carry-forward lesson), and
fixes build errors against the new baseline. The CLI exposes it as the
`reconcile` command; the dashboard exposes it via `POST /api/pr/reconcile`.
Both refuse to run while the run status is `active`.

## QA Repair Agent

`packages/agents/src/qa-repair/` defines the candidate-file QA repair agent
used during PR handoff. It receives one `qa_repair_queue_item_v1` item plus a
queue summary, fixes only the listed deterministic QA findings, and returns the
`melee_qa_repair_result_v1` JSON contract. The runner owns final status:
agent output must parse against the schema, then the CLI reruns the QA scanner
before a file can become `clean_same_match` or `clean_lower_score`.

The role has its own `qa-repair` tool profile, registry entry, prompt tests,
and Agent Viewer preview. Its prompt includes global decomp standards, the
queue item, the queue summary, the attached tool list, and the output schema so
preview rendering stays aligned with live prompt construction.
