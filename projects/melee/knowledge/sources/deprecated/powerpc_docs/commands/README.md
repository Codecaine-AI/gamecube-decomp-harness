# PowerPC Documents Commands

Available commands:

- `python3 projects/melee/knowledge/sources/rag_search/powerpc_docs/commands/vectorize.py --json`
  builds `indexes/vector.sqlite` and `indexes/vector_manifest.json` from the
  generated page JSONL index.

Planned commands:

- `index` converts the page CSV into JSONL chunks and term indexes.
- `emit_graph` emits document-chunk facts and instruction-term edges.

Vectorization defaults to OpenAI `text-embedding-3-small`; set
`OPENAI_API_KEY` before running it. Refresh is optional because the PDFs are
static reference material.
