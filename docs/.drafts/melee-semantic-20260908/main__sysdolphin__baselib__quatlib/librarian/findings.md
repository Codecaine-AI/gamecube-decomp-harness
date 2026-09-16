# Quaternion Utility Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC start 2026-09-08T14:51:57.860709Z; end 2026-09-08T14:54:32.373339+00:00. All canonical and rendered source lines 1-200 and header lines 1-16 read. Hashes and render metadata are recorded in coverage.json.

## Function Findings

### MatToQuat

Extracts a quaternion from the matrix's upper-left 3x3 after dividing each column by its Euclidean length. This removes positive independent column magnitudes before the rotation extraction formula. It does not validate zero columns, shear, or reflections, so arbitrary affine matrices need not yield a unit rotation quaternion.

Canonical name retained. No inferred-name fact exists.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/quatlib.c#L6-L57

### HSD_QuatLib_8037EB28

Extracts Euler rotation angles from a 3×4 matrix, using a separate near-singular decomposition when the matrix's first-column XY projection is too small for the ordinary formulas.

Retain descriptive alias `MatToEuler`; canonical symbol unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/quatlib.c#L59-L75

### HSD_QuatLib_8037EC4C

Computes the Hamilton product of two quaternions, writing `p * q` to the output. For unit quaternions this composes their represented rotations; the routine itself does not normalize or otherwise constrain the operands or result.

Retain descriptive alias `QuatMul`; canonical symbol unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/quatlib.c#L77-L96

### HSD_QuatLib_8037ECE0

Converts an axis-angle rotation into a quaternion, normalizing the supplied axis and rejecting a degenerate zero-length axis.

Retain descriptive alias `AxisToQuat`; canonical symbol unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/quatlib.c#L98-L118

### EulerToQuat

Converts three Euler rotation angles into the equivalent quaternion for the Rz × Ry × Rx rotation composition.

Canonical name retained. No inferred-name fact exists.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/quatlib.c#L120-L146

### HSD_QuatLib_8037EF28

Interpolates between two quaternion orientations at parameter `t`. It normally performs spherical linear interpolation, falls back to linear component blending for nearly identical quaternions, and has a separate near-antipodal path. HSD joint-transform blending routines use it to produce the rotational portion of a transform blended from two source objects.

Retain descriptive alias `QuatSlerp`; canonical symbol unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/quatlib.c#L148-L199

## Numerical and Aliasing Limits

MatToQuat normalizes each basis-column magnitude before positive-trace or largest-diagonal extraction. It ignores translation and has no zero-column guard. Positive independent scale is removed, but column normalization cannot repair shear or a reflection. MatToEuler does not perform the same normalization; its singularity threshold uses the raw first-column XY length.

Quaternion multiplication is the Hamilton product p*q. Four scalar temporaries are complete before output stores, so exact out==p or out==q aliasing is safe. Euler conversion caches all trigonometric values before output and uses the Rz*Ry*Rx formula. Axis-angle conversion checks the calculated norm, normalizes the axis direction in the formula, and returns -1 before output writes for the small-length branch; it does not reject NaN or infinity explicitly.

Interpolation computes no input normalization, dot clamp, t clamp, or shortest-path sign selection. The normal branch uses spherical or linear weights. The antipodal branch writes (-p.y,p.x,-p.w,p.z), but every component is subsequently overwritten with a p/q blend. With distinct output storage, that scratch quaternion is unused. For unit p with exact q=-p and distinct storage, the formulas give zero at t=0.25 and restart at p when t=0.5; this is a symbolic consequence of the source, not a compiled numerical test. Output aliasing changes the initial writes and later reads, so general alias safety is not established.

QuatSlerp remains a useful nominal algorithm alias, with these deviations documented. The two reviewed lb_00B0 callers use temporary input quaternions and negate the second one when the difference norm exceeds the sum norm, avoiding the long arc for valid unit orientations. This sign choice belongs to those callers, not the interpolation function.

## Header and Section Coverage

The complete header imports runtime and Dolphin matrix definitions and declares exactly the six source functions. It defines no owned shared type. The source local nxt array is {1,2,0}; numerical literals include branch thresholds and half-angle factors. Neither source presence nor literal meaning proves .rodata/.sdata2 attribution, so all six section facts remain unresolved. No compiled objects or matching runs were used.

## Coverage

{"targets": 8, "entities": 17, "facts": 33, "retained": 24, "superseded": 3, "unresolved": 6, "proposed_facts": 21}

All 25 manifest subjects are reviewed, including both canonical-named functions and all 16 parameter entities. Every existing fact has an ID, updated_at revision, explicit disposition and full pinned citation. Four existing aliases are retained without new renaming proposals. Prior TU artifacts are unchanged.
