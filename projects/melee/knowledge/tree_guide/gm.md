# gm — Game Mode / Scenes / Main Loop

The spine of the game. `gm` owns the main loop (`gmmain.c`), the
**MajorScene/MinorScene** tables that define every screen the game can be on
(`gmscdata.c`), and one file per game mode. Scenes register
OnLoad/OnEnter/OnLeave callbacks; switching modes = switching scenes.

## Core

| File | What it is |
|------|------------|
| `gmmain.c`, `gmmain_lib.c` | The main loop: per-frame pump that runs the current scene. |
| `gmscdata.c` | The master scene tables — every major/minor scene ID and its callbacks. Start here to find "which code runs on screen X". |
| `gmmenu.c` | Menu major-scene wrapper (hands off to `mn/`). |
| `gmtitle.c` | Title screen. |
| `gmopening.c`, `gmhowto.c`, `gmmovieend.c` | Opening movie / How-to-Play video playback scenes and post-movie handoff. |
| `gmpause.c` | In-match pause. |
| `gmcamera.c`, `gmfixedcamera.c` | Match camera-mode plumbing incl. Fixed-Camera mode (works with `cm/`). |
| `gmprogressive.c` | The 480p progressive-scan prompt at boot. |
| `gmstaffroll.c` | Credits (the shootable staff roll). |

## Match modes

| File | What it is |
|------|------------|
| `gmvsmelee.c`, `gmvsdata.c` | Standard VS Melee match flow and its setup data (`StartMeleeData`). |
| `gmclassic.c`, `gmadventure.c`, `gmallstar.c` | The three 1-P campaign modes. |
| `gmreg*.c` | "Regular match" (1-P campaign) shared framework: `gmregclear` clear handling, `gmregtyfall` the trophy-falls ending, `gmregenddisp` end display. |
| `gmapproach.c` | 1-P intermission/"vs" approach screen between rounds `(?)`. |
| `gmhomerun.c` | Home-Run Contest mode logic (stage side is `gr/grhomerun.c`). |
| `gmmultiman.c`, `gmomake15.c` | Multi-Man Melee; `omake` ("bonus") 15 = 15-Minute Melee `(?)`. |
| `gmtou_0/1/2.c`, `gmtoulib.c` | Tournament (bracket) mode. |
| `gmresult.c`, `gmresultplayer.c` | Post-match results screens and per-player stats. |

## Special Melee variants

One small file per variant, mostly match-rule tweaks: `gmslomo` (Slo-Mo),
`gmtiny` (Tiny), `gmgiant` (Giant), `gminvisible` (Invisible), `gmlightning`
(Lightning), `gmstamina` (Stamina), `gmsupersudden` (Super Sudden Death),
`gmsinglebutton` (Single-Button).

## Unsplit

Twenty `gm_XXXX.c` files (hex-named) are code not yet identified/renamed —
expect scene glue, tournament data, and mode plumbing in there.
