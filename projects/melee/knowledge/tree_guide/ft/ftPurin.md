# ftPurin — Jigglypuff (`ftPr_`; "Purin" is its JP name)

The aerial drift monster: five jumps, best air mobility in the game, and the
most feared risk/reward button in Melee — **Rest**. Top tier via bair walls
and edgeguards.

| File | Move | Behavior |
|------|------|----------|
| `ftPr_SpecialN.c` | Rollout | Charge and careen sideways like a rolling ball. |
| `ftPr_SpecialS.c` | Pound | Big forward slap with horizontal drift — doubles as recovery distance. |
| `ftPr_SpecialHi.c` | Sing | Puts nearby grounded foes to sleep (`ftCo_DamageSong.c`); no recovery value. |
| `ftPr_SpecialLw.c` | Rest | Falls asleep with a frame-1 point-blank hitbox that KOs absurdly early; total commitment if missed. |
| `ftPr_Init.c` | — | Spawn/load callbacks. |

Kirby copy: `ftKirby/ftkirbyspecialpurin.c`.
