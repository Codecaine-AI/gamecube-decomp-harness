# Texture-object semantic review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical and separate rendered reads: C1–1627, H1–315. C has seven parse errors and zero substitutions; H has zero errors/substitutions. No unread owned ranges. Counts: {'owned_files': 2, 'owned_lines': 1942, 'targets': 48, 'function_targets': 44, 'writable_subjects': 113, 'parameter_entities': 64, 'file_entities': 1, 'existing_facts': 212, 'source_functions': 59, 'source_only_functions': 15, 'proposals': 10, 'dispositions': {'unresolved': 19, 'retain': 183, 'supersede': 10}}.

## Functionality

The TU loads texture objects and shallow descriptor resources, manages animation attachments, assigns finite GX map/coordinate resources, constructs mode-specific texture transforms, builds TEV expressions, configures textures/TLUTs, and manages class lifecycle. Header fields and masks are read as canonical declarations, not inferred replacements.

### `HSD_TObjRemoveAnim`

`void HSD_TObjRemoveAnim(HSD_TObj* tobj)`

NULL object is ignored; otherwise removes its AObj and clears aobj without altering image/palette resources.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L27-L35

### `HSD_TObjRemoveAnimAll`

`void HSD_TObjRemoveAnimAll(HSD_TObj* tobj)`

Traverses next links and removes/clears each animation controller, leaving texture nodes and links intact.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L37-L46

### `lookupTextureAnim`

`static HSD_TexAnim* lookupTextureAnim(s32 id, HSD_TexAnim* texanim)`

Returns the first animation descriptor whose GX map ID equals the supplied s32 ID cast to GXTexMapID; returns NULL at list end.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L48-L57

### `HSD_TObjAddAnim`

`void HSD_TObjAddAnim(HSD_TObj* tobj, HSD_TexAnim* texanim)`

For a non-NULL texture and matching descriptor, replaces AObj and image-table pointer, removes prior loaded palettes and their pointer array, loads n_tluttbl palettes into a NULL-terminated allocation or stores NULL, and stores palette sentinel 255. No table-count validation is added.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L59-L92

### `HSD_TObjAddAnimAll`

`void HSD_TObjAddAnimAll(HSD_TObj* tobj, HSD_TexAnim* texanim)`

Visits all texture nodes and calls AddAnim with the same descriptor list; unmatched objects remain unchanged.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L94-L103

### `HSD_TObjReqAnimByFlags`

`void HSD_TObjReqAnimByFlags(HSD_TObj* tobj, f32 startframe, u32 flags)`

For non-NULL tobj and flags containing TOBJ_ANIM, forwards aobj and the unchanged startframe to HSD_AObjReqAnim.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L105-L112

### `HSD_TObjReqAnimAllByFlags`

`void HSD_TObjReqAnimAllByFlags(HSD_TObj* tobj, f32 startframe, u32 flags)`

Traverses texture list, forwarding the same frame and mask to the per-object request helper.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L114-L123

### `HSD_TObjReqAnim`

`void HSD_TObjReqAnim(HSD_TObj* tobj, f32 startframe)`

Forwards object and frame to the by-flags helper with TOBJ_ANIM.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L125-L128

### `HSD_TObjReqAnimAll`

`void HSD_TObjReqAnimAll(HSD_TObj* tobj, f32 startframe)`

Forwards list and frame to the all-by-flags helper with TOBJ_ANIM.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L130-L133

### `TObjUpdateFunc`

`static void TObjUpdateFunc(void* obj, enum_t type, HSD_ObjData* val)`

NULL obj returns. Image selection casts float to int, asserts an image table and reads its indexed entry without bounds checks. Palette selection narrows to u8 when tluttbl exists. Blend and LOD scalar writes and TEV channels (255*value narrowed to u8) are direct; relevant attached pointers are required. Rotation XYZ, translation XY and scale XY writes set TEX_MTX_DIRTY. Unknown types do nothing. No color clamp or index validation is implemented.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L135-L227

### `HSD_TObjAnim`

`void HSD_TObjAnim(HSD_TObj* tobj)`

