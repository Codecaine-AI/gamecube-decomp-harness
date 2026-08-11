# ftYoshi — Yoshi (`ftYs_`)

The most mechanically weird fighter: **no up-B recovery height** (his up B is
a projectile), a giant armored double jump instead, and a unique **egg
shield** that doesn't shrink but can't jump out of shield — hence his own
`Guard` file.

| File | Move | Behavior |
|------|------|----------|
| `ftYs_SpecialN.c` | Egg Lay | Tongue command-grab that traps the victim inside an egg (victim states: `ftCo_CaptureYoshi.c`, `ftCo_YoshiEgg.c`; tongue/egg items: `ityoshitongue.c`, `ityoshiegglay.c`). |
| `ftYs_SpecialS.c` | Egg Roll | Curls into a rolling egg and trundles around. |
| `ftYs_SpecialHi.c` | Egg Throw | Lobs an arcing egg projectile (`ityoshieggthrow.c`) — barely any rise; real recovery is his double jump's knockback armor. |
| `ftYs_SpecialLw.c` | Yoshi Bomb | Hopping ground-pound, stars on impact (`ityoshistar.c`). |
| `ftYs_Guard.c` | Egg shield | His non-standard shield states. |
| `ftYs_Init.c` | — | Spawn/load callbacks. |

Kirby's swallowed version: `ftKirby/ftkirbyspecialyoshi.c` + egg files.
