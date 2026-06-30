# Discord Knowledge Commands

Available commands:

- `python3 projects/melee/knowledge/sources/deprecated/discord_knowledge/commands/vectorize.py --json`
  builds `indexes/vector.sqlite` and `indexes/vector_manifest.json` from the
  generated chunk JSONL index.

Planned commands:

- `index` chunks Markdown into searchable records.
- `emit_graph` emits conservative file, symbol, compiler-pattern, and risk edges.
- `status` reports indexed chunk counts and source freshness.

Vectorization defaults to OpenAI `text-embedding-3-small`; set
`OPENAI_API_KEY` before running it. This corpus is snapshot-based unless new
Discord exports are added to `data/docs`.
