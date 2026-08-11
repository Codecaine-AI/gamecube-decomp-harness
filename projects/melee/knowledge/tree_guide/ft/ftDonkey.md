# ftDonkey — Donkey Kong (`ftDk_`)

Big, fast-for-a-heavyweight grappler. Two signature mechanics get dedicated
files: the **cargo carry** (walking around with a grabbed opponent on his
shoulder — victim/interplay states are ftCommon `ftCo_Cargo*` and
`ftCo_Shouldered`) and **heavy-item hauling** (`ftDk_Heavy*`: unlike everyone
else, DK can walk, turn, and jump while lugging crates/barrels overhead).

| File | Move | Behavior |
|------|------|----------|
| `ftDk_SpecialN.c` | Giant Punch | Chargeable wind-up punch; charge persists (10 winds = fully charged KO fist). |
| `ftDk_SpecialS.c` | Headbutt | Buries grounded opponents in the floor (`ftCo_Bury*` states). |
| `ftDk_SpecialHi.c` | Spinning Kong | Horizontal helicopter spin, multi-hit; his recovery — lots of side, little up. |
| `ftDk_SpecialLw.c` | Hand Slap | Ground-only quake slaps that pop grounded foes up. |
| `ftDk_Heavy*.c` | Heavy carry | Wait/Walk/Turn/Jump/Fall/Landing while carrying heavy items. |
| `ftDk_Init.c`, `ftDk_MS_345_0.c` | — | Spawn/load callbacks; unidentified motion state. |
