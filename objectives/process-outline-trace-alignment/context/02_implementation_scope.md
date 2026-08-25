# Implementation Scope

## Owned Surfaces

- `docs/**/doc.json`: inventory and rebuild all Process Outline block graphs, including the global-flow structure and misuse conversions.
- `apps/server/src/infrastructure/kernel/bridge/session-mapping.ts`: container kinds, display labels, and parent mapping.
- `apps/server/src/infrastructure/kernel/bridge/spawn-context.ts`: run, Epoch, Worker, PR, Sync, and related lineage.
- `apps/server/src/infrastructure/kernel/bridge/workflow-trace.ts`: application event names and process-visible trace emission.
- `apps/server/src/infrastructure/kernel/spawn-agent.ts`: agent-spawn trace context and missing process containers where this entry point owns them.
- `apps/frontend/src/pages/workspace/trace/index.tsx`: pass containers to `buildTraceSpans` and render the hierarchy already represented by trace data.
- Harness `docs-structure.md`: document the final global-flow and subprocess convention.

## Cross-Repo Follow-On

- Peer repo `Core/docs-system/docs/10-system-design/40-block-vocabulary/90-process-outline`: update the Process Outline vocabulary doctrine after the harness convention is proven. This doctrine page is the only authorized cross-repo edit in the objective.
- Peer repo `Core/observatory`: use as a read-only reference for container-aware span building and hierarchy rendering.

## Produced Artifacts

- `objectives/process-outline-trace-alignment/context/05_process_map.md`: durable decisions, full inventory, naming winners, severity catalog, and per-process verification evidence.
- Updated nearby Bun tests for container descriptions, lineage, event mapping, prompt or catalog context if touched, and frontend span construction.

## Out of Scope

- Process Outline edits in Core or any other repository.
- Behavior-bug repairs found while tracing a process. Record them with severity and a follow-up owner or thread.
- An embedded trace player or trace snapshot inside docs.
- Starting a dashboard or UI server. Assume the existing UI server is running unless the operator asks otherwise.
