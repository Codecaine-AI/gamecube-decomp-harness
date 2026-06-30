# Discord Knowledge Source

Deprecated source slice. It remains available under
`projects/melee/knowledge/sources/deprecated/discord_knowledge` for manual
lookup and reproducibility, but it is inactive in `registry.json` and is not
part of the default worker tool surface.

Lightweight indexed source descriptor for Discord-derived notes.

The actual Discord corpus lives in `data/docs`. This slice owns the
API/indexing contract and keeps the legacy Discord skill notes in
`data/legacy-skill`.

Generated graph/search chunks are written to `indexes/chunks.jsonl` during
`kg-rebuild-graph`.

Semantic RAG lookup uses `indexes/vector.sqlite`, generated from
`indexes/chunks.jsonl` with:

```bash
python3 projects/melee/knowledge/sources/deprecated/discord_knowledge/commands/vectorize.py --json
```
