# PowerPC Documents Source

Static reference source for PowerPC ABI, compiler-guide, and ISA lookup.

The actual PDFs, page index, build helper, and legacy PPC skill notes live in
`data/`.

Generated page search chunks are written to `indexes/pages.jsonl` during
`kg-rebuild-graph`.

Semantic RAG lookup uses `indexes/vector.sqlite`, generated from
`indexes/pages.jsonl` with:

```bash
python3 projects/melee/knowledge/sources/rag_search/powerpc_docs/commands/vectorize.py --json
```
