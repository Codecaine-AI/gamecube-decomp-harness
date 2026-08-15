# Direct And Raw Knowledge Sources

This section contains knowledge inputs whose lifecycle does not begin with the
code graph:

- `smashwiki` mirrors selected wiki pages and exposes page, section, media, and
  lexical lookup.
- `discord_raw` stores timestamped messages for librarian extraction. Workers
  do not search the raw archive directly.

SmashWiki remains a direct searched corpus because page-oriented lookup is part
of its access contract. Graph builders may also attach selected wiki evidence
to code entities. Discord messages become worker-visible only after extraction
produces evidence-backed graph records.

This section does not use source-local vector databases. Cross-source textual
discovery uses graph `search_chunks`; relationship-aware retrieval uses
structured graph queries.
