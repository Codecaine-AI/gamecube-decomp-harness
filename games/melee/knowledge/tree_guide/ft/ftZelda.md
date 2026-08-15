# ftZelda — Zelda (`ftZd_`)

Slow, floaty spellcaster whose whole design pivots on **Transform**: she and
[Sheik](ftSeak.md) are two fighters sharing one player slot, swapping
mid-match with down B. Famous for "lightning kicks" (sweetspot f-air/b-air).

| File | Move | Behavior |
|------|------|----------|
| `ftZd_SpecialN.c` | Nayru's Love | Crystal shell — hits around her and **reflects** projectiles. |
| `ftZd_SpecialS.c` | Din's Fire | Steerable fireball detonated on release (`itzeldadinfire.c` + `explode`). |
| `ftZd_SpecialHi.c` | Farore's Wind | Vanish-and-reappear teleport recovery. |
| `ftZd_SpecialLw.c` | Transform | Becomes Sheik — actually loads/swaps the other Fighter (both `Pl*.dat`s are resident; this is why Zelda/Sheik matches load longer). |
| `ftZd_Init.c` | — | Spawn/load callbacks. |
