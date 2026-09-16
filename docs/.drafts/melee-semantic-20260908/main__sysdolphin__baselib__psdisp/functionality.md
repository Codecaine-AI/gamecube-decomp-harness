# Disjoint Librarian Research

### shard-main__sysdolphin__baselib__psdisp-000
Reviewed the assigned canonical and rendered `psdisp.c` lines 1–480, with supplemental reading through line 515 to finish `particleSort`; this is not complete TU coverage.

- Vertex helpers clear and select position/color/texture descriptors and configure attribute formats.
- `calcTornadoLastPos` derives a radius and angular position from particle and generator fields, rotates that position, and adds the generator position. Its null-generator branch incorrectly dereferences the null generator.
- Color helpers interpolate primary/environment RGBA and grayscale material/ambient RGB plus alpha using a 16-bit fixed-point remaining/count ratio, falling back to stored values when the count is zero. Trail color uses the primary color or opaque white depending on `PrimEnv`.
- Channel and TEV helpers select vertex versus register sources and lighting configuration from particle flags. Cached channel states and colors suppress redundant GX writes. Ambient RGB is modulated by an active light's color, or set to zero when that light is absent; the non-`PrimEnv` lighting path multiplies material alpha by primary alpha with a right shift of eight.
- `particleSort` caches results by a per-list byte token and relinks particles into 16 buckets selected by kind bits 25–27 and bit 3. Buckets are concatenated in ascending order, with bit-3-set particles preceding bit-3-clear particles. It stores and returns the full list head and separately exposes the second group's head.

### shard-main__sysdolphin__baselib__psdisp-001
Reviewed canonical and rendered psdisp.c lines 481–960 only.

- The opening fragment joins bucket chains, terminates the resulting list, and publishes combined and second-group heads through list storage and output pointers.
- `psDispSubPoint` draws consecutive compatible particles as GX points, buffering up to 16 positions per submission. Compatibility checks include size, selected kind bits, transform absence, primary color, and conditional lighting colors. It caches point size, selects textured or untextured vertex formats, and returns the last consumed particle.
- `psDispSubPointTrail` similarly batches up to 16 line segments. Each segment joins the particle position to position minus velocity or a helper-computed endpoint. Endpoint alpha is multiplied by `trail`; optional indexed texture coordinates distinguish the two endpoints. It caches line width and returns the last consumed particle.
- `setBlendMode` caches requests and selects source-alpha blending against inverse-source-alpha or one; unknown modes are cached and reported without a GX blend update. `psSetCurrentMtx` suppresses redundant matrix selections.
- The visible portion of `psDispSubMakePolygon` emits default quads or stream-described trail primitives. Default trail quads attenuate endpoint alpha. Custom trail geometry scales the supplied up vector by segment length, reads primitive headers and float coordinate pairs, derives positions from unflipped coordinates, optionally flips emitted texture coordinates, and clamps coordinate-derived alpha to 0–255. A zero-length up vector suppresses that custom trail branch. Non-trail default quads use four supplied-axis offsets; the custom non-trail branch continues beyond this shard.

### shard-main__sysdolphin__baselib__psdisp-002
Reviewed canonical and rendered psdisp.c lines 961–1440 only.

- The opening polygon-emission fragment derives vertex offsets from unflipped texture coordinates, independently flips emitted S/T coordinates, and chooses textured or untextured GX vertex formats.
- Magnitude-test helpers clear the floating-point sign bit before comparisons. `psDispSub` builds size-scaled right/up vectors, derives orientation from projected displacement for the Trail/DirVec branches, guards zero projection divisors, optionally adds particle rotation, and rotates the basis about its cross-product axis when the angle magnitude exceeds 0.01. It then delegates polygon construction.
- `psScaleAppSRTAxes` scales the matrix’s three basis columns by particle size without changing translation.
- `psDispSubAPPSRTPoint` refreshes an application-SRT/view transform by frame, changes ONCE status to STILL, caches two basis magnitudes, and optionally replaces the cached basis with extracted scale while preserving transformed translation. It transforms current and previous positions, then emits either a two-vertex line with trail-scaled previous-end alpha or a single point. Width/size updates are cached; the selected byte is 255 above size 42.5, otherwise six times size.
- The assigned beginning of `psDispSubAppSRT` repeats the frame-gated transform/cache preparation; its subsequent drawing logic is outside this shard.

### shard-main__sysdolphin__baselib__psdisp-003
Reviewed canonical and rendered psdisp.c lines 1441–1920 only.

- The geometry-emission continuation transforms current and previous particle positions using the AppSRT matrix; previous position comes from calcTornadoLastPos or position minus velocity. Size and AppSRT fields determine local extents. Trail/DirVec branches derive an orientation from projected displacement, with zero-denominator returns in the prj[0] == 0 branch; DirVec additionally applies particle rotation.
- Geometry is emitted as default quads or a supplied primitive stream. Trail quads span current and previous positions and scale previous-end alpha by pp->trail. Stream-based trails scale an axis by displacement length and clamp a t-dependent alpha to 0–255. Stream vertices derive geometry from unflipped coordinates, while TexFlipS/T affect emitted texture coordinates. Textured and untextured paths select different vertex formats.
- psUpdateBillboardAxes caches componentwise sums and differences of the first two inverse-view matrix columns in six globals.
- The opening of psDispParticles advances/wraps psFrameNum and returns when sw == 0. Otherwise, selected target-link bits trigger particleSort; sw == 1 chooses its sorted output and stops at the first particle lacking TexEdge, while other nonzero values choose its other output. The size predicate gates rendering setup, which begins resetting cached state, channel colors and TEV colors.

