# Independent psdisp Synthesis

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reader `psdisp_independent_animation_render`. All 2213 C lines and 13 header lines were read canonically and in separate rendered pages to EOF before comparison with the librarian packet. The rendered header marks particleSort as shadowed_binding but changes no names. This is source review, not compiled or runtime verification.

## Public Entry Points and Indexed Helpers

`setVtxDesc` clears to the GX baseline, then chooses six source layouts. All use direct position. Formats 0 and 2 use indexed texture coordinates; formats 4 and 5 use direct coordinates; formats 2, 3 and 5 include direct color. Unsupported integers leave the GX baseline. GXClearVtxDesc itself sets the position field to direct. psSetupVtxFormat uses enum aliases: GX_TEX_ST equals GX_POS_XYZ, GX_RGBA6 equals GX_F32, and GX_RGB565 equals GX_U8. The unusual names therefore do not turn position floats into packed colors.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L85-L115
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L254-L264
code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXAttr.c#L207-L216
code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXEnum.h#L390-L416

`calcTornadoLastPos` reconstructs a generator-relative point from particle grav/fric, cylindrical velocity fields, generator tornado velocity, radius, angle and origin. The computed radius is `(abs(radius) + axial_offset * tan(abs(angle))) * vel.y`; it is not guaranteed positive or monotonically widening. The null-generator branch dereferences that null generator. Required particle, generator and output pointers and finite arithmetic are unchecked; no simulation fields advance.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L117-L152

`getColorPrimEnv` samples independent RGBA tracks. `getColorMatAmb` samples grayscale RGB intensity and separate alpha for material and ambient tracks. Count zero copies stored values; otherwise integer scale is computed first and each output is `((target << 16) + (current - target) * scale) >> 16`. They do not advance counters or validate remaining-count bounds, overflow, output aliases, or output pointers. The original proposal's unparenthesized target shift is a transcription error and must be corrected.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L154-L225

`particleSort` uses a trusted index into 16 global particle lists. A matching byte token returns the current global head and cached suffix pointer without validating list mutations. A changed token is recorded before the empty-list check. Nonempty lists are stably relinked by `((kind >> 25) & 7) + (TexEdge ? 0 : 8)`. Buckets are concatenated in numeric order, the edge prefix joins the non-edge suffix, and both head outputs are borrowed. No allocation or depth comparison occurs. Wrapping or reusing tokens can preserve stale derived state.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L397-L515

`psDispParticles` handles sw=0 by advancing the nonzero byte epoch and returning. It scans only the low 16 target bits for drawing. sw=1 selects the TexEdge prefix; any other nonzero value starts at the non-edge suffix. The observed efLib callback supplies only 0, 1 and 2. The outer size predicate skips values below FLT_EPSILON, including negative values; NaN passes. First accepted geometry lazily initializes the camera and GX state, and the epilogue invalidates HSD state only if initialization occurred. It does not restore previous GX state. Inversion success, camera validity, bank/group/pose/palette indexes and primitive-buffer bounds are unchecked.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1828-L1990
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L2183-L2209
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L644-L668

## State and Color Consumers

setupChanCtrl keys only lighting and trail bits. A changing light mask with the same key does not itself refresh the channel control. setupChanReg puts primary RGB or white into channel material, not the material track sampled by getColorMatAmb. In its non-PrimEnv branch, environment output overwrites the local material result. Ambient is modulated by primary and the active ambient light, or its RGB becomes zero if that light is absent. The PrimEnv branch initializes only prim_color RGB before a possible whole-color cache copy; its alpha remains uninitialized even though the GX call uses RGB-only GX_COLOR0.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L266-L338

setupTevReg selects primary/white behavior from PrimEnv, lighting and trail flags, writes environment only in PrimEnv mode, and uses material output for TEVREG2 with primary-alpha modulation when PrimEnv is clear. getClrTrail uses sampled primary when PrimEnv is clear and all-white RGBA when set. setBlendMode supports only alpha and additive selectors, caches even an unsupported selector, then logs and leaves the previous GX mode. Matrix selection also caches the requested slot before issuing GX state.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L230-L252
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L340-L395
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L747-L773

