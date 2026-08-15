# ftMario — Mario (`ftMr_`)

The all-rounder baseline; mid-weight, honest frame data, strong throws and
edgeguards. Historically the reference character for shared systems — if a
common mechanic misbehaves, test it on Mario first.

| File | Move | Behavior |
|------|------|----------|
| `ftMr_SpecialN.c` | Fireball | Bouncing fireball projectile (`it/items/itmariofireball.c`). |
| `ftMr_SpecialS.c` | Cape | Flips opponents around and **reflects projectiles**; slight aerial stall (`it/items/itmariocape.c`). |
| `ftMr_SpecialHi.c` | Super Jump Punch | Rising coin-spark uppercut, multi-hit; his recovery. |
| `ftMr_SpecialLw.c` | Mario Tornado | Spinning multi-hit; mash B to rise slightly. |
| `ftMr_Init.c`, `ftMr_Strings.c` | — | Spawn/load callbacks; debug/name strings. |

Clone: [Dr. Mario](ftDrMario.md).
