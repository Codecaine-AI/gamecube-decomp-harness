# lb — Library

Melee's grab-bag of shared engine services — the layer between game modules
and sysdolphin/Dolphin SDK. If a facility isn't gameplay and isn't HAL's
baselib, it's probably here.

## File & memory

| File | What it is |
|------|------------|
| `lbarchive.c` | `.dat` archive loading & symbol lookup — the single most-used facility (every model/stage/character file goes through it). Vararg symbol-name APIs. |
| `lbdvd.c` | DVD read queue/threading. |
| `lbfile.c` | File table (filename → DVD entry). |
| `lbheap.c`, `lbmemory.c` | Heap management and memory init. |
| `lbarq.c` | ARAM transfer queue (streaming to/from audio RAM). |
| `lbcardgame.c`, `lbcardnew.c` | Memory-card save/load of game data and new-file creation. |

## AV & misc

| File | What it is |
|------|------------|
| `lbaudio_ax.c` | AX audio driver glue: SFX/BGM playback plumbing. |
| `lbmthp.c` | **THP movie player** (the "m-thp" pre-rendered videos: opening, How to Play). |
| `lbgx.c` | GX graphics helpers. |
| `lbshadow.c` | Fighter drop shadows. |
| `lbrefract.c` | Refraction/environment shader effects (e.g., Ice/glass looks) `(?)`. |
| `lbbgflash.c` | Fullscreen background flash (lightning strikes, PK Flash) `(?)`. |
| `lbsnap.c` | Framebuffer snapshot capture (camera mode photos). |
| `lbcollision.c` | Generic capsule/sphere collision math shared by hitbox systems. |
| `lbvector.c` | Vec3 math helpers (plus local accurate-sqrt idioms). |
| `lbanim.c` | Animation helpers over baselib. |
| `lblanguage.c` | Language (JP/EN) state. |
| `lbtime.c` | Time/RTC utilities. |
| `lbcommand.c` | Developer command/script hooks `(?)`. |
| `lb_XXXX.c` | Unidentified library code. |
