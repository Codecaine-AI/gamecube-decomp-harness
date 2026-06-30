# External Mirrors Source

Deprecated source slice. It remains available under
`projects/melee/knowledge/sources/deprecated/external_mirrors` for manual lookup
and reproducibility, but it is inactive in `registry.json` and is not part of
the default worker tool surface.

Composite indexed source for mirrored external hint material.

The actual snapshots live in
`projects/melee/knowledge/sources/deprecated/external_mirrors/data`,
including Training Mode, m-ex, Tockdom, and ppc2cpp. This slice points to those
folders through project storage.

Generated external symbol/document chunks are written to
`indexes/external_file_mentions.jsonl` during `kg-rebuild-graph`.
