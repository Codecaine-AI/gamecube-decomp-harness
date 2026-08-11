# ftFox — Fox (`ftFx_`)

Melee's #1: the ultimate fastfaller — blistering speed, shine combos,
waveshine infinites. When people say "Melee tech skill" they usually mean
this folder's moves.

| File | Move | Behavior |
|------|------|----------|
| `ftFx_SpecialN.c` | Blaster | Rapid-fire laser that deals damage but **no hitstun** (gun `itfoxblaster.c`, shots `itfoxlaser.c`). |
| `ftFx_SpecialS.c` | Fox Illusion | Horizontal dash-blur; can be shortened. Recovery mixup (`itfoxillusion.c`). |
| `ftFx_SpecialHi.c` | Fire Fox | Charge, then rocket in any aimed direction wreathed in fire; main recovery. |
| `ftFx_SpecialLw.c` | Reflector — "the Shine" | Frame-1 hitbox that reflects projectiles; jump-cancellable, enabling waveshines and shine spikes. Arguably the best move in the game. |
| `ftFx_AppealS.c` | Side taunt | — |
| `ftFx_Init.c` | — | Spawn/load callbacks. |

Clone: [Falco](ftFalco.md). Kirby copy: `ftKirby/ftkirbyspecialfox.c`.
