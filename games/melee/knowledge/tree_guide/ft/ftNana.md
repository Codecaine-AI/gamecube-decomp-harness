# ftNana — Ice Climbers, partner (`ftNn_`)

Nana, the AI-controlled second climber. Most of her behavior is
[Popo's](ftPopo.md) code driven by a follow/echo controller; this folder
holds only her divergent states:

| File | What differs |
|------|--------------|
| `ftNn_SpecialHi.c` | Belay, partner side — she's the one thrown upward, then anchors the rope for Popo. |
| `ftNn_SpecialS.c` | Squall Hammer, partner sync. |
| `ftNn_Init.c` | Spawn/link-to-leader setup. |

When Nana dies, Popo fights alone ("SoPo") with a crippled up B — that
asymmetry lives in these files' checks.
