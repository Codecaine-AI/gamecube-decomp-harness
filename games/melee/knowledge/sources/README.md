# Knowledge Sources

`registry.json` catalogs the active project-owned inputs used for injection,
direct corpus lookup, and graph ingestion. A source directory owns its
descriptor, maintained corpus, and any source-specific API or refresh command.

## Active Sections

| Section | Sources | Purpose |
| --- | --- | --- |
| `injectable` | `decomp_standards` | Compact standards selected for worker and review context. |
| `rag_search` | `smashwiki`, `discord_raw` | Direct wiki lookup plus raw librarian input. Workers do not search `discord_raw`. |
| `code_context` | `code_graph`, `past_prs`, `opseq_similarity`, `ghidra_xrefs` | Evidence attached to files, functions, PRs, analogs, and binary xrefs. |

Graph-derived records such as call edges, siblings, mismatch patterns, and
ledger learnings do not require parallel source-local search stores.

## Source Shape

Source directories contain only the surfaces required by that source:

```text
<section>/<source_id>/
+-- source.json
+-- README.md
+-- data/
+-- indexes/
+-- api/
+-- commands/
+-- tests/
```

These entries are optional except for `source.json`; the physical shape follows
the source's maintenance and access contract.

## Access Rules

- Use graph search for lexical discovery across ingested `search_chunks`.
- Use structured graph queries for relationships such as analogs, calls,
  references, siblings, and PR/file connections.
- Use a direct source API only when the source is intentionally searched outside
  the graph, as with SmashWiki page and media lookup.
- Treat tool-generated rows as evidence inputs. Stable rows belong under
  `projects/melee/shared/tool-data/<tool_id>` rather than this source tree.
- Keep raw librarian inputs out of worker search surfaces until extraction
  creates evidence-backed graph records.

## Commands

```bash
bun run kg:sources
bun run kg:status
bun run kg:maintain -- --project melee
bun run kg:rebuild -- --repo-root <repo_root>
bun run kg:search -- --repo-root <repo_root> --query <term>
bun run kg:file-card -- --repo-root <repo_root> --source <source_path>
```

Source-specific maintenance commands remain documented in the owning source
README.
