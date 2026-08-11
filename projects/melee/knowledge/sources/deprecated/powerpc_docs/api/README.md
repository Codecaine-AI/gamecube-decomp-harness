# PowerPC Documents API

CLI-style worker access:

- `python3 projects/melee/knowledge/sources/rag_search/powerpc_docs/api/status.py --json`
- `python3 projects/melee/knowledge/sources/rag_search/powerpc_docs/api/search.py --query <query> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/rag_search/powerpc_docs/api/semantic_search.py --query <question> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/rag_search/powerpc_docs/api/lookup_instruction.py --mnemonic <mnemonic> --limit <n> --json`

Lexical and semantic results cite document IDs, page refs, generated chunk IDs,
and PDF/page metadata where available. Semantic search uses
`indexes/vector.sqlite` after vectorization.
