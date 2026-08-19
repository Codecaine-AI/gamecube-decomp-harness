# Melee runtime audits (recorded ground truth)

Recorded results of runtime audits against the live retail game (GALE01
rev2 / SSBM NTSC 1.02), driven through stock Dolphin's GDB stub. The decomp's
CI proves byte-equivalence, so it can never check *naming* claims — "this
argument is the external stage ID", "this field is the platform's target
object". These audits proved such claims against the running game and
recorded the evidence. Only the recorded data and reports are mirrored here;
the audit scripts, Gecko payloads, and overlay binaries stay upstream.

What each directory establishes (see `data/README.md` for the upstream
overview):

- `data/pr2939/` — external vs internal stage-ID spaces
  ([doldecomp/melee PR #2939](https://github.com/doldecomp/melee/pull/2939)):
  `stage_id_map` maps external → internal IDs, which functions take which
  space, full sweep in `audit.jsonl` with expectations in `expected.json`,
  human-readable `REPORT.md`. Includes the root cause of the hard freeze
  when forcing external IDs 0x15/0x1A.
- `data/venom-platform-links/` — Venom platform-controller struct fields
  verified live: `target_gobj` is `stage_info.map_gobjs[0]`, `upper_jobj`/
  `lower_jobj` are distinct valid JObjs, smash-taunt timer behavior. PASS.
- `data/grkind-stkind/` — which stage-ID space the game's own names refer
  to: **`grkind` = the decomp's internal stage ID** (selects the `Gr??.dat`
  ground archive), **`stkind` = the external stage ID** (selects the
  stage-param row inside the archive) — inverted from the reviewer's guess
  on PR #2939. `stage_names.txt` is the DOL's own 86-entry stage-name table,
  which names slots the decomp still calls `Unk`; `crosscheck.jsonl` /
  `live_param_keys.jsonl` / `icetop_marker.json` carry the evidence.

## Access

No source-local API — read the reports and JSONL directly, or grep:

```bash
grep -in "stkind" games/melee/knowledge/sources/rag_search/runtime_audits/data/grkind-stkind/README.md
```

Graph indexing: registered in `../../registry.json`, so the source
descriptor is upserted into the knowledge graph at the next rebuild (server
job `kg-rebuild-graph`, also run by `kg-maintain`). Chunk-level
`knowledge_graph_search` coverage needs a per-source builder in
`apps/server/src/core/knowledge/graph/builders/` (none exists yet for plain
document sources); until then workers reach it via the source listing +
direct file read.

## Provenance

- Source: <https://github.com/MarkMcCaskey/melee-runtime-audits>
- Commit: `ae7ee9573c596a7b7666410c1085bab8297aa291`
- Retrieved: 2026-08-19
- License: **no license file upstream — internal research use, do not
  redistribute.**

## Ground rules

These are recorded observations of the live game — strong ground truth for
semantic/naming claims (stage-ID spaces, field meanings, the DOL's own
string tables). They say nothing about byte-matching: current source,
headers, assembly, and objdiff decide that. Where an audit contradicts a
decomp name, the audit is evidence for a rename, not license to break a
match.
