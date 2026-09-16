# Injectable Sources

Compact context selected for agent prompts or worker packets.

- `decomp_standards` is the Melee game-scoped standards shell (only
  `source.json` and an empty `standards/order.json`). The global prompt policy
  moved to `knowledge/global/sources/injectable/decomp_standards/`; loaders
  compose game + global, so Melee inherits the global set unchanged.

Accepted standards are also ingested into the knowledge graph for lexical
discovery and file-linked evidence. Scoped durable learnings belong in the
knowledge ledger and graph rather than a parallel path-facts store.
