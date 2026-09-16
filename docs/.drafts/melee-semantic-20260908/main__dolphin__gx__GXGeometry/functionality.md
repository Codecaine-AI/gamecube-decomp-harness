## GXGeometry

Implements cached GX geometry/raster state and primitive-command submission. Canonical and rendered source were read completely; the renderer reported zero substitutions and zero parse errors. Existing function names fit their behavior and need no replacement.

### Submission and deferred state
- `__GXSetDirtyState` independently tests masks 0x1, 0x2, 0x4, 0x8 and 0x10, dispatching SU texture registers, BP mask, general mode, VCD and VAT in that order. It rereads the context for each test and finally clears the entire mask; it is not a snapshot-based or iterative dispatcher.
- `GXBegin` synchronizes nonzero dirty state, conditionally emits a flush primitive when the combined word read at `gx->unk` is zero, then writes the primitive/format byte and 16-bit vertex count. Its assertions depend on `DEBUG` being defined; state verification and begin-region activation are separately enclosed by `#if DEBUG`. Verification is skipped while recording a display list.
- `__GXSendFlushPrim` writes opcode 0x98 and `vNum`, then zero-valued words while `i < vNum * vLim`, advancing by four, and sets `bpSent = 1`. A zero product emits no payload words. The source does not establish a general divisibility invariant for the product.
- `GXCallDisplayList` shares the dirty-state synchronization and combined-word flush condition before its own command packet.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXGeometry.c#L8-L61; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/macros.h#L4-L27; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXDisplayList.c#L77-L99.

### Raster state
- Line width and point size occupy separate fields of the shared `lpSize` cache, with separate three-bit texture-offset selectors. Each setter emits the register unconditionally and clears `bpSent`; getters extract cached values rather than querying hardware.
- `GXEnableTexOffsets` independently sets line/point enable bits 18 and 19 in the selected `suTs0` entry, emits that register and clears `bpSent`.
- `GXSetCullMode` exchanges front/back values, passes other values through the switch, stores a two-bit field and marks mask 0x4 dirty. Its getter reverses the exchange. `__GXSetGenMode` emits the cached word and clears `bpSent`, but leaves dirty-mask clearing to the dispatcher.
- `GXSetCoPlanar` updates general-mode bit 19 and emits 0xFE080000 followed by the cached general-mode word. Unlike the other immediate setters here, it does not assign `bpSent` or change `dirtyState`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXGeometry.c#L63-L165.

### Cross-file state lifetime
GX initialization installs line and point pairs (6,0), disables both offset enables for all eight coordinates and disables coplanar mode. HSD line/point wrappers suppress calls only when both cached components match, then update both cache entries after forwarding. These HSD caches are distinct from GX register shadows; primitive-cache invalidation resets sizes and culling without resetting the offset caches. Polygon objects select none/front/back culling through HSD, but both culling flags together return without drawing. Texture-generator and channel-count setters contribute other fields to the shared general-mode cache and mark mask 0x4 for later BP submission.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXInit.c#L250-L280; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/state.c#L287-L339; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/state.c#L402-L407; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1237-L1259; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXAttr.c#L566-L572; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXLight.c#L562-L570.

### Review outcome
Retain 42 existing facts and all eight links. Correct two explanations: format-range rejection is assertion-dependent, and clearing `bpSent` alone does not guarantee a later flush. Preserve numeric bookkeeping and the combined-word condition rather than assigning a stronger Boolean meaning to `bpSent` or `unk`. No compiled section, binary-layout or build-configuration claims are made.

Status: synthesized; independent review and live promotion pending.
