# Special Display Functionality

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Read started 2026-09-08T14:55:52.243Z; completed 2026-09-08T15:00:27.576974+00:00.

## Scene Resources

LightList entries load runtime light chains and first animation chains. Linking overwrites each previous loaded head next pointer, so this is not general concatenation of multi-node chains. Empty table returns an uninitialized variable. Material helpers OR flags tail-first across DObjs and postorder through child/sibling JObjs, excluding particle/spline union payloads.

Joint lookup accepts variadic signed indices ending-1 or an explicit u16 array. It resumes retained traversal position for nondecreasing targets, restarts for smaller targets and writesNULL when exhausted. INSTANCE children are skipped. Parent ascent is not bounded to the supplied root, so interior-root calls may escape their subtree. Arrays need caller-sized output and valid sentinel/count contracts.

## Images and GX

Image setup writes dimensions/format and zero LODs before asserting image_ptr is empty. It adopts a nonzero preload result or allocates a32-byte-rounded size; ownership is not tagged and allocation failure is not handled locally. EFB copy fixes sync=true, yielding GXPixModeSync and texture-cache invalidation through baselib, not a CPU completion guarantee.

The color-factor texture helper and unfiltered helper shared an inherited alias; propose SetupTintedImageTexture for the former and retain SetupImageTexture for the latter. The three-stage nominal filter interpolates toward warm luminance under expected swap tables and target conversion semantics. Factor is not clamped and stage0 alpha setup remains caller work.

Quad geometry uses x,-y and independent scales. Observed texture S uses requested height divided by texture height, while T uses requested width divided by texture width. Blur draws21 quads on every call, including zero size: the center uses caller alpha and20 others fixed alpha constants. Offset distances are size/64 and twice that. Synthetic negative-index color temporaries are target-oriented decompilation artifacts, not portable C guarantees.

## Overlay Lifecycle

Creation allocates class14/process-link15/priority0 GObj and orthographic640x480 camera, then user state. It initializes placement, scale, image, alpha, mode0 and callbackNULL but leaves blur size and tint unwritten. Its C function is declared pointer-returning yet has no return statement, despite callers consuming it. No allocation-failure path exists locally.

The default renderer captures user_data, calls its optional event, then uses that same pointer. Mode1 draws blur, otherwise one image. Nonzero tint in mode1 sets a reduced scissor and no local restoration follows. Blur setter wraps signed size into u8 and does not initialize tint. Registered removal frees user state, not the external image. Regular Clear supplies a pre-render event that captures EFB and sets dynamic blur/tint.

Camera loading changes perspective aspect only at exact1.18 and caps only right/bottom scissor. It does not establish a wholly valid on-screen rectangle.

## Sections and Documents

Object bytes identify .data diagnostics plus two channels, .rodata two Vec3 camera vectors, .sdata inline lobj assertion strings, and .sdata2 coefficients,1/64, conversion double and camera literals. Existing objects were not rebuilt. The owned .dox is a stale broader declaration list; current C/header win for signatures and ownership.

## Entry Points

- `.data`: Two fixed unlit HSD channel descriptors; section also contains assertion strings. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L675-L701.
- `.rodata`: Two constant Vec3 values, eye0,0,1 and interest0,0,0, total24 bytes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L820-L844.
- `.sdata`: Existing objects identify lobj.h and lobj assertion strings emitted by inline HSD_LObjSetNext. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L36-L59.
- `.sdata2`: Pooled color coefficients, reciprocal blur spacing, conversion double and camera literals. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L313-L327.
- `lb_80011AC4`: Load descriptor chains, attach first animation chain, link previous head directly to current head; empty array leaves first undefined. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L36-L59.
- `lb_80011B74`: Recursively OR flags into DObj material modes, tail first; required nonnull head/materials. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L61-L67.
- `lb_80011C18`: Postorder child/sibling material traversal; particle/spline payloads skipped but children still traversed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L69-L124.
- `lb_80011E24`: Resolve variadic indices ending-1 with depth-first walk and retained position; instance children skipped. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L129-L204.
- `lb_8001204C`: Resolve u16 array indices with positive count; nonpositive count makes no writes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L206-L276.
- `lb_800121FC`: Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L278-L306.
- `lb_800122C8`: Forward EFB copy origin/clear with sync=true. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L308-L311.
- `lb_800122F0`: Texture setup with optional three-stage RGB filter; exactly zero uses one-stage passthrough. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L313-L389.
- `lb_8001271C`: Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L391-L424.
- `lb_8001285C`: Single-stage unfiltered texture/GX state setup without alpha-input setup or drawing. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L426-L450.
- `lb_80012994`: Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L452-L673.
- `fn_80013614`: Call event before mode test, then draw21 samples for mode1 or one for all other modes; tint mode1 restricts scissor. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L703-L800.
- `fn_800138AC`: Free supplied user-state allocation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L802-L805.
- `lb_800138CC`: Replace optional pre-render callback, includingNULL. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L807-L811.
- `lb_800138D8`: Set mode1 and assign signed size into unsigned byte; tint not initialized. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L813-L818.
- `lb_800138EC`: Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L820-L885.
- `lb_80013B14`: Load camera, exact1.18 perspective aspect correction, upper caps on scissor right/bottom only. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L887-L906.
- `file`: Scene light/material/joint helpers and image capture, filtering and overlay camera composition. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L1-L906.

## TU Lead Verification

Complete canonical and rendered C 1–907, header 1–36 and historical dox 1–41 reviewed independently. All 20 proposed facts checked against behavior. Section claims cite existing object hashes in their rationales. Proposal `e389c8bd75085bdfd87c75697cdf35ae50c9c9117fd8d3b7f953c38c26b71b21` is pending independent review and application. See [lead verification](lead-verification.json).

Independent review repair: facts c3320bcf-a981-4bf6-96d8-5603859a4bc2 and 7c680942-a7ad-4b3c-93c2-5fb6793b6085 are superseded. Scissor normalization only upper-caps right/bottom; priority and render callback go to GX registration, not CameraBlurData. Final packet has 22 writes, 85 retain, 19 supersede, 3 unresolved. SHA `572ee6f055cbed01499413b2c94561f4c3194757c9982a97aa8572a6359da554`.

Final light-loader correction: prev != NULL controls direct linking, while prev == NULL assigns first=curr. A NULL load causes the following iteration to reset first. Final proposal SHA `fdc89f01bfbc5eade300e7df4b1220dc4b6ca3b8b7c5b15cbc01dfee314d947b` (22 writes).

Reviewed live application: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/fdc89f01bfbc5eade300e7df4b1220dc4b6ca3b8b7c5b15cbc01dfee314d947b/2026-09-08T15-09-55.800Z-5183a6e4-b421-475a-bc03-4e04992dbeba.receipt.json); [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbspdisplay/final-render.json).
