# SObj subsystem semantic review

## Scope and result

The hash-bound research establishes complete canonical/rendered coverage of `sobjlib.c` and `sobjlib.h`, all 36 subjects, 78 baseline facts, and 16 links. This independent lead review inspected every proposed fact's canonical citations and the source evidence underlying all non-retain dispositions. All inherited ledger rows are adopted unchanged: 64 facts retained, 8 superseded, 6 unresolved; 14 links retained and 2 unresolved. Supported existing knowledge is explicitly retained, with no cosmetic fact rewrites.

The rendered C names usefully describe allocator initialization, removal, descriptor construction, display, and camera setup. They remain hypotheses, not canonical declarations. The header renderer reports six parse errors and no substitutions. Both removal type proposals therefore use canonical identifiers and separately qualify their aliases.

## Allocation, construction, and ownership

`HSD_SObjLib_803A44A4` initializes the persistent allocator for `sizeof(HSD_SObj)` with alignment 4. Inherited research establishes runtime registration of the cleanup descriptor and dynamic assignment of the object-kind byte; its zero-initialized declaration is not proof of a particular runtime kind. Allocator reinitialization is not equivalent to destroying existing SObjs.

`HSD_SObjLib_803A477C` allocates one record and asserts success. A non-null TLUT selects indexed primary-texture initialization. Nonzero `use_secondary` requires the extended descriptor layout and valid secondary image, initializes the secondary texture, and sets `0x4`. It initializes transforms, colors, callback, dimensions, UV bounds and owner before ordered insertion. Image/palette storage is passed to GX initialization, not copied here; removal frees the SObj record rather than image or palette allocations.

Evidence: [construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L151-L228).

## List ordering and destruction

`HSD_SObjLib_803A44D4` detaches the supplied node and reinserts it in ascending `u8` priority order after existing equal-priority nodes. Other nodes retain their relative order, but reinserting a node at the same priority can move it behind former peers. The routine does not update `sobj->gobj`; it is not a general cross-owner migration operation.

`HSD_SObjLib_803A466C` treats NULL as a no-op, repairs links and the registered head as needed, and returns every valid non-null input record to the pool, including an isolated record that is not the current head. `HSD_SObjLib_803A4740` saves each successor before removal and consumes the supplied forward chain, which can be a suffix. GObj detachment clears and returns the association; destruction is a separate operation.

Evidence: [relinking and removal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L37-L142), [canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.h#L72-L75), [attachment and destruction APIs](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L19-L45).

## Display traversal and callback lifetime

`HSD_SObjLib_803A49E0` starts at `gobj->hsd_obj`. An empty list is a no-op without a kind check. Each nonempty iteration checks the kind, reports and returns on mismatch, invokes the optional callback, draws the current SObj, and then reads its next pointer. Hidden objects can still receive callbacks. The current object must remain alive through the subsequent draw and next-pointer read; callback-induced relinking can affect traversal.

Evidence: [display traversal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L230-L248).

## Quad rendering and mode contracts

`HSD_SObjLib_803A4A68` emits one scaled, rotated XY quadrilateral using stored UV bounds and negated output Y coordinates. Flag `0x1` returns before graphics setup. Flag `0x2` uses the stored position as center; otherwise the center includes half the scaled dimensions.

The renderer itself leaves logical transforms, list membership, dimensions, UV bounds, flags and colors unchanged. **The containing HSD_SObj is not transitively immutable.** With `0x10` clear, GX receives the embedded primary texture descriptor and, when `0x4` is set, the secondary descriptor. `GXLoadTexObjPreLoaded` writes their `mode0`, `mode1`, `image0` and `image3` register-ID fields. For C4/C8, `GXLoadTlut` writes the embedded TLUT descriptor's region offset. The TLUT format check is independent of `0x10`.

Mode selection preserves exceptional combinations:

- `0x4` enables replacement Z texturing, LESS testing, one texgen and two active TEV stages; `0x8` disables depth writes in that path.
- Only with `0x4` clear does `0x10` select two texgens and four active stages. Ordinary mode selects one of each.
- The later `0x10` branch independently programs stages 0–3, samples externally bound maps 1, 2 and 0, installs fixed signed/konst colors, disables blending, and skips embedded texture loads.
- Thus `0x4|0x10` keeps one texgen/two active stages while programming the specialized branch. Its intended validity is unestablished.
- Only C4/C8 trigger local TLUT loading. C14X2 appears in the ordinary format switch without triggering that load. The switch has no default.
- Within the ordinary format switch, I/IA formats interpolate the stored colors using texture intensity; RGB565 uses stored color alpha; RGB5A3/RGBA8/indexed/CMPR modulate texture alpha by stored alpha. The separate `0x4` branch bypasses this switch.

The epilogue conditionally disables Z texturing, invalidates HSD state, initializes TEV state, clears vertex descriptors, and requests enabled LEQUAL testing with writes. It does not save and restore arbitrary incoming graphics state.

Inherited THP caller research is retained: that caller constructs a primary RGBA8 descriptor with a null image pointer, selects `0x10`, and binds one full-resolution and two half-resolution decoded planes before list display. Specialized mode therefore depends on external bindings rather than ordinary embedded-texture loading.

Evidence: [mode branches and loads](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L281-L401), [ordinary equations](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L404-L481), [geometry and cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L488-L528), [texture descriptor mutation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXTexture.c#L527-L575), [TLUT mutation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXTexture.c#L627-L645), [inherited THP integration evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_01F8.c#L32-L72).

## Camera setup and dispatch

`HSD_SObjLib_803A55DC` allocates an HSD_CObj for an existing caller-supplied GObj. It sets viewport/scissor dimensions, orthographic bounds `(left=0, right=width, top=0, bottom=-height)`, eye `(0,0,1)`, interest `(0,0,0)`, zero roll/near, and far 2. It attaches the camera and registers `HSD_SObjLib_803A54EC` on `gx_link_max+1`. Attachment asserts that no object is already attached. Neither previous-object destruction nor previous GX-membership removal occurs here. Repeated setup is not an unconditional replacement operation. The signed `int` priority is forwarded to a `u32` API.

On successful camera activation, the callback loads view matrix 0, installs identity texgens and static channel descriptors, enables one channel, dispatches rendering and ends the camera. Failure reports `Out CameraDisp Range` and skips that work. Both paths invalidate state and request depth mode `(1,3,1)`.

Dispatch argument `1` selects render pass 0. The camera GObj's `gxlink_prios` separately selects GX-link groups. Setup does not initialize that mask. The rendered helper name `HSD_GObj_SetTextureCamera` is not evidence for dispatch semantics.

Evidence: [camera routines](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L543-L605), [attachment precondition](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L19-L24), [insertion-only helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L10-L31), [priority registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L55-L70), [pass/group distinction](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L158-L182).

## Data-section uncertainty

Source establishes declarations, scalar values, vector initializers and TEV aggregate uses, not complete compiled placement. The handoff reports that `compiled-artifacts.json`, SHA-256 `7cc730f2f6d3335dc8c809487102feafb67ba8a60b0ac9b2a3bf68035844d746`, conflicts with legacy `.rodata` TEV attribution and the exclusively scalar `.sdata2` description. The artifact is unavailable in the lead inputs, so this review does not independently endorse its recorded placements. Six facts and two dependent links remain explicitly unresolved pending compiled provenance verification. Source-level TEV knowledge is preserved above; no fresh-build, binary-parity or exhaustive section-layout claim is made.

Status: synthesized; independent review and live promotion pending.
