# ftLuigi — Luigi (`ftLg_`)

The slippery brother: lowest traction in the game (his wavedash slides
forever), floaty jumps, deceptively strong close-up.

| File | Move | Behavior |
|------|------|----------|
| `ftLg_SpecialN.c` | Fireball | Green fireball — floats straight, ignores gravity (`it/items/itluigifireball.c`). |
| `ftLg_SpecialS.c` | Green Missile | Chargeable sideways rocket-lunge; ~12.5% chance to **misfire** and launch at full power. Recovery tool. |
| `ftLg_SpecialHi.c` | Super Jump Punch | Rising punch; the grounded sweetspot at point-blank is the one-hit "Fire Jump Punch" (25%), otherwise a 1% poke. |
| `ftLg_SpecialLw.c` | Luigi Cyclone | Spinning multi-hit; mashing B gains height — key part of his recovery. |
| `ftLg_Init.c` | — | Spawn/load callbacks. |
