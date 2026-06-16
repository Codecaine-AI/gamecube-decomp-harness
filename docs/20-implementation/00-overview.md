---
covers: Current D-Comp Orchestrator source tree and implementation sections
concepts: [implementation, source-layout, cli, agents, state, knowledge, ui]
code-ref: decomp-orchestrator/
---

# Implementation Overview

The package is organized as a Bun workspace. App entrypoints live under
`apps/`, reusable TypeScript runtime code lives under `packages/`, and
repo-level data such as knowledge corpora, docs, tests, and objectives stays at
the repository root. Project descriptors and project-local runtime workspaces
live under `projects/`.

## File Tree

```text
decomp-orchestrator/
+-- README.md
+-- package.json
+-- decomp-orchestrator-design.html
+-- apps/
|   +-- cli/
|   +-- dashboard/
|   +-- dashboard-server/
+-- docs/
+-- knowledge/
+-- packages/
|   +-- agents/
|   +-- core/
|   +-- knowledge/
|   +-- ui-contract/
+-- objectives/
+-- projects/
+-- testdata/
+-- tests/
+-- tsconfig.base.json
```

## Section Scope

### What This Section Owns

- Source layout and package boundaries.
- Project descriptor and workspace boundaries at the repository root.
- How the CLI, process guardians, agents, state, board, shell helpers, and
  knowledge loader, and dashboard fit together.
- Current implementation references for maintainers.

### What This Section Does Not Own

- Repo-wide Melee docs.
- Generated run state, SQLite databases, prompt artifacts, or PR dump contents.
- System-level design language that belongs in
  [../10-system-design/00-overview.md](../10-system-design/00-overview.md).

## Child Sections

- [Agents](agents/00-overview.md): worker, PR-review, knowledge-curator,
  reconcile, QA repair, and runtime prompt/session code.
- [CLI](cli/00-overview.md): operator command surface and command modules.
- [Knowledge](knowledge/00-overview.md): sectioned knowledge sources,
  CLI-first tools, resource graph, agent context routing, and past PR library.
- [State](state/00-overview.md): SQLite schema, state helpers, leases, events,
  reports, runs, and status.
- [UI](ui/00-overview.md): dashboard server, process controls, collapsible
  rails, and PR handoff controls.
- [Appendix](99-appendix/10-design-source.md): original design source and
  preserved HTML artifact.
- [Current repo mechanics](99-appendix/20-current-repo-mechanics.md): Melee
  report/objdiff/configure/progress surfaces that the orchestrator wraps.
- [Implementation roadmap](99-appendix/30-implementation-roadmap.md): original
  phases, current status, and v1 defaults.
- [Design coverage audit](99-appendix/40-design-coverage.md): traceability from
  every HTML design section to the markdown docs.
- [Pi agent run reports](99-appendix/50-pi-agent-run-reports.md): worker report
  outcome analysis, tool-effectiveness reporting, and deterministic validation
  logging requirements from active Melee runs.
