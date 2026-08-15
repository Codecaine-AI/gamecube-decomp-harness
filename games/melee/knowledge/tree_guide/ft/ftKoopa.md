# ftKoopa — Bowser (`ftKp_`; "Koopa" is his JP name)

The heaviest, slowest character in Melee; huge range and armor-adjacent bulk
but famously bottom-tier. His moveset doubles as the base for
[Giga Bowser](ftGigaKoopa.md).

| File | Move | Behavior |
|------|------|----------|
| `ftKp_SpecialN.c` | Fire Breath | Sustained flame cone that shrinks as it depletes (`it/items/itkoopaflame.c`). |
| `ftKp_SpecialS.c` | Koopa Klaw | Command grab — bite victims or climb-and-slam; victim states in ftCommon (`ftCo_CaptureKoopa.c`, `ftCo_CaptureDamageKoopa.c`, `ftCo_ThrownKoopa.c`). |
| `ftKp_SpecialHi.c` | Whirling Fortress | Spins in his shell — recovery and his best out-of-shield option. |
| `ftKp_SpecialLw.c` | Bowser Bomb | Leaps and butt-slams straight down. |
| `ftKp_Init.c` | — | Spawn/load callbacks. |