### shard-main__sysdolphin__baselib__psdisp-004
Reviewed only `src/sysdolphin/baselib/psdisp.c:1921–2213`, in canonical and rendered views. This tail of the display traversal completes camera/projection and vertex-format setup, selects blend state, interpolates alpha-comparison thresholds, and updates depth-write and fog state. It resolves optional form data and configures texture mirroring, images, indexed palettes, and nearest/linear filtering. Dispatch depends on `DispPoint`, `appsrt`, and `Trail`; two point paths replace the traversal pointer with their return value before advancing. On exit, it invalidates HSD state when setup occurred.

### shard-main__sysdolphin__baselib__psdisp-005
The assigned header range exposes three function declarations: `psDispParticles` returns `void` and accepts two `u32` parameters named `target_link` and `sw`; `particleSort` returns `HSD_Particle*` and accepts `s32`, `u8`, and two `HSD_Particle**` parameters; `setVtxDesc` returns `void` and accepts one `s32`. The header includes platform and baselib forward declarations and has an include guard. This review covers only `psdisp.h` lines 1–13, not the implementation or complete translation unit.

### shard-main__sysdolphin__baselib__psdisp-006-retry190052
The assigned storage subjects support particle-display setup and reuse: camera/projection buffers and billboard coefficients, an indexed texture-coordinate table, cached GX state, an identity position matrix, and a nonzero wrapping display epoch. Particle sorting retains a per-link partition boundary and epoch; AppSRT preparation also uses the epoch. Source-level behavior is supported, but exact compiled section layouts and attribution of inline literals to .sdata2 remain unverified. This assessment does not claim complete TU coverage.

### shard-main__sysdolphin__baselib__psdisp-007-retry190052
The assigned helpers reconstruct a generator-relative tornado endpoint for trails and orientation, sample independent particle color transitions without advancing counters, and stably regroup particle lists into 16 kind-derived buckets with cached partition heads. Material coloration feeds TEV register 2; the channel material color instead comes from primary color or white. The tornado helper retains its defective null-generator branch. Compiled exception-section provenance and layout remain unverified. This review covers only the assigned subjects and necessary source excerpts.

### shard-main__sysdolphin__baselib__psdisp-008
The reviewed subjects implement particle-pass selection, lazy GX setup, particle-derived colors and resources, and point, trail, billboard, custom-form, and AppSRT geometry submission. setVtxDesc selects six direct-position layouts with optional direct color and indexed or direct texture coordinates. Most render-state setters use retained-value comparisons, but the palette path does not update its previous-palette variable and therefore does not provide the palette-cache suppression claimed by two baseline facts. This review assesses the assigned subjects, not complete TU coverage.

### shard-main__sysdolphin__baselib__psdisp-009
The assigned subjects have no baseline facts to disposition. The inspected helpers compute a generator-relative transformed position into three float outputs, interpolate primitive/environment RGBA colors, and interpolate material/ambient grayscale RGB plus independent alpha. Color helpers copy current values when the corresponding interpolation count is zero. This review covers these helper bodies, not the entire translation unit.

### shard-main__sysdolphin__baselib__psdisp-010
This bounded subjects shard contains six parameter identities associated with getColorPrimEnv, particleSort, and psDispParticles. All six have empty baseline fact arrays; there are no assigned fact records to retain, supersede, reject, or mark unresolved. No parameter-register mappings or new semantic facts are proposed, and no complete translation-unit coverage is claimed.

### shard-main__sysdolphin__baselib__psdisp-011
Both assigned parameter subjects have empty baseline fact lists, so there are no fact IDs to disposition. The inspected canonical setVtxDesc body clears vertex descriptors and uses its fmt parameter to select position, color, and texture-coordinate input configurations. No parameter-register mapping or psDispParticles behavior is asserted, and this review does not claim full translation-unit coverage.

### shard-main__sysdolphin__baselib__psdisp-012-retry185815
The reviewed source implements particle display: it selects particle lists, prepares camera and GX state, derives interpolated colors and previous positions, and emits textured or untextured geometry. Vertex descriptors select the attributes consumed by each primitive. Several GX updates are guarded by cached state comparisons. Source-level rendering relationships are supported; compiled-section identities and exception-table provenance remain unverified. This is a bounded link review, not complete TU coverage.

### shard-main__sysdolphin__baselib__psdisp-013
The reviewed code partitions particle lists by kind bits, selects render-link groups and partitions, initializes camera and GX state, installs particle colors and textures, and dispatches geometry rendering. Channel, color, point-size, and line-width comparisons suppress redundant GX updates. Source-level workspace and constants support rendering, but their compiled section membership is not established by these reads. This review covers only the eight assigned links.

Status: researched; no-change lead bypass; independent review and live promotion pending.
