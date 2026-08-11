# ftGameWatch — Mr. Game & Watch (`ftGw_`)

The 2-D LCD man: renders flat, animates in discrete frames, **cannot
L-cancel** (a famous engine quirk), and half his moveset spawns items — see
the `itgamewatch*` family in [`it/items/`](../it.md). His folder splits more
normals than most because so many are bespoke.

| File | Move | Behavior |
|------|------|----------|
| `ftGw_SpecialN.c` | Chef | Flips sausages off a frying pan in arcs (`itgamewatchchef.c`). |
| `ftGw_SpecialS.c` | Judge | Random hammer numbers 1–9: 1 hurts *him*, 9 is a one-hit KO (`itgamewatchjudge.c`). |
| `ftGw_SpecialHi.c` | Fire | Trampoline firefighters launch him upward; recovery (`itgamewatchfire.c`). |
| `ftGw_SpecialLw.c` | Oil Panic | Bucket absorbs three energy projectiles, then dumps them as one giant splash (`itgamewatchpanic.c`). |
| `ftGw_Attack11.c`, `ftGw_Attack100.c` | Jab / rapid jab | Greenhouse pump-jab (`itgamewatchgreenhouse.c`). |
| `ftGw_AttackAir.c` | Aerials | Turtle bair, parachute nair etc. (`itgamewatchturtle.c`, `itgamewatchparachute.c`). |
| `ftGw_AttackS4.c`, `ftGw_AttackLw3.c` | F-smash / d-tilt | Torch smash; manhole flip (`itgamewatchmanhole.c`). |
| `ftGw_Init.c` | — | Spawn/load callbacks. |

Kirby copy: `ftKirby/ftkirbyspecialgamewatch.c` (+ chef pan item).