NULL-safe dispatch of the object aobj, owner pointer and TObjUpdateFunc callback into HSD_AObjInterpretAnim.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L229-L236

### `HSD_TObjAnimAll`

`void HSD_TObjAnimAll(HSD_TObj* tobj)`

Traverses all next-linked texture nodes and dispatches animation for each.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L238-L249

### `TObjLoad`

`static int TObjLoad(HSD_TObj* tobj, HSD_TObjDesc* td)`

Recursively loads next descriptor; copies ID, source, rotation XYZ, scale, translation, wrap/repeat, blend, filter and borrowed image/LOD pointers. Loads separate TLUT and TEV records. Sets GX_IDENTITY matrix ID, NULL aobj, dirty flag and u8 palette sentinel255. Does not compute matrix or initialize Quaternion W explicitly; returns0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L251-L278

### `HSD_TObjLoadDesc`

`HSD_TObj* HSD_TObjLoadDesc(HSD_TObjDesc* td)`

NULL descriptor returns NULL. Missing/unregistered class name uses HSD_TObjAlloc and its selected default class; registered class uses hsdNew and asserts success. Calls runtime load method, ignores its return value, returns object. Does not validate named class ancestry here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L280-L297

### `HSD_TlutLoadDesc`

`HSD_Tlut* HSD_TlutLoadDesc(HSD_TlutDesc* tlutdesc)`

NULL returns NULL; otherwise allocates a TLUT record and shallow-copies sizeof(HSD_Tlut) bytes. The palette payload pointer remains shared.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L299-L307

### `HSD_TObjTevLoadDesc`

`HSD_TObjTev* HSD_TObjTevLoadDesc(HSD_TObjTevDesc* tevdesc)`

NULL returns NULL; otherwise allocates a TEV record and copies sizeof(HSD_TObjTev) bytes from layout-compatible descriptor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L309-L317

### `_HSD_TObjGetCurrentByType`

`HSD_TObj* _HSD_TObjGetCurrentByType(HSD_TObj* from, u32 mapping)`

Starts at global current head when from is NULL, otherwise at from->next; returns first flags&0xF equal to mapping, else NULL. Does not filter GX_TEXMAP_NULL nodes.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L319-L338

### `HSD_TexMapID2PTTexMtx`

`static u32 HSD_TexMapID2PTTexMtx(GXTexMapID id)`

Maps GX_TEXMAP0..7 to GX_PTTEXMTX0..7; invalid values invoke panic with fixed text, followed by syntactic zero fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L340-L363

### `MakeTextureMtx`

`static void MakeTextureMtx(HSD_TObj* tobj)`

Requires nonzero repeats. XY scale factors are repeat/scale except abs(scale)<1e-10 selects zero; Z scale is copied. Uses rotation XYZ with negated Z as Euler input, negates X/Y translation, adds mirror-T correction computed with its own division, copies Z translation, and composes scale*rotation*translation. The near-zero scale guards do not guard the mirror correction division.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L365-L397

### `TObjSetupMtx`

`static void TObjSetupMtx(HSD_TObj* tobj)`

Toon returns before dirty processing. Other modes call runtime make_mtx once when dirty then clear dirty. Reflection loads biased half-scale matrix; highlight uses current infinite-light direction in camera space and normalized shifted vector or fixed fallback without a light; shadow concatenates with inverse view. Default bump loads2x4, other default modes3x4. Current-camera and valid-vector obligations remain.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L399-L483

### `setupTextureCoordGen`

`static void setupTextureCoordGen(HSD_TObj* tobj)`

Shadow uses position and PNMTX0 plus post matrix; reflection/highlight use normals and TEXMTX0 with normalization plus post matrix. Default bump uses direct2x4 transform; other defaults use identity plus post transform.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L485-L509

### `setupTextureCoordGenBump`

`static void setupTextureCoordGenBump(HSD_TObj* bump)`

Selects first diffuse-light mask bit0..7 or defaults0, then emits bump generator at coord+1 using the base coordinate as source.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L511-L533

### `setupTextureCoordGenToon`

`static void setupTextureCoordGenToon(HSD_TObj* toon)`

Emits SRTG texture generation from toon src with identity matrix.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L535-L539

