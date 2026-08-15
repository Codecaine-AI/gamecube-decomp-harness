# pl — Player

Per-player-**slot** data that outlives any single fighter GObj: who is in
port N, stocks, score, and the match-long records used for scoring. If `ft`
is the body, `pl` is the scoreboard entry.

| File | What it is |
|------|------------|
| `player.c` | Player-slot core: `MatchPlayerData`-style state per port — character, costume, stocks, kills (`kills[4]` per victim), damage dealt/taken. |
| `plstale.c` | The **stale-move queue** — the last-N-moves table that decays repeated attacks' damage. A famous gameplay mechanic; lives here, not in `ft`. |
| `plbonus.c`, `plbonuslib.c`, `plbonusinline.h` | The 1-P **bonus awards** system — the ~250 named bonuses ("Meteor Smash!", "Pacifist") detected and tallied at results time. |
| `plattack.c` | Attack-usage records feeding bonuses/stales `(?)`. |
| `pltrick.c` | Detection of specific feats/"tricks" for bonuses `(?)`. |
| `pl_040D.c` | Unidentified player code. |

Gotcha: `pl` structs are read by `ft` (stale queue on hit), `gm` (results),
and `if` (HUD), so type changes here ripple widely.
