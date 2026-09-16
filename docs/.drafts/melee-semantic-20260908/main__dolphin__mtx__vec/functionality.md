## Vector arithmetic unit

The unit implements three-component vector addition, subtraction, scaling, normalization, squared magnitude, magnitude, dot product, cross product and squared distance in scalar C and PowerPC paired-single forms. It also provides half-angle, reflection and distance helpers. Existing SDK function names fit the canonical behavior; no renaming is warranted. Supported existing facts and links are retained as recorded in the inherited research.

Vector-producing primitives write caller-provided storage; scalar reductions return floating-point values. Paired-single scale, normalize and cross product load all input components before destination writes, supporting in-place use. Paired-single add and subtract process x/y before loading z and support exact input/output aliasing, without implying arbitrary overlapping-buffer safety. PS dot product and squared distance use overlapping y/z and x/y pairs rather than exclusively separate z loads.

PS normalization uses an `frsqrte` estimate and one refinement, `0.5r(3-sr²)`, to scale the source. Unlike the C normalization routine, the PS implementation has no explicit pointer or zero-magnitude checks. Its approximate-unit-vector description applies to suitable nonzero finite inputs, not a guarantee for exceptional floating-point inputs. The MWERKS magnitude body uses the same refinement but additionally selects between the refined factor and squared magnitude before the final multiplication. No non-MWERKS implementation is supplied inside that conditional body.

`VECHalfAngle` normalizes negated inputs, adds them, and normalizes the sum only when its self-dot product is greater than zero; otherwise it copies the sum unchanged. `VECReflect` normalizes the negated incident vector and normal, computes the reflected direction and normalizes the result. `VECDistance` takes the square root of the selected square-distance implementation. C square distance has no explicit assertions.

Cross-product results also feed camera construction: `C_MTXLookAt` normalizes its right-axis temporary, derives an up-axis temporary and copies these into matrix rows. These are local temporary-to-output flows, not retained vector-pointer lifetimes; the caller spells the generic VEC API.

Canonical and rendered source were read through line 306. The renderer reported 164 parse errors and zero substitutions, with PS functions marked parse-uncertain; its coverage excludes parameter and data-label renaming. Canonical instruction bodies, not the unchanged rendering, support this assessment. Source literals establish coefficient arithmetic but do not establish the compiled `.sdata2` extent, ordering or consumer mapping.

Status: synthesized; independent review and live promotion pending.