### `HSD_TObjSetupTextureCoordGen`

`void HSD_TObjSetupTextureCoordGen(HSD_TObj* tobj)`

Skips disabled map IDs; bump takes priority and installs base plus derived generator, then non-bump toon gets SRTG, otherwise generic generation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L541-L556

### `TObjSetupTevModulateShadow`

`static void TObjSetupTevModulateShadow(HSD_TObj* shadow)`

For the contiguous TEX_COORD_SHADOW run, assigns stages and writes map/coord into static modulation descriptor; does not independently skip disabled map IDs.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L558-L578

### `SetupEmbossBumpTev`

`static void SetupEmbossBumpTev(HSD_TObj* bump)`

Configures two stages from a shared descriptor: add at base coord with color clamp disabled, then subtract at coord+1 with color clamp enabled.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L580-L605

### `HSD_TObjSetupVolatileTev`

`void HSD_TObjSetupVolatileTev(HSD_TObj* tobj, u32 rendermode)`

Ignores rendermode. Outer traversal skips disabled IDs, configures bump stage pairs, and at first shadow-lightmap flag delegates contiguous coordinate-shadow run then breaks, even if that run is empty.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L607-L623

### `MakeColorGenTExp`

`static void MakeColorGenTExp(u32 lightmap, HSD_TObj* tobj, HSD_TExp** c, HSD_TExp** a, HSD_TExp** list, int repeat)`

Scans four color and four alpha selectors to allocate referenced konst/tev0/tev1 constant nodes. Creates ordered TEV node; active color and alpha flags independently configure operations and replace c/a. Color supports zero/one/half/textureRGB/textureA/custom sources; alpha supports zero/textureA/custom sources, not immediate one or half. Saved register inputs use auxiliary clamped add stages. Invalid active selectors assert. lightmap and repeat arguments unused.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L625-L919

### `TObjMakeTExp`

`static void TObjMakeTExp(HSD_TObj* tobj, u32 lightmap, u32 lightmap_done, HSD_TExp** c, HSD_TExp** a, HSD_TExp** list)`

Creates ordered color combiner and optional custom sources, then handles color alpha-mask/RGB-mask/blend/modulate/replace/pass/none/add/sub modes. Alpha supports alpha-mask/blend/modulate/replace/pass/none/add/sub only when lightmap_done does not intersect object lightmap flags; repeat leaves *a unchanged. Blend constants reference tobj->blending. Unsupported modes assert.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L921-L1046

### `HSD_TObjAssignResources`

`s32 HSD_TObjAssignResources(HSD_TObj* tobj_top)`

Finds last toon and last non-toon bump; ordinary ceiling8 minus1 for toon and2 for bump. Disables earlier special nodes and ordinary overflow. Assigns ordinary map/post-matrix IDs, projected coordinates first, UV coordinates second. Last bump gets TEXMTX9 and two coordinates; last toon gets one coordinate. Returns coordinate count. Unknown coordinate modes can retain previous coord fields; does not clear unused fields.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1048-L1126

### `DifferentTluts`

`static int DifferentTluts(HSD_Tlut* t0, HSD_Tlut* t1)`

Compares only n_entries. MUST_MATCH also contains t0->lut != t0->lut, a self-comparison that cannot distinguish palette pointers. Neither pointer identity, contents nor format participates in equivalence.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1128-L1135

### `HSD_TObjSetup`

`void HSD_TObjSetup(HSD_TObj* tobj)`

Sets global head even for NULL. Assigns resources/registers highest coordinate, skips disabled maps, prepares matrices and asserts image descriptor/payload. Selects default or explicit LOD. Indexed formats select palette via sentinel/table and reuse GX name for equal entry count only; new counts load normal slots below256 or large slots otherwise, with eight-record fallback. Initializes indexed or direct GX texture, downgrades indexed trilinear min filter and masks non-mipmap min filter, applies LOD and loads texture.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1137-L1248

### `HSD_TGTex2Index`

`u32 HSD_TGTex2Index(GXTexGenSrc tgtex)`

