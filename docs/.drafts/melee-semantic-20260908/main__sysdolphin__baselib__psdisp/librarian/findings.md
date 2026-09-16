# Particle Display Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC 2026-09-08T15:45:53.846Z to 2026-09-08T15:48:29.343562+00:00. All 2213 C and 13 header lines read in canonical and separately rendered views. Zero parse errors/substitutions.

## Manifest functions

### setVtxDesc

Always clears GX descriptors first. Modes 0..5 enable respectively POS+INDEX8 TEX0, POS, POS+CLR0+INDEX8 TEX0, POS+CLR0, POS+DIRECT TEX0, POS+CLR0+DIRECT TEX0; POS/CLR0 are direct. Other integers leave descriptors cleared. Does not define component formats or reset HSD descriptor-cache pointers itself.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L85-L115

### calcTornadoLastPos

Requires valid pp and output pointers. Non-NULL generator path reconstructs all coordinates from particle grav/fric/vel and generator tornado velocity, grav, absolute radius/angle and origin. NULL generator branch dereferences gp->pos and is defective, not a safe fallback. No finite/range checks occur; no simulation state is advanced.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L117-L152

### getColorPrimEnv

Samples primary/environment tracks independently without advancing counters. Nonzero count uses integer scale=65536*remain/count then (target<<16 + (current-target)*scale)>>16 for each byte; zero count copies stored color. Output pointers and pp must be valid. No remain<=count, arithmetic-overflow, output-clamp or alias validation; interpolation identities assume ordinary valid track values.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L154-L191

### getColorMatAmb

Samples independent grayscale material/ambient tracks and alpha without changing counters. Nonzero count uses integer 16.16 scale from remain/count; zero count copies stored intensity and alpha. RGB components all receive one intensity. Required pointers and sane counters are caller preconditions; no clamp or overflow/alias guard is provided.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L197-L225

### particleSort

Requires list index 0..15, valid output handles and an acyclic list. Matching u8 token immediately publishes current global head and cached non-edge boundary without checking list/kind changes. A mismatch stores token first; empty input clears outputs/boundary. Nonempty input stably concatenates runs by ((kind>>25)&7)+(TexEdge?0:8), rewiring next and global head without allocation. Complete list has edge partition followed by non-edge partition and NULL termination. This is flag grouping, not depth sorting. Token reuse/wrap or mutations within an epoch can leave ordering/boundary stale.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L397-L515

### psDispParticles

sw=0 advances the u8 epoch (255 wraps to 1), ignores link mask and returns. Other values scan only low 16 link bits: sw=1 walks TexEdge prefix; every other nonzero sw starts non-edge boundary. Skips size<FLT_EPSILON, including negative/tiny size; NaN passes this predicate. Lazily configures camera/GX state at first accepted particle and invalidates HSD state at end only if setup ran; no previous GX-state restoration. Sort mutates particle links; AppSRT paths update matrices, cached scales, frameNum and ONCE->STILL status. Requires valid camera/resources; inverse success and resource index bounds are unchecked. Source reads uninitialized prev_kind via &= during setup. Palette comparison pointer sp79C is initialized NULL but never updated, so non-NULL palettes reload. A missing image can leave sp764 uninitialized before a filtering-change LOD/load path. Form-table NULL check is MUST_MATCH-only. No reentrancy or concurrent mutation protection.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L1828-L2209

## Source-only geometry and cache paths

Inline inventory: getClrTrail, psSetColor, psSetupVtxFormat, setupChanCtrl, setupChanReg, setupTevReg, psDispSubPoint, psDispSubPointTrail, setBlendMode, psSetCurrentMtx, psDispSubMakePolygon, psMaskAbsF32, psMaskAbsLtF32, psMaskAbsGtF32, psAbsLtF32, psAbsGtF32, psDispSubAbsLtF32, psDispSubAbsGtF32, psDispSub, psScaleAppSRTAxes, psDispSubAPPSRTPoint, psDispSubAppSRT, psUpdateBillboardAxes.

Color helpers sample fixed-point tracks and never advance counters. setupChanReg uses primary/white for channel material and modulated ambient; material track is consumed by TEVREG2. getClrTrail chooses primary or white by PrimEnv. Point/line widths saturate only above 42.5; negative/nonfinite values are not generally validated by the helpers. Custom forms trust counts, alignment and byte availability. Quad trail alpha casts are unclamped; custom-form trail alpha is clamped 0..255 and derives from 255, not the sampled primary alpha. Texture flips affect emitted S/T after geometry coefficients were computed.

The point batch loops require equal bit 30 through XOR mask 0xC0100400 and also require the next particle to lack DispPoint. Since their owned caller enters with DispPoint set, that conjunction prevents merging subsequent particles. No successful multi-particle batching claim is made. Source-only helper paths remain inventoried despite absent manifest targets.

Ordinary billboards use inverse-view axes and rotate only above absolute angle 0.01. Direction/trail perspective paths return at exact zero projected denominators; no general finite/invertibility guard exists. AppSRT paths use cached view*model matrix, scale magnitudes and frame stamp, transition ONCE to STILL, and optionally replace the orientation with a scaled identity when xA2 is set. They draw in identity matrix slot 1; ordinary geometry uses viewing slot 0. Epoch equality alone decides reuse.

Render state caching exists for point/line width, blend, channel/TEV colors, matrix, alpha, edge, mirror, image and filtering, but it is not a complete state-deduplication guarantee. Palette sp79C is never assigned the loaded palette; indexed paths clear the image key each visit. Image identity alone does not detect changed dimensions/format. Source reads prev_kind before initialization; malformed/missing textures can reach LOD operations on an uninitialized GXTexObj. Static fog pointer has no source-visible setter in this TU. Rendering mutates particle list order and AppSRT derived state; it does not advance color/alpha transition counters.

Source setup contains prev_kind &= 0xFEFFFFFF before a guaranteed initialization. A skipped small particle may initialize prev_kind on another path, but the first accepted particle need not have that predecessor. This is an unsafe source expression; actual compiled behavior was not examined. The formTable NULL guard exists only under MUST_MATCH. Texture banks/groups/pose/palette indices are trusted. Palette pointer sp79C never changes after NULL initialization. Missing image plus filtering change can use uninitialized sp764; unchanged image identity can hide changed texture metadata.

## Evidence boundaries

Six functions keep canonical names. Seventeen parameter entities receive exact types and roles. The header only exposes three prototypes. Eight section/runtime metadata targets remain unresolved without compiled ownership evidence, including stale extabindex function-size comparisons. Exact outgoing baseline records are preserved with individual decisions. Static semantic review and helper dry-run only; no source/shared KB write, compilation, matching, server or publication.

{"subjects": 32, "targets": 14, "function_targets": 6, "section_targets": 8, "parameter_entities": 17, "facts": 70, "retained": 17, "superseded": 17, "unresolved": 36, "proposed_facts": 35, "links": 20, "links_retained": 13, "links_unresolved": 7}

Dry-run valid: 35 proposals, zero rejected/skipped. Exact fact/link coverage and replacement consistency passed. SHA256 `49bb269f735160a8d746907e99da2c1d0c5351566cfcd31855f233cc4369910e`.

Additional canonical limits: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/psdisp.c#L517-L602` and `#L605-L745` establish the batching predicate; `#L2183-L2201` establishes the DispPoint caller gate. `#L863-L995` and `#L1658-L1798` establish trusted custom forms and distinct alpha handling. `#L1895-L1923` establishes lazy setup and uninitialized prev_kind read.
