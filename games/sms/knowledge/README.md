# SMS Knowledge

This directory owns the Super Mario Sunshine knowledge inputs and
graph-adjacent enrichment artifacts, mirroring `games/melee/knowledge/`'s
shape. The active materialized graph lives at `games/sms/graph/graph.sqlite`;
server code under `apps/server/src/core/knowledge` builds and queries it.

Callable tools are a separate concern. Their definitions live in
`toolpacks/gamecube-decomp`, while SMS bindings and generated evidence live
under `games/sms/tool-bindings` and `games/sms/shared/tool-data`.

## Active Sources

`sources/registry.json` lists the sources wired up so far — all backed
entirely by generic, checkout-driven tooling with no per-game authored
content required:

| Source | What it needs |
| --- | --- |
| `code_graph` | Nothing beyond the checkout + a built `report.json`. |
| `past_prs` | Only `source.json` is present — the ingestion scripts under Melee's `commands/` (`fetch_recent_pr_dump.py` and friends) reference the `doldecomp/melee` GitHub repo and haven't been ported to `doldecomp/sms` yet. Refreshing this source needs that port first. |
| `opseq_similarity`, `ghidra_xrefs` | Populated by the matching toolpack runner (`opseq`/`ghidra`) against this game's checkout. |
| `knowledge_ledger` | Starts as an empty `ledger/learnings.jsonl`; grows as librarian/worker agents run. |

Deliberately **not** wired yet (would need real per-game authored content or
resources that don't exist for SMS):

- `decomp_standards` — Melee's version is ~1500 lines of standards distilled
  from Melee's own review corpus; nothing analogous exists for SMS yet.
- `mwcc_compiler_notes`, `runtime_audits` — no SMS-specific notes/audits
  collected yet.
- `smashwiki`, `discord_raw` — Melee community resources (SmashWiki, the SSBM
  Discord archive) with no SMS equivalent.

Add these once the underlying content/ingestion exists, following
`games/melee/knowledge/sources/registry.json` as the reference shape.
