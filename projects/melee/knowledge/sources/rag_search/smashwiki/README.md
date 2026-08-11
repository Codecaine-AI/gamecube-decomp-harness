# SmashWiki Mirror (Melee scope)

Local mirror of the Melee-relevant slice of [SmashWiki](https://www.ssbwiki.com):
character pages and their per-move **hitbox subpages** (frame data, hitbox
tables, GIF references), stages, items, techniques/mechanics, and game modes.
This is the deep-reference layer under `tree_guide` — the tree guide says
*where you are*; this says *what the move/stage/item actually does frame by
frame*.

Progressive disclosure, three tiers:

1. **Crosswalk** (`data/crosswalk.jsonl`) — source path → relevant page
   titles. Cheap enough to inject into packets.
2. **Pages** (`data/pages/*.wiki`, indexed by `data/index.jsonl`) — raw
   wikitext, retrieved per **section** so a worker reads one hitbox table,
   not a whole page. Hitbox tables are `{{...HitboxTableRow...}}` templates
   with named parameters (damage, angle, bkb/kbg, size, bone) — very
   machine-readable.
3. **Media** (`data/media/`, lazy) — hitbox GIFs/images downloaded on demand
   from `data/manifest/files.jsonl` and viewable with the Read tool.

## Commands

```bash
# full text mirror + media manifest (re-run to update; ~5 min)
python3 commands/mirror.py

# optional bulk media prefetch (e.g. all hitbox GIFs)
python3 commands/mirror.py --prefetch-media 'hitbox'
```

## APIs

```bash
python3 api/search.py --query "final cutter hitbox" [--content] [--json]
python3 api/get_page.py --title "Kirby (SSBM)/Up tilt" --sections
python3 api/get_page.py --title "Kirby (SSBM)/Up tilt" --section Hitboxes
python3 api/get_media.py --match "KirbyUTilt" --fetch
python3 api/resolve_for_path.py --path src/melee/ft/chara/ftKirby/ftkirbyspecialhi.c
```

## Ground rules

- Wiki facts are community documentation of *observed behavior* — great for
  naming fields and sanity-checking constants, but current source, headers,
  assembly, and objdiff outrank them.
- Content is SmashWiki's, CC BY-SA — mirrored locally for research;
  `data/pages/` and `data/media/` are gitignored, each page header carries
  its source URL and revision id.
- Melee-specific pages are suffixed `(SSBM)`; series-wide pages (e.g.
  `Hitstun`, `Edge`) cover all games — read the Melee section.
