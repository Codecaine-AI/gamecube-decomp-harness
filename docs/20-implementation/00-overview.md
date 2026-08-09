---
concepts: [implementation, source-layout, server, agents, state, knowledge, ui]
---

# Implementation Overview

Current D-Comp Orchestrator source tree and implementation sections.

The package is organized as a Bun workspace around two first-party apps:
`apps/frontend` for the React/Vite dashboard and `apps/server` for API routes,
operator jobs, orchestration, validation, handoff, agents, tools, knowledge,
project resolution, and platform helpers. The server owns its Melee-specific
Agent Kernel runtime bridge under `apps/server/src/infrastructure/kernel/bridge`;
the external kernel packages live under `packages/agent-kernel`. Project
descriptors and project-local runtime workspaces live under top-level `projects/`.

## File Tree

```text
decomp-orchestrator/
+-- README.md
+-- package.json
+-- apps/
|   +-- frontend/
|   +-- server/
+-- docs/
+-- packages/
|   +-- agent-kernel/
+-- objectives/
+-- projects/
+-- tsconfig.base.json
```

## Section Scope

### What This Section Owns

- Source layout and package boundaries.
- Project descriptor and workspace boundaries at the repository root.
- How server jobs, process guardians, agents, state, board, shell helpers,
  knowledge loading, and the dashboard fit together.
- Current implementation references for maintainers.

### What This Section Does Not Own

- Repo-wide Melee docs.
- Generated run state, SQLite databases, prompt artifacts, or PR dump contents.
- System-level design language that belongs in
  [../10-system-design/00-overview.md](../10-system-design/00-overview.md).

## Child Sections

- [Agents](10-agents/00-overview.md): worker, integration resolver, PR indexer,
  PR splitter, PR reviewer, PR fixer, knowledge-curator, reconcile, QA repair,
  and runtime prompt/session code.
- [Server jobs](20-server-jobs/00-overview.md): operator job surface and feature-owned job modules.
- [Knowledge](30-knowledge/00-overview.md): sectioned knowledge sources,
  tool-backed resources, resource graph, agent context routing, and past PR library.
- [State](40-state/00-overview.md): SQLite schema, state helpers, epochs,
  target claims, worker states, checkpoints, events, runs, and status.
- [Tools](50-tools/00-overview.md): reusable GameCube decomp toolpack, project
  tool bindings, agent tool wrappers, and validation tools.
- [UI](60-ui/00-overview.md): dashboard server, process controls, collapsible
  rails, and PR handoff controls.
- [Appendix](99-appendix/00-overview.md): preserved operational notes, design
  traceability, and historical run analysis.
- [Current repo mechanics](99-appendix/20-current-repo-mechanics.md): Melee
  report/objdiff/configure/progress surfaces that the orchestrator wraps.
- [Implementation roadmap](99-appendix/30-implementation-roadmap.md): original
  phases, current status, and v1 defaults.
- [Design coverage audit](99-appendix/40-design-coverage.md): traceability from
  every HTML design section to the markdown docs.
- [Pi agent run reports](99-appendix/50-pi-agent-run-reports.md): historical
  Pi worker-run outcome analysis, tool-effectiveness reporting, and
  deterministic validation logging requirements from Melee runs.
