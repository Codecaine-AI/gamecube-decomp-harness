# ty — Toys (Trophies)

The 290-trophy collection system. Trophies are "figures" internally (in
Japan, Smash trophies are フィギュア *figures* — hence `figure`/`figupon`
names here and in `gr/grfigure*`).

| File | What it is |
|------|------------|
| `toy.c` | Core trophy entity (`GET_TOY(gobj)`), `TrophyData`, unlock state. |
| `tylist.c` | The collection list (owned/duplicate counts, ordering). |
| `tydisplay.c` | The gallery display panel — spinning/posing a trophy for viewing. |
| `tyfigupon.c` | The trophy **Lottery** ("Figupon" ≈ figure gacha): coin machine, new-vs-dupe odds `(?)`. |

Related elsewhere: `mn/mngallery.c` (gallery menu), `gr/grfigure*.c` (Snag
the Trophies bonus stage), `gm/gmregtyfall.c` (the trophy falling when you
clear 1-P mode).
