# ftPopo — Ice Climbers, leader (`ftPp_`)

The duo: you control Popo, and [Nana](ftNana.md) (`ftNn_`) shadows him on a
CPU follow routine. Two-bodies-one-stock is the core mechanic — desyncs,
handoffs, and the infamous wobbling all come from the leader/partner split,
which is why the pair is two folders.

| File | Move | Behavior |
|------|------|----------|
| `ftPp_SpecialN.c` | Ice Shot | Both climbers fire skidding ice blocks (`itclimbersice.c`). |
| `ftPp_SpecialS.c` | Squall Hammer | Side-by-side spinning hammer advance; mash for height. |
| `ftPp_SpecialHi.c` | Belay | Popo swings Nana up on a rope, then she pulls him after — a *team* recovery that's nearly worthless if Nana is dead (`itclimbersstring.c`). |
| `ftPp_SpecialLw.c` | Blizzard | Both breathe freezing mist; can freeze solid (`itclimbersblizzard.c`, `ftCo_DamageIce.c`). |
| `ftPp_Init.c` | — | Spawn/load callbacks. |

Kirby copy: `ftKirby/ftkirbyspecialiceclimber.c`.
