# Support Libraries, Effects, Camera, Debug, Player, And Crowd Slice

Use this slice for `src/melee/lb/**`, `ef/**`, `cm/**`, `db/**`, `pl/**`, and
`sfx/**` targets. It groups smaller support systems whose patterns are highly
reusable but still path-scoped.

## lb Library

Common patterns:

- `lb/types.h` owns shared support structs such as `PreloadEntry`,
  `PreloadCacheScene`, `DynamicsData`, collision argument structs, and color
  payloads.
- `lbArchive` and `lbDvd` use varargs and public archive symbol names. Preserve
  vararg pairs and sentinel fields when source or objdiff evidence supports
  them.
- Collision helpers take typed `Vec3`, `HitCapsule`, `HurtCapsule`, `GXColor`,
  and matrix arguments. Prefer those prototypes over raw pointers.
- `lbMthp` movie playback has a global `Movieplayer` and rate-table/frame
  helpers; check those before simplifying generated state reads.

Repeated traps:

- An apparently unused vararg can still be required for matching, as seen in
  `lbHeap_80015DF8`.
- `sqrtf`, `sqrtf_accurate`, and local `__frsqrte` helpers can affect `.sdata2`
  and instruction shape.
- Library modules differ: do not generalize from collision to DVD, heap, MTHP,
  vector, or bgflash without sibling evidence.

## ef Effects

Common patterns:

- `efSync_Spawn` and `efalt` dispatch by gfx id and helper family. The source
  ranges explain when to call generator, attach, attach child, scale, position,
  and facing-dir helpers.
- `EF_Effect` update callbacks carry source meaning: SetRotY, SetRotYZ,
  SetScale, SetJObjOffset, transition, and fighter-direction helpers.
- Load kind and animation queue globals are real effect state, not incidental
  temporaries.

Repeated traps:

- Generated varargs are not all interchangeable `void*`; many are `Vec3*`,
  `HSD_JObj*`, scale, or facing-dir parameters.
- Huge switch-like generated output should be checked against neighboring gfx-id
  cases before rewriting.

## cm Camera

Common patterns:

- `cm/types.h` names `Camera`, `CmSubject`, `CameraTransformState`,
  `CameraBounds`, `CameraDebugMode`, `CameraUnkGlobals`, and callbacks.
- `camera.static.h` and camera globals control data layout. Check them before
  adding or moving statics.
- Accessors often simply expose singleton fields such as transform position,
  interest, background color, or mode flags.

Repeated traps:

- VI and debug camera callbacks are not independent; they call cm camera APIs.
- Raw singleton offsets should become fields when `cm/types.h` already exposes
  the structure.

## db Debug

Common patterns:

- Debug code was split from old monolithic assumptions into modules such as
  dbcamera, dbitem, dbsound, dbcpu, and dbscreenshot.
- `db.h` is the shared declaration surface. Check it before adding local
  declarations.
- Debug CPU/FPU work can require exact Dolphin `OSContext` layout.

Repeated traps:

- Old db_2253 ownership assumptions can be stale after module splits.
- Debug camera code often needs cm camera type checks too.

## pl Player

Common patterns:

- Player/bonus code often uses slot-indexed arrays, stale-move tables, match
  stats, and game-mode player/result data.
- `plbonuslib.c` has a local `my_sqrtf` with `__frsqrte`; replacing it can
  change matching and data layout.
- Player archive loading uses `lbArchive_LoadSymbols`, so archive symbol names
  and vararg pairs matter.

Repeated traps:

- Do not split array fields into scalars when source shows indexed data.
- Player/bonus struct edits can affect ft and gm headers.

## sfx Crowd

Common patterns:

- `crowdsfx.h` already names `CrowdSFX_UnkStruct`, `CrowdConfig`,
  `gCrowdConfig`, and crowd state globals.
- Crowd sound logic checks blastzone and knockback thresholds, so mpLib map
  boundary data can be relevant.

Repeated traps:

- Do not create a second crowd config layout when `crowdsfx.h` owns it.
- Existing `M2C_FIELD` accesses to map boundaries should be treated as bridge
  code if mpLib exposes a better typed field.

