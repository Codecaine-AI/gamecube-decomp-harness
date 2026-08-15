# ftCaptain — Captain Falcon (`ftCa_`)

The fastest runner in the game and the poster child of Melee hype: fastfaller
built for combos ending in the Knee (his forward air). "Captain" folder —
also the base for his clone [Ganondorf](ftGanon.md).

| File | Move | Behavior |
|------|------|----------|
| `ftCa_SpecialN.c` | Falcon Punch | The meme: huge wind-up, flaming falcon-shaped haymaker. |
| `ftCa_SpecialS.c` | Raptor Boost | Dashing uppercut on contact (spikes in the air); helpless if whiffed offstage. |
| `ftCa_SpecialHi.c` | Falcon Dive | Rising grab that explodes off the victim and refreshes itself — recovery + command grab (victim state: `ftCo_CaptureCaptain.c`). |
| `ftCa_SpecialLw.c` | Falcon Kick | Flaming slide kick along the ground / diagonal dive in the air. |
| `ftCa_Init.c` | — | Spawn/load callbacks. |
