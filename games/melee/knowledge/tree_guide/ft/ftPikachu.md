# ftPikachu — Pikachu (`ftPk_`)

Quick, slippery, with one of the best recoveries in the game (double-zip
Quick Attack) and a legendary up-smash. Base for clone [Pichu](ftPichu.md).

| File | Move | Behavior |
|------|------|----------|
| `ftPk_SpecialN.c` | Thunder Jolt | Hopping spark that crawls along ground and edges (`itpikachutjoltground.c` / `air`). |
| `ftPk_SpecialS.c` | Skull Bash | Chargeable headfirst rocket; horizontal recovery add-on. |
| `ftPk_SpecialHi.c` | Quick Attack ("Agility") | Two instant zips in chosen directions — elite recovery. |
| `ftPk_SpecialLw.c` | Thunder | Calls a lightning bolt down through himself (`itpikachuthunder.c`). |
| `ftPk_Init.c` | — | Spawn/load callbacks. |
