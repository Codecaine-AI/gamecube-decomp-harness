# MWCC 1.2.5 register-allocator notes

A single validated document, `data/mwcc-compiler-notes.md` (432 lines): a
working model of the Metrowerks CodeWarrior PowerPC compiler's optimizer and
register allocator, built by observing the compiler binary itself. It exists
because "everything matches except two registers are swapped" is the most
common plateau in matching-decompilation work, and the allocator's decision
order makes that plateau explainable — and sometimes fixable.

What the document contains:

- the optimization pass pipeline at each `-O` level;
- the spill-cost formula and the simplify/select rules the colorer follows;
- a table of **source-level levers proven to move register assignments**
  (the actionable part for a stuck worker);
- a taxonomy of residual mismatches that are **not** source-steerable, so
  workers can stop burning attempts on them;
- symptom → pipeline-stage attribution: which stage to blame for a given
  mismatch shape.

Version applicability: the notes identify the exact binaries by SHA-256.
Melee's decomp ships `GC/1.2.5n` (Ninji patch); the document verifies that
1.2.5 and 1.2.5n differ in only 53 bytes and are **byte-identical in the
optimizer and register-coloring regions**, so the model applies to melee
directly. It does not transfer to other MWCC versions.

## Access

No source-local API — read the document directly, or grep it:

```bash
grep -in "spill" games/melee/knowledge/sources/rag_search/mwcc_compiler_notes/data/mwcc-compiler-notes.md
```

Graph indexing: registered in `../../registry.json`, so the source descriptor
is upserted into the knowledge graph at the next rebuild (server job
`kg-rebuild-graph`, also run by `kg-maintain`). Chunk-level
`knowledge_graph_search` coverage needs a per-source builder in
`apps/server/src/core/knowledge/graph/builders/` (none exists yet for plain
document sources); until then workers reach it via the source listing +
direct file read.

## Provenance

- Source: <https://github.com/MarkMcCaskey/decomp-scripts>,
  file `mwcc-compiler-notes.md`
- Commit: `88f0abe02080a1d3f19df3aebf551dc5fb226442`
- Retrieved: 2026-08-19
- License: MIT (Copyright (c) 2026 Mark McCaskey) — upstream notice mirrored
  at `data/LICENSE.upstream`. Only the notes document is mirrored; the
  repo's scripts/tools are not.

## Ground rules

This is a behavioral model of the compiler, validated against the identified
binary — treat it as the best available explanation for allocator behavior,
not as a guarantee. An actual objdiff result on the target function always
outranks a prediction from these notes.
