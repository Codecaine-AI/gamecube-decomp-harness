# Knowledge Sources

`projects/melee/knowledge/sources/` keeps stable vertical slices for
source descriptors and source-local APIs. The active access model and physical
source paths are declared in `registry.json`: injected context, standalone
RAG-style sources, and code-connected evidence. Canonical Melee corpora and
generated indexes live in the selected project's matching storage path under
`projects/melee/knowledge/sources/`.

## Source Shape

```text
<section>/<source_id>/
+-- source.json       # descriptor, section, access modes, trust, commands
+-- README.md
+-- api/              # worker/operator lookup scripts
+-- commands/         # source maintenance scripts
+-- tests/            # source-local smoke notes/tests
```

Common source-local APIs:

```bash
python3 projects/melee/knowledge/sources/<section>/<source_id>/api/status.py --json
python3 projects/melee/knowledge/sources/<section>/<source_id>/api/search.py --query "<term>" --limit 10 --json
```

RAG sources also expose semantic retrieval after vectorization:

```bash
python3 projects/melee/knowledge/sources/rag_search/<source_id>/commands/vectorize.py --json
python3 projects/melee/knowledge/sources/rag_search/<source_id>/api/semantic_search.py --query "<question>" --limit 10 --json
```

Vectorization stores normalized embeddings in
`projects/melee/knowledge/sources/rag_search/<source_id>/indexes/vector.sqlite`
and writes the provider, model, dimensions, source fingerprint, and chunking
policy to `indexes/vector_manifest.json`.

Some sources expose focused aliases, such as:

- `path_facts/api/resolve_for_path.py`
- `powerpc_docs/api/lookup_instruction.py`

## Active Sections

| Section | Sources | Notes |
| --- | --- | --- |
| `injectable` | `decomp_standards`, `path_facts`, `banned_patterns` | Auto-selected context and QA guardrail records. Search APIs exist for curation and focused follow-up, not broad worker browsing. |
| `rag_search` | `powerpc_docs` | Independently searchable knowledge bases. |
| `code_context` | `code_graph`, `past_prs` | Sources that connect to files, symbols, PRs, graph cards, and rank features. |
| `deprecated` | `discord_knowledge`, `ssbm_data_sheet`, `external_mirrors` | Archived lookup slices retained for manual use or explicit profile overrides, but inactive by default. |

`path_facts` is injected into worker packets as target-scoped context. The
default worker profile does not expose `path_facts_resolve`, Discord knowledge,
data sheet, or external mirror tools.

Callable tool results are intentionally not source slices. Expensive or
refreshable tool evidence belongs in each resolved tool-data root: stable
project rows under `projects/melee/shared/tool-data/<tool_id>/{cache,indexes}`,
mutable worktree output under
`projects/melee/worktrees/<worktree_id>/tool-cache/<tool_id>`.

## Rebuild And Smoke

The normal graph rebuild materializes declared `indexes/*.jsonl` outputs for
active default sources:

```bash
bun run kg:rebuild -- --sources all
bun run kg:smoke -- --strict
```

Use source-local status/search APIs when you need quick lookup without a graph
rebuild. Use `bun run kg:search`, `bun run kg:file-card`, or worker tools when
you need graph-level edges, rank signals, PR history, or cross-source context.
Use `semantic_search.py` when the question is conceptual enough that exact
terms may differ from useful source wording.
