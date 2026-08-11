# ftLink — Link (`ftLk_`)

Sword-and-toolkit mid-tier: projectiles for days, a tether grab (hookshot —
long range, slow whiff), heavy aerials, and a spike down-air.

| File | Move | Behavior |
|------|------|----------|
| `ftLk_SpecialN.c` | Bow | Chargeable arrows (`itlinkbow.c`, `itlinkarrow.c`). |
| `ftLk_SpecialS.c` | Boomerang | Out-and-back, can be angled; drags foes on return (`itlinkboomerang.c`). |
| `ftLk_SpecialHi.c` | Spin Attack | Multi-hit blade spin; recovery, plus grounded kill move. |
| `ftLk_SpecialLw.c` | Bomb | Pulls a throwable bomb (`itlinkbomb.c`) — bomb-jump recovery tech. |
| `ftLk_AttackAir.c` | Aerials | Split-out aerial code (down-air spike among them). |
| `ftLk_Init.c` | — | Spawn/load callbacks. |

Grab tether: `itlinkhookshot.c`. Clone: [Young Link](ftCLink.md).
