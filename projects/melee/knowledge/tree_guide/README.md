# Melee Source Tree Guide

Human-browsable orientation for the [doldecomp/melee](https://github.com/doldecomp/melee)
source tree (checked out at `projects/melee/checkout`). Each page answers:
*where am I, and what is this part of the game?*

This is the **semantic** layer — what the code *is* in the game (Kirby's up
special, Jungle Japes, the stale-move table). It deliberately does not repeat
the decomp-workflow guidance in `knowledge/sources/injectable/path_facts/`
(accessors, union arms, matching traps); read both when working a target.

## Layout

- [overview.md](overview.md) — whole-tree map: every top-level directory in
  one line, plus what lives outside `src/melee/`.
- One page per top-level directory (`gm.md`, `gr.md`, `it.md`, …) with
  sub-area and notable-file blurbs.
- [ft/](ft/) — the fighter system: `ft/README.md` for shared machinery and
  naming, plus one page per character folder with identity, behavior, and
  per-special-move file notes.

## Going deeper

For frame data, hitbox tables, and hitbox GIFs beyond these blurbs, use the
**SmashWiki mirror** at `knowledge/sources/rag_search/smashwiki/` — e.g.
`api/resolve_for_path.py --path <file>` lists the wiki pages for a source
file, and `api/get_page.py --title "Kirby (SSBM)/Up tilt" --section Hitboxes`
returns one move's hitbox table.

## Conventions

- Internal names are often **Japanese**: `Purin` = Jigglypuff, `Seak` = Sheik,
  `Mars` = Marth, `Emblem` = Roy, `Koopa` = Bowser, `kinoko` = mushroom,
  `inishie` ("ancient") = Mushroom Kingdom, `izumi` ("fountain") = Fountain of
  Dreams. Pages spell these out wherever they appear.
- Entries marked `(?)` are best-effort inferences not yet verified against
  source or community docs — treat as hints, correct freely.
- Facts here are orientation aids, not authority. Current source, headers,
  assembly, and objdiff outrank anything written here.

## Provenance

Built 2026-07-02 from the checkout tree plus community sources:
[SmashWiki](https://www.ssbwiki.com) character pages and
[debug-menu stage data](https://www.ssbwiki.com/Debug_menu_(SSBM)/Stage_data),
[Race to the Finish](https://www.ssbwiki.com/Race_to_the_Finish_(SSBM)), and
Japanese naming conventions used throughout the game's assets.