Maps GX_TG_TEX0..7 to unsigned0..7; other values assert, with token GX_TG_TEX0 as syntactic fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1250-L1273

### `HSD_TexCoordID2TexGenSrc`

`GXTexGenSrc HSD_TexCoordID2TexGenSrc(GXTexCoordID coord)`

Maps GX_TEXCOORD0..6 to matching GX_TG_TEXCOORD sources. Coordinate7 and other values assert; fallback is source0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1275-L1297

### `HSD_TexCoord2Index`

`u32 HSD_TexCoord2Index(GXTexCoordID coord_id)`

Maps coordinate IDs0..7 to ordinals0..7, asserts other values, with coordinate0 token fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1299-L1322

### `HSD_Index2TexCoord`

`GXTexCoordID HSD_Index2TexCoord(u32 index)`

Maps ordinals0..7 to coordinate IDs0..7, asserts other values, fallback coordinate0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1324-L1347

### `HSD_TexMtx2Index`

`u32 HSD_TexMtx2Index(GXTexMtx texmtx)`

Maps matrices0..9 to ordinals0..9 and GX_IDENTITY to10. Invalid values panic; syntactic unsigned-minus-one fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1349-L1378

### `HSD_Index2TexMtx`

`GXTexMtx HSD_Index2TexMtx(u32 index)`

Maps0..9 to matching texture matrix IDs and10 to GX_IDENTITY. Other values report index then panic; identity fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1380-L1410

### `HSD_Index2TexMap`

`GXTexMapID HSD_Index2TexMap(u32 index)`

Maps unsigned0..7 to texture-map IDs; other values assert with map0 fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1412-L1435

### `HSD_TexMap2Index`

`u32 HSD_TexMap2Index(GXTexMapID mapid)`

Maps texture-map IDs0..7 to unsigned ordinals; other values assert with zero fallback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1437-L1460

### `HSD_TObjRemove`

`void HSD_TObjRemove(HSD_TObj* tobj)`

Delegates to hsdDelete; local body has no NULL guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1462-L1465

### `HSD_TObjRemoveAll`

`void HSD_TObjRemoveAll(HSD_TObj* tobj)`

Saves next before single-object removal then advances until NULL.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1467-L1474

### `HSD_TObjGetNext`

`HSD_TObj* HSD_TObjGetNext(HSD_TObj* tobj)`

Returns NULL for NULL input, otherwise current next without mutation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1476-L1483

### `HSD_TObjSetDefaultClass`

`void HSD_TObjSetDefaultClass(HSD_TObjInfo* info)`

Non-NULL override must pass descendant assertion; stores override including NULL.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1485-L1491

### `HSD_TObjGetDefaultClass`

`HSD_TObjInfo* HSD_TObjGetDefaultClass(void)`

Returns configured override or &hsdTObj.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1493-L1496

### `HSD_TObjAlloc`

`HSD_TObj* HSD_TObjAlloc(void)`

Constructs via hsdNew using selected default class, asserts non-NULL and returns instance.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1498-L1503

### `HSD_TObjFree`

`void HSD_TObjFree(HSD_TObj* tobj)`

NULL-safe direct runtime destroy dispatch; does not itself call release or clear owner/link pointers.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1505-L1510

### `HSD_TlutAlloc`

`HSD_Tlut* HSD_TlutAlloc(void)`

Allocates exact record size, asserts non-NULL, zeroes entire record and returns it.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1512-L1518

### `HSD_TlutFree`

`void HSD_TlutFree(HSD_Tlut* tlut)`

Forwards record and exact sizeof(HSD_Tlut) to memory-piece free without a local guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1520-L1523

### `HSD_TlutRemove`

`void HSD_TlutRemove(HSD_Tlut* tlut)`

NULL-safe memory-piece free of the TLUT record only, not the pointed-to palette data.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1525-L1530

### `HSD_TObjTevAlloc`

`HSD_TObjTev* HSD_TObjTevAlloc(void)`

Allocates exact TEV record size, asserts non-NULL, zeroes record and returns it.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1532-L1538

### `HSD_TObjTevFree`

`void HSD_TObjTevFree(HSD_TObjTev* tev)`

