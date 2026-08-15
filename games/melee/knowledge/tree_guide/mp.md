# mp — Map Collision

The stage's **collision geometry** as gameplay sees it: floors, walls,
ceilings, platforms, ledge-grab regions, blastzone bounds. Fighters (`ft`),
items (`it`), and stage logic (`gr`) all query `mp` every frame to stand,
slide, teeter, wall-jump, and grab ledges. Only four files, but nearly
everything that touches the ground calls into them.

| File | What it is |
|------|------------|
| `mplib.c` | The line/vertex database: collision lines with per-line flags (floor/wall/ceiling, ledge-grabbable, pass-through), line lookups by ID, boundary/blastzone data. |
| `mpcoll.c` | The collision *tests*: ECB (environmental collision box) sweeps against the line set — landing, wall pushes, ceiling bonks, ledge detection. Full of `OSReport` diagnostics with file/line strings (keep them; they're matching evidence). |
| `mpisland.c` | Grouped/moving collision "islands" — chunks of geometry that move together (e.g., Randall the cloud, moving platforms) `(?)`. |
| `types.h` | Line, flag, and boundary structs. |

Handy vocabulary: **ECB** = the diamond every fighter collides with;
**line ID** = index into the stage's collision line table (stage `.dat`
supplies the geometry, `gr` animates it, `mp` owns queries against it).
