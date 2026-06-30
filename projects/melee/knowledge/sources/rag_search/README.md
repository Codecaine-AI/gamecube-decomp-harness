# RAG Search Sources

Standalone knowledge bases that agents can query on demand.

- `powerpc_docs` contains indexed PowerPC PDF/documentation pages.

Use these for research questions that are not already answered by local source,
file cards, or path-scoped injected context.

Each source exposes both lexical lookup over generated JSONL chunks and semantic
lookup over a source-local vector index:

```bash
python3 projects/melee/knowledge/sources/rag_search/<source_id>/commands/vectorize.py --json
python3 projects/melee/knowledge/sources/rag_search/<source_id>/api/semantic_search.py --query "<question>" --json
```

Vectorization defaults to OpenAI `text-embedding-3-small` embeddings, stores
normalized vectors in `indexes/vector.sqlite`, and writes model/chunking
metadata to `indexes/vector_manifest.json`.

Deprecated RAG-style slices live under `../deprecated/` and are inactive in the
default worker surface.
