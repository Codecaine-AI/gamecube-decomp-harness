# ftMewtwo — Mewtwo (`ftMt_`)

Big floaty psychic with a tail hurtbox problem; low tier but stylish —
teleport mixups, Shadow Ball zoning, and a unique grab-release meta.

| File | Move | Behavior |
|------|------|----------|
| `ftMt_SpecialN.c` | Shadow Ball | Chargeable dark blob that wobbles violently in flight; charging pushes Mewtwo backwards (`itmewtwoshadowball.c`). |
| `ftMt_SpecialS.c` | Confusion | Psychic flip that turns foes around and reflects (but doesn't re-own) projectiles. |
| `ftMt_SpecialHi.c` | Teleport | Long blink recovery. |
| `ftMt_SpecialLw.c` | Disable | Stuns a facing, grounded opponent helpless (`itmewtwodisable.c`); victim capture states `ftCo_CaptureMewtwo.c` / `ftCo_ThrownMewtwo.c` relate to his throws `(?)`. |
| `ftMt_Init.c` | — | Spawn/load callbacks. |
