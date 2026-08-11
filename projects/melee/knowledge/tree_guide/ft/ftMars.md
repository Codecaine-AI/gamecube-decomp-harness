# ftMars — Marth (`ftMs_`; "Mars" is his JP romanization)

The swordsman archetype: every blade hit is stronger at the **tip**
(tipper mechanic), huge range, dash-dance king, top tier since 2001. Base for
clone [Roy](ftEmblem.md).

| File | Move | Behavior |
|------|------|----------|
| `ftMs_SpecialN.c` | Shield Breaker | Chargeable stab that shreds shields (full charge breaks instantly). |
| `ftMs_SpecialS.c` | Dancing Blade | Four-swing sword combo with up/down variants per swing. |
| `ftMs_SpecialHi.c` | Dolphin Slash | Fast rising slash, strong on frame 1; recovery. |
| `ftMs_SpecialLw.c` | Counter | Parries and returns any melee hit taken during the window. |
| `ftMs_Init.c` | — | Spawn/load callbacks. |

Kirby copy: `ftKirby/ftkirbyspecialmars.c`.
