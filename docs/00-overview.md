---
concepts: [docs, navigation, package-local, foundation, system-design, implementation, runbooks]
---

# D-Comp Orchestrator Docs

These docs describe `decomp-orchestrator/` only. They are intentionally
package-local docs, not the top-level Melee repository documentation. The
markdown docs are the living, navigable version of the original design,
organized with the three-layer documentation framework:

```text
docs/
+-- 00-foundation/       # Intent, principles, and boundaries
+-- 10-system-design/    # System behavior and contracts
+-- 20-implementation/   # Current code and package layout
|   +-- 99-appendix/     # Preserved source artifacts and operational notes
+-- 30-runbooks/         # Operator playbooks for live runs
```

## Start Here

- [Foundation overview](00-foundation/00-overview.md) explains what the
  orchestrator is for and what it should avoid becoming.
- [System design overview](10-system-design/00-overview.md) maps the scheduler,
  workers, durable state, process guardians, knowledge, and score gate.
- [Implementation overview](20-implementation/00-overview.md) maps the current
  TypeScript source tree and package-owned knowledge layout.
- [Design coverage audit](20-implementation/99-appendix/40-design-coverage.md)
  maps each original design section to markdown coverage.
- [Runbooks](30-runbooks/00-overview.md) hold operator playbooks for
  monitoring live runs and repairing stuck targets.

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
  board-scheduling Pi agents.
