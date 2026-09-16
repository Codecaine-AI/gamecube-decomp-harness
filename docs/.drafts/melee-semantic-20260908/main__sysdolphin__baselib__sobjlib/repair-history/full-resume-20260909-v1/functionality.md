# sobjlib functionality review

Draft pinned to c302741689bd67c361cd7faadb221df3193992c3. Canonical source and baseline-rendered C1-606/H1-85 are covered through EOF: 691 helper-counted lines, 689 excluding trailing empty lines. All 15 targets, 36 subjects, 78 old facts and 16 outgoing links are reviewed. No source changes, builds, publication or shared-KB writes. Independent review is pending.

## Object layout and pooled lifetime

The eight-byte HSD_SObjDesc holds image and optional TLUT pointers. HSD_SObjDesc2 extends it with image2 at offset8 and has size12. HSD_SObj stores intrusive next/prev at4/8, owner at12, position at16/20, angle24, scales28/32, UV bounds36-48, image dimensions52/54, RGBA colors56/60, flags64, u8 priority68, auxiliary state72, callback76, primary GXTexObj80, GXTlutObj112 and secondary GXTexObj124. The unused x0 and auxiliary state receive zero on construction; this TU does not establish broader semantics for them. The rendered header retained canonical declarations because the parser reported six errors; all declarations and field lines were inspected directly.

803A44A4 initializes the persistent HSD_ObjAllocData for sizeof(HSD_SObj), alignment4. The foreign allocator removes old registry references, clears state, sets unlimited defaults and inserts the descriptor into its registry. This reset is not a live-object reclamation operation. Common game initialization registers the cleanup table, stores its kind ID, initializes the pool, and finalizes GObj initialization.

803A477C requires a primary image descriptor, allocates a record and asserts success. Nonnull TLUT selects GXInitTexObjCI and GXInitTlutObj; otherwise GXInitTexObj initializes the primary texture. Nonzero secondary input requires the extended descriptor/image2, initializes an ordinary secondary texture and sets flag4. Image/palette payloads remain borrowed: there is no pixel copy or data ownership transfer. Defaults are null links, x0 and callback, zero position/angle/auxiliary state, unit scale, white colors, and full-image normalized UV bounds. The owner is stored before priority insertion. No local pointer or zero-dimension validation exists.

## Ordering, removal and callbacks

803A44D4 detaches a linked node or unregisters an isolated current head, then inserts by ascending u8 priority. Equal insertion passes existing equal nodes. Reordering an existing peer therefore moves it after the equal group; it does not retain its prior equal-priority position. Head changes detach and attach the object pointer. This routine never changes sobj->gobj, so callers must supply a consistent existing owner; arbitrary cross-owner moves are not supported by this implementation.

803A466C is a null-safe single-node removal. It repairs neighbors and the registered head and returns the SObj record to the allocator. Every nonnull input is freed even when it is isolated and not the current GObj head. Texture and palette payloads are not freed. 803A4740 saves next before removing each record, consuming the supplied forward chain; valid acyclic membership is required.

803A49E0 checks object kind during every nonempty iteration, reports and exits on mismatch, invokes the optional object callback, then renders. Empty lists skip kind validation. Next is read after callback and drawing, so self-free or mutation safety is not guaranteed. Hidden objects still receive callbacks because drawing suppression happens in the individual renderer.

## Quad rendering and mode contracts

803A4A68 returns immediately for flag1. Flag2 uses the stored position as the center; otherwise half the scaled dimensions are added. Sine/cosine of angle rotate four local corners; output negates Y and emits the corresponding UV corners. The SObj itself is not modified.

Flag4 enables Z24X8 replacement using the secondary texture and LESS depth comparison; flag8 disables depth writes in that branch. Without flag4, depth comparison is ALWAYS with writes disabled. Flag0x10 normally selects two texture generators and four TEV stages. Combined4+0x10 is not validated: initial state selects two stages through the flag4 branch but later TEV configuration selects the four-stage flag0x10 branch. These modes cannot be described as independently compatible.

The special mode samples externally bound maps1/2 through coordinate1, incorporates map0 through coordinate0, and combines signed {-90,0,-114,135} with konst colors 0000E258/B30000B6/FF00FF80. It disables blending. The THP caller constructs a mode0x10 SObj with no primary image payload and binds full-size plane0 plus half-size planes1/2 before calling list display. This is concrete caller evidence for the specialized three-texture path.

