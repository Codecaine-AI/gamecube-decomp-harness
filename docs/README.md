---
covers: Package-local documentation map for D-Comp Orchestrator
concepts: [docs, navigation, package-local, foundation, system-design, implementation]
---

# D-Comp Orchestrator Docs

These docs describe `decomp-orchestrator/` only. They are intentionally
package-local docs, not the top-level Melee repository documentation.

The visual design artifact is preserved at [design.html](design.html). The
markdown docs are the living, navigable version of that design, organized with
the three-layer documentation framework:

```text
docs/
+-- 00-foundation/       # Intent, principles, and boundaries
+-- 10-system-design/    # System behavior and contracts
+-- 20-implementation/   # Current code and package layout
    +-- 99-appendix/     # Preserved source artifacts and operational notes
```

## Start Here

- [Foundation overview](00-foundation/00-overview.md) explains what the
  orchestrator is for and what it should avoid becoming.
- [System design overview](10-system-design/00-overview.md) maps the director,
  workers, durable state, process guardians, knowledge, and score gate.
- [Evidence refresh cadence](../EVIDENCE_REFRESH_CADENCE.md) is a proposed
  top-level operational policy for when epochs and run boundaries should
  refresh build artifacts, tool caches, graph evidence, and learned context.
- [Implementation overview](20-implementation/00-overview.md) maps the current
  TypeScript source tree and package-owned knowledge layout.
- [Design coverage audit](20-implementation/99-appendix/40-design-coverage.md)
  maps each original HTML design section to markdown coverage.
- [Original visual design](design.html) keeps the standalone HTML design doc
  intact for diagram-heavy review.
- [Knowledge resource graph design](resource-graph-design.html) sketches the
  proposed resource registry, vertical-slice indexers, file graph, worker
  lookup APIs, and graph-ranked scheduling layer.
- [Sidebar flow design](sidebar-flow-design.html) maps the session cycle
  (sync → init → run → checkpoint/validate → ship → resync), the reconcile
  agent, the hard sync lock, the local change ledger, and the phase-stepper
  sidebar — including the canonical Figma-style system map.

## Documentation Rules

- Keep system design docs implementation-agnostic: describe behavior, state,
  contracts, and lifecycle without source paths.
- Put TypeScript files, package scripts, schemas, and directory layout in
  implementation docs.
- Use the current knowledge terms: references, workflows, tools, decomp
  resources, and past PRs. "Packs" are legacy language.
- Treat experimental search as an opt-in worker capability, not the default
  worker posture.
- Treat trigger actors and guardian processes as evented runtime actors, not
  director/worker-style Pi agents.
