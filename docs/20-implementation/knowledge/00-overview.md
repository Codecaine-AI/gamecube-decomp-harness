---
covers: Package-owned knowledge layout, manifest routes, helper scripts, resources, and past PR library
concepts: [knowledge, manifest, references, workflows, tools, resources, past-prs]
code-ref: decomp-orchestrator/knowledge, decomp-orchestrator/src/knowledge
---

# Knowledge: Overview

Runtime agent knowledge lives under `knowledge/` and is loaded through
`src/knowledge/`. The manifest maps agent roles and optional capabilities to
specific references and workflows. Legacy pack-style material stays outside
default prompt routes unless it is reviewed and promoted into this manifest
model.

## File Tree

```text
knowledge/
+-- README.md
+-- manifest.json
+-- references/
|   +-- director/
|   +-- melee/
+-- workflows/
|   +-- targeted-iteration.md
|   +-- experimental-sweeps/
+-- tools/
|   +-- decomp_context_lookup.py
|   +-- rank_decomp_candidates.py
|   +-- sweeps/
+-- decomp_resources/
+-- past_prs/
+-- archive/
```

```text
src/knowledge/
+-- index.ts
+-- manifest.ts
+-- paths.ts
+-- resources.ts
```

## Manifest Contract

`knowledge/manifest.json` contains:

- `role_defaults`: references included for director or worker by default.
- `capability_routes`: additional references selected when a capability is
  enabled.
- `references`: known reference/workflow files with purpose metadata.
- `scripts`: helper scripts exposed to prompt builders and operators.

The default director route includes scheduling policy. The default worker route
includes Melee overview, targeted iteration, resource research, matching
tactics, and review standards. `experimental_search` and `permuter_handoff`
are opt-in capability routes.

## Code Path

`src/knowledge/manifest.ts` reads the manifest, resolves paths relative to the
knowledge root, deduplicates selected references, and builds summaries for
prompt builders. `src/knowledge/resources.ts` builds the resource map that
agents see in rendered prompts.

## Past PR Library

`knowledge/past_prs/` contains the stable PR dump, searchable per-PR
postmortem records, and refresh utilities. Package scripts expose refresh,
postmortem, and sync commands so this evidence library travels with the
orchestrator package.

## Archive Boundary

Legacy packs and older prompt mirrors can stay under `knowledge/archive/` or
clearly labeled legacy folders. They should not enter default manifest routes
unless they are reviewed and promoted into references, workflows, tools, decomp
resources, or past PR evidence.

## Related

- [Knowledge model](../../10-system-design/50-knowledge-model.md)
- [PR-review agent](../agents/20-pr-review.md)
