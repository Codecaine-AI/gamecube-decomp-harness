# Discord Knowledge API

CLI-style worker access:

- `python3 projects/melee/knowledge/sources/deprecated/discord_knowledge/api/status.py --json`
- `python3 projects/melee/knowledge/sources/deprecated/discord_knowledge/api/search.py --query <query> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/deprecated/discord_knowledge/api/semantic_search.py --query <question> --limit <n> --json`
- `python3 projects/melee/knowledge/sources/deprecated/discord_knowledge/api/topics_for_terms.py --terms <terms> --limit <n> --json`

The source-local lexical API searches generated chunk indexes and returns
citations, source paths, matched chunk IDs, and payload metadata. The semantic
API searches `indexes/vector.sqlite` when the vector index has been built.
Broad graph search is also available with
`bun run kg:search -- --source discord_knowledge --query <query>`.
