# if — Interface (in-match HUD)

Everything drawn over the match: damage percents, stock icons, the clock,
name tags, and the text engine that renders them. Menu screens are `mn/`,
results screens are `gm/` — `if` is what you see *during* play.

| File | What it is |
|------|------------|
| `ifstatus.c` | The per-player damage/status gauges (percent readouts, character icons). |
| `ifstock.c` | Stock icons under the percent. |
| `iftime.c` | The match timer. |
| `ifnametag.c` | Floating P1/CPU/custom name tags above fighters. |
| `ifmagnify.c` | The offscreen **magnifier bubble** (fighter peeking in from outside the camera). |
| `ifcoget.c` | Coin pickup counter (Coin Battle / lottery coins) `(?)`. |
| `ifprize.c` | 1-P prize/score popups `(?)`. |
| `ifhazard.c` | Warning indicator UI `(?)`. |
| `ifall.c` | Shared HUD setup/teardown for the whole overlay. |
| `textdraw.c`, `textlib.c` | The text-rendering engine (HSD_Text/SisLib-based) used by HUD and beyond. |
| `soundtest.c` | Sound-test screen support (menu front-end in `mn/mnsoundtest.c`). |
| `if_2F72.c`, `if_2FC93.c` | Unidentified interface code. |
