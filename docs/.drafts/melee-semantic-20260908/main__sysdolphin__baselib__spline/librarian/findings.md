# Spline Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete owned canonical and rendered reads cover C lines 1–239 and H lines 1–22. Both renders succeeded without parse errors. The only C substitution renames an external square-root helper; it was not treated as proof.

Started 2026-09-08T14:52:02Z; ended 2026-09-08T14:54:19Z. All 20 subjects and 22 existing facts reviewed. Dispositions: {'unresolved': 3, 'retain': 18, 'supersede': 1}. Eleven source functions are documented, including seven absent from the report. All 14 parameter entities have no existing facts and receive explicit type/role reviews.

## Functionality

The raw sampler divides global u into numcv-1 segments. Its control storage differs by curve type. Linear segments use adjacent controls; Bezier segments advance three controls; B-spline and cardinal segments advance one with four-control neighborhoods. The exact terminal path avoids stepping into the next segment.

Arc-distance conversion first finds a normalized cumulative-length interval. Linear curves use a ratio. Nonlinear curves integrate the square root of a quartic speed-squared polynomial with eight-subinterval Simpson weights. A narrowing search compares that estimate with the remaining distance and uses 1e-5 tolerances. It returns the last evaluated midpoint, not an exact symbolic inverse.

### `splGetHelmite`

`f32 splGetHelmite(f32 fterm, f32 time, f32 p0, f32 p1, f32 d0, f32 d1)`

Pure scalar cubic Hermite evaluation. With u=fterm*time, value terms use 2u^3-3u^2+1 and -2u^3+3u^2; derivative terms use time-scaled Hermite coefficients. For nonzero fterm, the implied interval duration is 1/fterm. No clamping, branches or memory writes occur.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L9-L28.

### `splGetCardinalPoint`

`static inline void splGetCardinalPoint(Vec3* p, Vec3* cp, f32 tension, f32 u)`

Evaluates four Vec3 controls componentwise with cubic cardinal weights depending on tension and local u. At u=0 the result is cp[1]; at u=1 it is cp[2]. Does not validate pointers, control count or u.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L30-L46.

### `splGetBSplinePoint`

`static void splGetBSplinePoint(Vec3* p, Vec3* cp, f32 u)`

Evaluates a cubic uniform B-spline basis over four Vec3 controls using 1/6-scaled weights. Writes X/Y/Z separately. No parameter or pointer validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L48-L62.

### `splGetBezierPoint`

`static inline void splGetBezierPoint(Vec3* p, Vec3* cp, f32 u)`

Evaluates four Vec3 controls with cubic Bernstein weights (1-u)^3, 3u(1-u)^2, 3u^2(1-u), u^3. Writes X/Y/Z; no validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L64-L80.

### `splGetSplinePoint`

`void splGetSplinePoint(Vec3* p, HSD_Spline* spline, f32 u)`

For u<0 or u>1 returns without writing output. Otherwise u<1 selects s16 idx from u*(numcv-1) and uses the fractional remainder. Type 0 linearly interpolates cv[idx] and cv[idx+1]; type 1 uses four controls at cv[3*idx]; types 2 and 3 use four at cv[idx], with cardinal tension for type 3. The terminal branch uses cv[numcv-1] for type 0, cv[3*(numcv-1)] for type 1, B-spline controls starting cv[numcv-2] evaluated at 1 for type 2, and cv[numcv] for type 3. Unknown types leave output unchanged. No pointer/count checks.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L82-L135.

### `splArcLengthPolynomial`

`static f32 splArcLengthPolynomial(const f32 coeffs[5], f32 t)`

Evaluates coeffs[0]*t^4 through coeffs[4]. Values strictly between -0.001 and zero are replaced with zero; exactly -0.001 and more negative values remain unchanged. Passes result to sqrtf__Ff.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L137-L150.

### `spl_GetCoeffs`

`static inline f32* spl_GetCoeffs(HSD_Spline* spl, s32 idx)`

Returns spl->segPoly[idx], a pointer to the selected row of five f32 coefficients; no bounds check or mutation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L152-L155.

### `spl_IterateSimpsonsMiddle`

`static inline f32 spl_IterateSimpsonsMiddle(const f32 coeffs[5], const f32 dx, f32 t)`

Accumulates seven samples starting at supplied t, increasing by dx each time. Weights are 4,2,4,2,4,2,4, the interior weights for an eight-subinterval Simpson estimate.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L157-L171.

### `spl_GetArcLengthDx`

`static f32 spl_GetArcLengthDx(f32 start, f32 midpoint)`

Returns (midpoint-start)/8 as f32 for the eight integration subintervals.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L173-L176.

### `splArcLengthGetParameter`

`f32 splArcLengthGetParameter(HSD_Spline* spl, f32 arg1)`

Clamps arg1<=0 to 0 and arg1>=1 to 1 before reading spl. Scans cumulative segLength using strict next-boundary<arg1, keeping an exact knot in the preceding segment. Type 0 normalizes within that segment. Types 1–3 convert residual normalized distance with totalLength, integrate the square-root polynomial over start..midpoint with eight-subinterval Simpson weights, and narrow start/end while width>=1e-5. The upper branch tests residual<integral+1e-5; the lower branch advances start and subtracts the integral. Returns (last midpoint+idx)/(numcv-1). Unsupported type leaves result uninitialized; no array bounds/count/monotonicity/denominator validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L178-L233.

### `splArcLengthPoint`

`void splArcLengthPoint(Vec3* vec3, HSD_Spline* spline, f32 farg0)`

Passes the same spline and requested arc-distance fraction through splArcLengthGetParameter, then passes the resulting parameter to splGetSplinePoint to write caller Vec3. Adds no guards or persistent state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.c#L235-L238.

## Header and Names

Four public prototypes match C definitions. Owned HSD_Spline has u8 type, s16 numcv, f32 tension, Vec3* cv, f32 totalLength, f32* segLength, f32 (*segPoly)[5].
numcv-1 determines segment count; it is not a universal physical allocation length for cv. Bezier strides by three, while cubic B-spline/cardinal need additional controls. segLength is consumed as normalized cumulative boundaries and segPoly rows as quartic coefficients in descending power order. No new type entities are writable in this manifest.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/spline.h#L6-L19.

Retain all canonical names, including the historical splGetHelmite spelling. No inferred names currently exist for owned targets, and none are proposed. Preserve the .sdata2 section label; source-only helpers keep their canonical descriptive names.

## Dependencies and Limits

Foreign context at jobj.c lines 359–387 verifies HSD_A_J_PATH handling. The caller clamps its animation value, calls splArcLengthPoint, and sets translation X/Y/Z from the result. This supports the inherited path-animation claim without taking ownership of JObj types or behavior.

The arc converter does not validate numcv, segment-table bounds, monotonicity, positive segment lengths, polynomial validity or supported type. Unsupported interior types use an uninitialized result. The raw point sampler leaves output unchanged for unknown type. Ordered out-of-range u returns without writing; NaN fails those comparisons and reaches the terminal branch for a recognized type. These edge observations are not input guarantees.

The polynomial helper clamps only the open interval (-0.001,0). Section facts remain unresolved because C literals do not establish emitted .sdata2 membership or scalar widths. No object or map evidence was read.

Fact IDs, timestamps, original values and decisions are in dispositions.json. Integer versions were absent from helper output. UTC timing, input hashes, read ranges and complete subject counts are in coverage.json. No source or KB writes occurred.

Dry-run valid: 3 accepted, 0 rejected. SHA-256 `5cb212e866485eaea5ad8f9a2d2cec1e217123f8de8a55b958c984158887f9e8`.
