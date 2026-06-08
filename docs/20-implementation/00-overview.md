---
covers: Current D-Comp Orchestrator source tree and implementation sections
concepts: [implementation, source-layout, cli, agents, state, knowledge, ui]
code-ref: decomp-orchestrator/
---

# Implementation Overview

The package is organized around runtime responsibilities instead of one large
orchestrator file. Agent slices live together, CLI commands are separated by
operator action, state code owns SQLite transitions, the UI exposes operator
control surfaces, and package knowledge lives outside `src/`.

## File Tree

```text
decomp-orchestrator/
+-- README.md
+-- package.json
+-- decomp-orchestrator-design.html
+-- docs/
+-- knowledge/
+-- src/
|   +-- agents/
|   +-- bin/
|   +-- board/
|   +-- cli/
|   +-- knowledge/
|   +-- shell/
|   +-- state/
|   +-- types/
|   +-- ui/
+-- testdata/
+-- tests/
```

## Section Scope

### What This Section Owns

- Source layout and package boundaries.
- How the CLI, process guardians, agents, state, board, shell helpers, and
  knowledge loader, and dashboard fit together.
- Current implementation references for maintainers.

### What This Section Does Not Own

- Repo-wide Melee docs.
- Generated run state, SQLite databases, prompt artifacts, or PR dump contents.
- System-level design language that belongs in
  [../10-system-design/00-overview.md](../10-system-design/00-overview.md).

## Child Sections

- [Agents](agents/00-overview.md): centralized director, worker, PR-review,
  knowledge-curator, and runtime prompt/session code.
- [CLI](cli/00-overview.md): operator command surface and command modules.
- [Knowledge](knowledge/00-overview.md): source slices, CLI-first tools,
  resource graph, agent context routing, and past PR library.
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
