# Fog Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Fully read cobj-independent owned fog.c 1–254 and fog.h 1–67 canonically and rendered. Exact hashes, UTC timings and receipts are in coverage.json. No parse errors. C reports HSD_FogAddAnim name_collision and makes no substitutions; header makes one.

## Source-Defined Functions

| Function | Signature | Behavior | Evidence |
|---|---|---|---|
| HSD_FogSet | `void(HSD_Fog* fog)` | Null disables depth fog and returns without range-adjustment reset. Non-null requires current CObj, programs type/range/color with camera near/far, then enables range adjustment or explicitly disables it. Center formula is viewport_x + viewport_width*(center+320)/640, converted to s32 then clamped 0..640. Width zero reconstructs current projection; nonzero uses stored matrix. | [19–84](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L19-L84) |
| HSD_FogAlloc | `HSD_Fog*(void)` | Allocates through hsdNew using hsdFog and asserts result. | [86–91](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L86-L91) |
| HSD_FogLoadDesc | `HSD_Fog*(HSD_FogDesc* desc)` | Allocates fog and initializes scalar/color fields. Requires desc because fogadjdesc is dereferenced after initialization. Optional adjustment is separately allocated. | [93–102](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L93-L102) |
| HSD_FogInit | `void(HSD_Fog* fog, HSD_FogDesc* desc)` | Null destination no-op. Descriptor copies type,start,end,color only. Null descriptor creates linear opaque-white fog using viewport elements 4 and 5. Does not touch aobj or fog_adj. | [104–124](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L104-L124) |
| HSD_FogAdjAlloc | `HSD_FogAdj*(void)` | Allocates through hsdNew using hsdFogAdj and asserts result. | [126–131](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L126-L131) |
| HSD_FogAdjLoadDesc | `HSD_FogAdj*(HSD_FogAdjDesc* desc)` | Allocates and invokes adjustment initializer, accepting a null descriptor for defaults. Does not itself complete descriptor matrix fourth row. | [133–139](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L133-L139) |
| HSD_FogAdjInit | `void(HSD_FogAdj* adj, HSD_FogAdjDesc* desc)` | Null destination no-op. Descriptor copies width, converts unsigned descriptor center into signed destination center, and copies 48 matrix bytes. Null descriptor converts viewport width into u16, assigns width/2 to s16 center and explicitly completes identity fourth row. | [141–160](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L141-L160) |
| HSD_Fog_8037DE7C | `void(HSD_Fog* fog, HSD_AObjDesc* desc)` | Null fog no-op. Removes existing aobj, then loads and stores replacement. Null descriptor clears attachment through the loader. | [163–171](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L163-L171) |
| HSD_FogReqAnim | `void(HSD_Fog* fog, f32 frame)` | Forwards fog/frame with mask 0x7FF. Only fog-category bit 0x200 matters to callee. | [173–176](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L173-L176) |
| HSD_FogReqAnimByFlags | `void(HSD_Fog* fog, u32 flags, f32 frame)` | Null fog or missing 0x200 no-op; otherwise forwards aobj/frame to shared animation request. | [178–184](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L178-L184) |
| HSD_FogInterpretAnim | `void(HSD_Fog* fog)` | Null no-op; otherwise calls AObj interpreter with fog context and FogUpdateFunc callback. | [186–191](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L186-L191) |
| FogUpdateFunc | `void(void* obj, enum_t type, HSD_ObjData* val)` | Treats obj as HSD_Fog*. Null fog no-op. Types 1/2 write start/end, 5..8 scale fv by 255 into RGBA, 20 writes s16 center only with adjustment. Unknown types ignored; no value clamps or pointer guard on handled value reads. | [193–223](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L193-L223) |
| FogRelease | `static void(HSD_Fog* fog)` | Requires valid fog. Optional adjustment goes through ref_DEC and conditional virtual release/destroy. Then removes aobj and calls parent release. Does not clear attached pointers. | [225–238](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L225-L238) |
| FogInfoInit | `static void(void)` | Registers hsd_fog under hsdObj with Fog sizes, then assigns FogRelease. | [240–246](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L240-L246) |
| FogAdjInfoInit | `static void(void)` | Registers hsd_fogadj under hsdObj with FogAdj sizes; no local release override. | [248–253](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fog.c#L248-L253) |

HSD_FogAlloc and HSD_FogAdjAlloc are named source-defined functions without frozen target identities. Their behavior is inventoried; no target is invented. All 19 parameter entities have signatures and role records in coverage.json.

## Corrections

The descriptor branch copies only 48 bytes of an Mtx44. The fourth row remains untouched by HSD_FogAdjInit; the default branch explicitly writes a complete identity. HSD_FogAdjLoadDesc therefore does not establish a fully copied descriptor matrix.

HSD_FogReqAnim forwards 0x7FF, but its callee tests only category bit 0x200. It does not select individual start/end/color properties. FogUpdateFunc channels 1,2,5–8,20 perform the actual property dispatch. No clamp validates animated color or center values.

FogRelease follows the actual ref_DEC convention, including HSD_OBJ_NOREF and old-count-zero cases. The owned routine invokes virtual release/destroy only on that true result and then removes AObj and releases the parent.

HSD_FogAddAnim remains an inference. The canonical signature is HSD_Fog_8037DE7C; the question-mark comment is a hypothesis, not an original symbol.

## Limits and Coverage

All 37 subjects and 80 facts reviewed. Dispositions: {'retain': 57, 'supersede': 7, 'reject': 0, 'unresolved': 16}. Nine proposal writes await review. Four data-section targets have 14 unresolved facts requiring compiled attribution. Source metadata, literal and string uses are recorded independently.

Header declarations were fully reviewed. HSD_FogAdj declares Mtx44 at 0x0C but comments aobj at 0x3C, inside that declared matrix extent. No ABI fix is inferred. HSD_FogAdjDesc center is u16 while runtime center is s16; field conversion follows ordinary assignment. Shared HSD/GX types remain family-owned.

Foreign canonical reads confirm matrix copy extent, class registration, reference decrement, AObj requests/loading/interpreter branches. Absolute NO_UPDATE write suppression and default center being geometrically neutral remain unresolved. No source, shared KB, Git, matching or UI changes.
