# ftNess — Ness (`ftNs_`)

The PSI kid from EarthBound: floaty, unusual smashes (yo-yos and a bat that
**reflects** projectiles), double jump cancel aerials, and a recovery that
requires hitting *himself* with his own projectile.

| File | Move | Behavior |
|------|------|----------|
| `ftNs_SpecialN.c` | PK Flash | Slow, steerable chargeable green blast (`itnesspkflash.c` + `explode`). |
| `ftNs_SpecialS.c` | PK Fire | Bolt that ignites a damage pillar on contact (`itnesspkfire.c` + `pillar`). |
| `ftNs_SpecialHi.c` | PK Thunder | Steerable thunder-head; steer it into himself to launch as "PK Thunder 2" — his recovery, and edgeguardable by eating the tail (`itnesspkthunderball.c` + `trail`). |
| `ftNs_SpecialLw.c` | PSI Magnet | Absorbs energy projectiles as healing. |
| `ftNs_AttackS4.c` / `ftNs_AttackHi4.c` / `ftNs_AttackLw4.c` | Smashes | Bat (reflects! `itnessbat.c`) / up yo-yo / down yo-yo (`itnessyoyo.c`). |
| `ftNs_Init.c` | — | Spawn/load callbacks. |