The entry setup can read prev_kind before initialization through `&=`. Palette key sp79C is initialized NULL and never set to the loaded palette, so non-NULL palettes reload. Indexed texture handling clears the image key each visit. Image pointer equality ignores changed width, height or format. A missing image combined with a filter transition can operate on an uninitialized local GXTexObj. These are source-level defects and limitations, not claims about a tested machine-code execution. The formTable NULL comparison exists only under MUST_MATCH; formTable is an inline one-element tail array in the declared group type. It does not provide an index bound.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1895-L1923
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1993-L2180
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L35-L55

## Geometry Helpers

Point and line widths become u8 values, saturating above size 42.5 at 255 and otherwise scaling by 6. Both point helpers contain buffers for 16 particles and return the last consumed list element. Their next-particle predicates require equality under mask 0xC0100400 and also require the next DispPoint bit clear. The owned caller requires the first DispPoint bit set; the mask includes that bit. Thus no second particle can satisfy the predicate from this caller. A claim of successful multi-particle batching would be false here.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L517-L745
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L2183-L2201
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L16-L33

Line trails use current position and position minus velocity, or the tornado reconstruction, with previous alpha multiplied by trail. Default polygon trails form four vertices around the current and previous centers. Ordinary and AppSRT custom forms trust a u32 primitive count, four-byte headers containing primitive and vertex-count bytes, and eight-byte float S/T records. Geometry uses the original coordinates; flips affect emitted texture coordinates. Custom trail alpha is derived from 255 and clamped after integer conversion, rather than multiplied by sampled color alpha. Integer conversion itself is not protected against nonfinite or out-of-range input. Zero trail-axis length emits no custom geometry.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L775-L998
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1658-L1798

Ordinary billboards derive axes from inverse-view columns or cached column sums and differences. Direction/trail orientation uses projected current and previous positions in perspective mode, or motion projected onto the view plane in orthographic mode. Zero perspective depths return early. Very small y displacement selects a signed pi/2 angle, including the zero-motion case; other paths use atan2. DirVec adds rotate, and basis rotation occurs only when absolute angle exceeds 0.01. Absolute-value helpers clear a float sign bit through integer aliasing and do not establish a general finite-input contract.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1000-L1213
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1801-L1822

Both AppSRT paths require appsrt despite an initial conditional check. On byte-epoch mismatch they rebuild model SRT unless status is STILL, change ONCE to STILL, cache view-times-model and two axis magnitudes, then optionally replace the cached transform with a scale-only orientation when xA2 is set. Epoch equality alone reuses that state. Current and previous positions are prepared even for some non-trail cases. AppSRT point width is not multiplied by the cached axis scale. AppSRT geometry emits view-space coordinates through identity matrix slot 1; ordinary geometry uses viewing slot 0. Orthographic projection offsets are literally added to each coefficient in the displayed formulas; a standard affine-matrix description would conceal that detail.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1215-L1657
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1921-L1989
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psstructs.h#L86-L126

## Ownership and Comparison

The owned local types are particle bucket, TLUT metadata and matrix wrapper. Named data includes an identity matrix, orphan assertion strings, reserved bytes, a UV table, sort tags, epoch, camera matrices, suffix pointers and GX-state caches. These source declarations do not prove compiled section placement, padding, exact section sizes or runtime exception tables. All 36 section-target facts and seven section-origin links stay unresolved; no historical Discord or attempt claim is presented as freshly verified. Seventeen parameter entities have no baseline facts and their positional types are reviewed without claiming physical ABI register allocation.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L21-L80
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.h#L8-L10

The independent exact ledger contains 70 facts and 20 outgoing link records. It retains duplicate relation records and every original field, including timestamps and historical locators/digests. The general render-cache relation is supported, but its palette rationale needs the qualification recorded in the link ledger. The original 35-operation proposal is acceptable after the one arithmetic transcription correction. Additional source-only limits above do not require inventing absent target identities. Original librarian and top-level artifacts remain byte-identical.
