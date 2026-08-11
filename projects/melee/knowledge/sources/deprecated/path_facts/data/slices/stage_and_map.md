# Stage And Map Path Fact Slice

Use this slice for `src/melee/gr/**` and `src/melee/mp/**` targets. It is a
curated hint; current source, headers, assembly, objdiff, and regression output
remain final authority.

## gr Stages

Common patterns:

- Stage object callbacks usually recover `Ground* gp = GET_GROUND(gobj)` or an
  equivalent typed `Ground_GObj*`/`Ground*` pair.
- Stage-specific state belongs in `Ground::gv.<stage>` union arms in
  `gr/types.h`, not in duplicated local structs or unrelated stage overlays.
- `StageCallbacks` tables and `StageData` records near the top of a file are
  high-value evidence for setup, spawn, OnLoad, OnLeave, and object callback
  signatures.
- Stage data often mixes callback tables, route arrays, material data, archive
  symbol names, and local constants. Section ownership matters.

Key structures and locations:

- `src/melee/gr/types.h`: `Ground`, `GroundVars`, stage data overlays.
- `src/melee/gr/ground.c` and `ground.h`: shared ground allocation/setup.
- `src/melee/gr/stage.h`: shared stage metadata.
- `src/melee/gr/granime.c` and `granime.h`: stage animation helpers.
- Per-stage `gr*.h` and `gr*.static.h` files: prototype and local data surfaces.

Useful source examples:

```c
Ground* gp = GET_GROUND(gobj);
StageCallbacks* callbacks = &grIm_803E4718[gobj_id];
Ground_SetupStageCallbacks(gobj, callbacks);
gp->gv.icemt.xC8 = Ground_801C3FA4(gobj, 3);
```

Repeated known traps:

- Do not use a different stage's `GroundVars` arm just because a generated
  offset happens to line up.
- Do not duplicate `Ground`/map data allocation layouts when `Ground` already
  owns the size and named fields.
- Stage files often interact with item and map collision systems. Check item
  and mp headers when stage code spawns items or reads collision lines.
- Data table fixes can look like harmless static renames but affect `.data`,
  `.sdata`, `.sdata2`, and split metadata.

Corpus anchors:

- `grAnime` helpers and callback exports:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:719`.
- Rainbow Cruise Ground union overlays:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:1729`.
- Shared `Ground` struct recovery:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:10609`.
- Stage animation helpers:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:10639`.

## mp Map Collision

Common patterns:

- Map collision code is shared by fighters, items, stages, and crowd SFX. Keep
  signatures stable until caller evidence is checked.
- `mp/types.h`, `mplib.h`, and `mpcoll.h` define line/collision structs,
  environment flags, draw helper prototypes, and debug-draw colors.
- Diagnostic `OSReport` strings with file and line numbers are matching
  evidence. Do not remove them during cleanup unless objdiff proves it.
- Debug drawing uses many `GXColor` constants and line/floor/ceiling/wall
  categories; type them instead of leaving raw arrays.

Useful source examples:

```c
mpLib_SetupDraw(GXColor color);
mpLib_DrawMatchingLines(int value, int flag, GXColor color);
OSReport("%s:%d: Error: mpCollEnd() ...", __FILE__, line);
```

Repeated known traps:

- Map boundary globals may look like raw float arrays in generated output. Check
  `mpLib` data and types before adding new `M2C_FIELD` paths.
- Draw-color constants and collision-line IDs often explain otherwise strange
  data order.
- Changing mp signatures can ripple into fighter collision, item collision,
  ground callbacks, and crowd SFX near-blastzone checks.

Corpus anchors:

- `mpisland` typed traversal:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:2749`.
- `mpLib` matching and prototypes:
  `knowledge/sources/code_context/past_prs/data/prs/known_fixes.md:11059`.

