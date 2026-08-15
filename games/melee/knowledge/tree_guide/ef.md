# ef — Effects

Visual/particle effects: hit sparks, dust, trails, explosions. Effects are
requested by **gfx ID**; a dispatcher spawns the right `EF_Effect` with
attach/generator helpers (attach-to-bone, follow-position, one-shot).

| File | What it is |
|------|------------|
| `efsync.c` | Synchronous spawn path: big gfx-ID-range dispatch (`efSync_Spawn`) — fighters/items call this on the frame the effect appears. |
| `efasync.c` | Async/queued effect spawning. |
| `efalt.c` | Alternate dispatch table for another gfx-ID range (sibling of `efsync`). |
| `eflib.c` | Core `EF_Effect` machinery: update callbacks (SetRot/SetScale, transitions), lifetime, facing-direction helpers. |
| `efdata.c` | Effect descriptor data/tables. |
| `types.h` | `EF_Effect`, `EF_QueuedEffect`, `EF_EffectDesc`, `EF_UpdateFn`. |

Screen-wide flashes are `lb/lbbgflash.c`; the particle *renderer* itself is
sysdolphin.
