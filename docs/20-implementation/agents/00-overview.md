---
covers: Centralized agent implementation layout
concepts: [agents, prompt-builders, runtime, registry, vertical-slice]
code-ref: decomp-orchestrator/src/agents
---

# Agents: Overview

Agent implementation is centralized under `src/agents/`. Each role owns its
prompt builder, templates, schema or output parsing, and role-specific helpers.
Shared Pi invocation, artifact writing, prompt rendering, and JSON-output
salvage live in the runtime slice.

## File Tree

```text
src/agents/
+-- index.ts
+-- registry.ts
+-- types.ts
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
|   +-- templates/
+-- pr-review/
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
- Board target ranking logic.
- Knowledge file contents, except for selecting and rendering them into prompts.

## Child Nodes

- [Director and worker agents](10-director-worker.md)
- [PR-review agent](20-pr-review.md)
- [Agent runtime](30-runtime.md)
