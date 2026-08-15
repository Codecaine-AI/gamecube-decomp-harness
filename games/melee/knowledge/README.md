# Melee Knowledge

This directory owns the Melee knowledge inputs and graph-adjacent enrichment
artifacts. The active materialized graph lives at
`projects/melee/graph/graph.sqlite`; server code under
`apps/server/src/core/knowledge` builds and queries it.

Callable tools are a separate concern. Their definitions live in
`toolpacks/gamecube-decomp`, while Melee bindings and generated evidence live
under `projects/melee/tool-bindings`, `projects/melee/shared/tool-data`, and
worktree-local tool caches.

## Active Sources

`sources/registry.json` is the source catalog. Its current sections are:

| Section | Sources | Access model |
| --- | --- | --- |
| Injected context | `decomp_standards` | Compact worker and review guidance. |
| Searchable corpus | `smashwiki` | Direct page, section, media, and text lookup. |
| Raw librarian input | `discord_raw` | Timestamped messages consumed by extraction; workers do not search it directly. |
| Code-connected evidence | `code_graph`, `past_prs`, `opseq_similarity`, `ghidra_xrefs` | Facts and relationships attached to files, functions, PRs, analogs, and binary xrefs. |

The graph rebuild also creates derived sources such as mismatch patterns,
call-graph edges, siblings, agent/curator evidence, and the knowledge ledger.
Those records are graph products rather than standalone source directories.

## Storage Model

Builders emit four searchable graph record types:

- Entities identify files, functions, PRs, mismatch patterns, and other stable
  subjects.
- Facts attach typed evidence to one entity.
- Edges connect entities, including `ANALOGOUS_TO`, `CALLS`, and
  `REFERENCES_DATA` relationships.
- Search chunks provide lexical discovery with evidence references.

SQLite FTS5 searches graph chunks when available, with a `LIKE` fallback.
This is keyword search, not vector or embedding search. Relationship-aware
reads use structured graph queries such as file cards and related-function
queries.

Opseq and callgraph runners compute evidence before ingestion. The graph stores
their results and links them to code entities. Ghidra xref export follows the
same pattern: generated binary evidence is ingested into graph facts and edges.

## Physical Layout

```text
projects/melee/knowledge/
+-- README.md
+-- sources/
|   +-- registry.json
|   +-- injectable/decomp_standards/
|   +-- rag_search/smashwiki/
|   +-- rag_search/discord_raw/
|   +-- code_context/code_graph/
|   +-- code_context/past_prs/
|   +-- code_context/opseq_similarity/
|   +-- code_context/ghidra_xrefs/
+-- resource_graph/
    +-- enrichments/
    +-- schemas/
```

Generated tool evidence is stored outside this source tree:

```text
projects/melee/
+-- shared/tool-data/<tool_id>/
|   +-- cache/
|   +-- indexes/
+-- worktrees/<worktree_id>/tool-cache/<tool_id>/
```

Stable runner outputs belong in shared tool data. Mutable validation and edit
output belongs in the active worktree cache. Durable generalized lessons are
ingested into the graph instead of becoming another tool-local knowledge store.

## Worker Access

- `code_graph_file_card` returns the target file's combined graph evidence.
- `knowledge_graph_search` performs lexical discovery across graph chunks.
- `graph_related_functions` retrieves relationship-aware function evidence.
- `past_prs_search` searches the PR corpus with its dedicated worker surface.
- Validation, compiler, editing, and conversion tools remain direct operations
  because they inspect or change a concrete attempt.

A source-specific lookup should remain available until the graph exposes an
equivalent query. Ingestion alone does not make an edge or fact useful to a
worker.

## Commands

- `bun run kg:sources` lists registered sources and tools.
- `bun run kg:status` reports source, tool, and graph readiness.
- `bun run kg:maintain -- --project melee` refreshes generated evidence and
  rebuilds the graph.
- `bun run kg:rebuild -- --repo-root <repo_root>` rebuilds graph records.
- `bun run kg:search -- --repo-root <repo_root> --query <term>` searches graph
  chunks; add `--source <source_id>` to constrain the source.
- `bun run kg:file-card -- --repo-root <repo_root> --source <source_path>`
  returns graph-connected file context.
- `bun run kg:rank-features -- --repo-root <repo_root>` reads scheduling
  features from the graph.

Tool APIs are normally invoked through first-class worker tools or
resolver-backed server helpers. Operator refresh jobs invoke their registered
toolpack runners.
