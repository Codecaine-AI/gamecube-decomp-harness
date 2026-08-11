# db — Debug

The developer debug system famously left in retail (reachable via the DBLEVEL
debug menu). Split into thematic modules; historically one monolith
("db_2253"), so older notes may reference that.

| File | What it is |
|------|------------|
| `dbinit.c` | Debug bring-up and the master debug-level state. |
| `dbcamera.c` | Free-flying debug camera. |
| `dbcpu.c` | CPU-player control/AI override tools. |
| `dbitem.c` | Item spawning tools. |
| `dbanim.c` | Animation viewers/scrubbing. |
| `dbeffect.c` | Effect testing. |
| `dbsound.c` | Sound testing. |
| `dbbonus.c` | Bonus-award debugging (see `pl/plbonus.c`). |
| `dberror.c` | Crash/error screen (OSContext register dump, FPU state). |
| `dbscreenshot.c` | Screenshot capture. |
| `dballoc.c` | Allocation tracking. |