Forwards record and exact TEV size to memory-piece free without a local guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1540-L1543

### `HSD_TObjTevRemove`

`void HSD_TObjTevRemove(HSD_TObjTev* tev)`

NULL-safe call to TEV free.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1545-L1550

### `HSD_ImageDescAlloc`

`HSD_ImageDesc* HSD_ImageDescAlloc(void)`

Allocates exact descriptor size, asserts non-NULL and zeroes descriptor, without allocating image data.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1552-L1558

### `HSD_ImageDescFree`

`void HSD_ImageDescFree(HSD_ImageDesc* idesc)`

Frees descriptor-sized memory piece without freeing image_ptr payload or checking NULL locally.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1560-L1563

### `HSD_ImageDescCopyFromEFB`

`void HSD_ImageDescCopyFromEFB(HSD_ImageDesc* idesc, u16 origx, u16 origy, GXBool clear, bool sync)`

NULL descriptor returns. Configures source origin and descriptor dimensions, destination format/mipmap, optionally enables LEQUAL depth test and writes for clear, issues GXCopyTex to image_ptr, then optional GXPixModeSync and GXInvalidateTexAll. Does not allocate buffer or restore depth state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1565-L1583

### `TObjRelease`

`static void TObjRelease(HSD_Class* o)`

Removes AObj, primary TLUT and TEV, removes each NULL-terminated palette-table record then frees table, delegates parent release. Does not free borrowed image descriptors, image data, image table or LOD here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1585-L1601

### `TObjAmnesia`

`static void TObjAmnesia(HSD_ClassInfo* info)`

Independently clears matching default-class pointer and builtin-class current head, then delegates parent amnesia.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1603-L1612

### `TObjInfoInit`

`static void TObjInfoInit(void)`

Initializes hsdTObj class against hsdObj with explicit names/sizes, installs release/amnesia/load/make_texp and make_mtx callbacks.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/tobj.c#L1614-L1626

## Owned header and types

H1–129 defines animation tracks1–24, custom color/alpha selectors, TEV activation flags, mapping/colormap/alphamap/lightmap masks, bump and dirty bits. H132–158 defines runtime TObj with Quaternion rotate, Vec3 scale/translate, u8 repeats and palette index, borrowed image/LOD pointers and owned runtime resource pointers. Descriptor rotation is Vec3 (H160–179); loading copies only XYZ. This does not establish quaternion identity.

TLUT and descriptor fields match in order and types (H181–193), supporting runtime-size shallow copies. LOD descriptor H195–201 controls filter/bias/clamps/anisotropy. Image descriptor H203–211 has u16 dimensions, format/mipmap and LOD range; allocation does not allocate image storage. TEV and descriptor H213–241 are layout-compatible scalar/selector/color/active records. H243–249 declares the class callbacks; H251–259 declares linked animation descriptors and u16 table counts. H261–315 exports class casts and public prototypes. All signatures were compared with canonical C; source-only helpers are listed in coverage.

## Decisions and limitations

All canonical names retained; no new naming hypothesis. Every baseline fact is preserved with its ID, timestamp and disposition. No integer version is supplied by the baseline. Parameter entity register suffixes are recorded as inherited identities, not independently proven ABI locations.

TLUT reuse checks entry counts only. Missing/unregistered class names use the selected default class. Mirror-T translation contains division independent of near-zero scale guards. Alpha custom selectors do not support immediate one/half. Palette/image indices and TEV float narrowing lack range checks. Toon skips matrix rebuilding despite dirty state.

Source-only global/static declarations include class bootstrap, default override/head, bump generator table, TEV stage templates, highlight fallback matrix and default LOD. No compiled object/map was read, so none is attributed to a whole data-section target.

Foreign canonical-only reads: aobj.c91–105,121–174,220–240; mobj.c47–58,74–85,145–156,548–559. They support animation dispatch/lifecycle and material callers; these are not claimed as owned file reviews.

Existing outgoing links: 30 exact records reviewed, 28 retain and2 unresolved. Deferred: complete foreign caller-projection rationale and unsupported palette-equivalence rationale. No source or shared KB writes. Proposal is dry-run only; independent review remains required.
