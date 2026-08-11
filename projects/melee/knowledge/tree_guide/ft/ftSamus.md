# ftSamus — Samus (`ftSs_`)

Floaty zoner in power armor: projectile wall, extreme survivability (heavy +
floaty + bomb jumps + grapple), classic defensive Melee character.

| File | Move | Behavior |
|------|------|----------|
| `ftSs_SpecialN.c` | Charge Shot | Store a charge, release a huge plasma ball (`itsamuschargeshot.c`). |
| `ftSs_SpecialS.c` | Missile | Tilt = homing missile, smash = fast Super Missile (`itsamusmissile.c`). |
| `ftSs_SpecialHi.c` | Screw Attack | Rising multi-hit spin; recovery. |
| `ftSs_SpecialLw_0.c`, `_1.c` | Bomb | Morph Ball bombs; blast-boosting = "bomb jump" recovery extension (`itsamusbomb.c`). |
| `ftSs_Init.c` | — | Spawn/load callbacks. |

Also notable: her grapple-beam tether (zair/grab, `itsamusgrapple.c`) and the
"Extender" grapple glitch culture around it.