Ordinary rendering loads the primary texture. TLUT loading recognizes C4/C8 only; C14X2 appears in the combiner switch but is not included in the palette-load condition. Flag4 additionally loads the secondary depth texture. Intensity and intensity-alpha formats interpolate the two colors and use texture alpha. RGB565 uses multiplied color with constant alpha. RGB5A3/RGBA8/C4/C8/C14X2/CMPR multiply texture color and alpha by the selected color components. Unsupported formats have no default combiner setup. Ordinary paths use source-alpha blending.

Completion disables Z texture only when flag4 was used, invalidates HSD state, initializes TEV, clears vertex descriptors and selects LEQUAL/write-enabled depth. These are known reset commands, not restoration of the complete incoming GX state.

## Camera setup and dispatch

803A55DC creates an HSD_CObj and attaches it to an existing supplied GObj. The attach helper asserts an empty object kind: the routine does not replace or free an existing attachment. It also assumes suitable initial GX-link membership. Eye=(0,0,1), interest=(0,0,0), roll/near=0, far=2; orthographic top/left are0, bottom is negative height and right is width.

Viewport bounds pass through a signed16 view, while scissor stays unsigned16. Values above32767 become negative viewport bounds on the target and diverge from orthographic/scissor dimensions. No local bounds check exists. The int priority passes to a u32 API and is stored in the GObj's u8 render_priority; ascending registration therefore orders its low byte.

803A54EC makes the attached camera current, loads its view matrix into position matrix0, supplies two identity texcoord generators reading TEX0, installs separate RGB/alpha channel descriptors and enables one channel. HSD_GObj_80390ED0(gobj,1) dispatches callback pass0 for the GX lists selected by gobj->gxlink_prios. Its rendered foreign alias HSD_GObj_SetTextureCamera is misleading; canonical dispatch code was inspected. Successful display ends the current camera; failed activation reports. Both ordinary return paths invalidate the cache and enable LEQUAL depth with writes.

## Data-section corrections

| Section | Actual payload in inspected objects |
|---|---|
| .bss | 44-byte allocator descriptor, plus4 split-object padding bytes |
| .data | Cleanup pointer/descriptor, diagnostic strings, fifteen-entry texture-format jump table, two48-byte HSD_Chan records; source238/split240 bytes |
| .rodata | Two Vec3 initializers, eye and interest;24 bytes |
| .sbss | One kind-ID byte; split object adds7 padding bytes |
| .sdata | Five-byte assertion expression string sobj plus split padding |
| .sdata2 | Scalar floats, two conversion-bias doubles, signed TEV color and three konst colors;56 bytes |

The previous .rodata facts misidentified camera vectors as TEV coefficients. Both object symbol tables and bytes place those coefficients at .sdata2 offsets16-35. The .data jump-table zero placeholders have case relocations; they are not zero runtime state. Existing object and assembly SHA-256 values are saved, and no freshness or parity claim is made.

## Naming, links and review status

Ten existing naming hypotheses remain: eight functions and two section labels. Each has a single exact baseline assignment and no pinned canonical source occurrence. No new alias or historical spelling claim is proposed. Retain canonical803A44D4.

Fact dispositions:55 retain,23 supersede;21 new facts cover20 parameters and the .sdata string. Dry-run validates99 operations, zero rejected/skipped. All16 exact original link records are preserved. Fourteen relationships are retained. Both exact .rodata relationships are rejected because their stored rationales wrongly identify camera vectors as TEV coefficients. Camera support cannot replace the stored TEV explanation under retention. No link is deleted or reassigned.

See [proposal.json](proposal.json), [fact-dispositions.json](fact-dispositions.json), [link-dispositions.json](link-dispositions.json), [subjects.json](subjects.json), [naming.md](naming.md), [compiled-artifacts.json](compiled-artifacts.json), [foreign-canonical.json](foreign-canonical.json), and [family-followups.json](family-followups.json).

Pinned evidence: [pool/order/removal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L19-L142), [constructor/traversal](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L151-L248), [render modes](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L255-L395), [format/geometry/reset](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L396-L528), [camera](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L530-L605), [owned layout](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.h#L14-L84).

Immutable canonical/rendered snapshots:

- [src__sysdolphin__baselib__sobjlib.c.201-400.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__sobjlib/pages/src__sysdolphin__baselib__sobjlib.c.201-400.json)
- [src__sysdolphin__baselib__sobjlib.h.1-85.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__sobjlib/pages/src__sysdolphin__baselib__sobjlib.h.1-85.json)
- [src__sysdolphin__baselib__sobjlib.c.1-200.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__sobjlib/pages/src__sysdolphin__baselib__sobjlib.c.1-200.json)
- [src__sysdolphin__baselib__sobjlib.c.401-606.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__sobjlib/pages/src__sysdolphin__baselib__sobjlib.c.401-606.json)
