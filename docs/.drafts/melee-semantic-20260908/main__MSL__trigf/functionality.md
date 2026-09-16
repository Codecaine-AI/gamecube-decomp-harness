## Single-precision trigonometric support

`src/MSL/trigf.c` defines `sinf`, `cosf`, their `sin__Ff`/`cos__Ff` forwarding wrappers, and `tanf`. Existing function names fit canonical behavior. The complete rendered view has no substitutions or parse errors; it supplies no independent naming evidence.

### Initialization and dependencies
`tmp_float` supplies four split correction terms approximating 4/π−1. `__four_over_pi_m1` starts with four zero entries; `__sinit_trigf_c` unconditionally copies the constants into it and is explicitly referenced by a `SECTION_CTORS` declaration. Both approximations subsequently read the writable table. This establishes local initialization intent, not a proof of global startup ordering or absence of external writes. `__sincos_poly` and `__sincos_on_quadrant` are external arrays, not definitions owned by this file. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/trigf.c#L7-L35)

### Reduction and approximation
Both routines multiply the radian input by 2/π and use its sign bit to choose a half-unit adjustment before integer conversion. They form `y = x - n * 2 + Σ correction[i] * x`, then mask `n` with 3. The reduced coordinate is approximately 4x/π−2n, not simply a residual angle in radians.

For `|y| < 3.45266983e-4f`, sine returns `Q[2n] + Q[2n+1] * y * P[9]`; cosine returns `Q[2n+1] - y * Q[2n]`. The cosine fast path notably has no `P[9]` multiplier. Otherwise, sine uses the even-index coefficient polynomial for odd quadrants and the odd-index polynomial times y for even quadrants. Cosine reverses that selection and negates the odd polynomial branch. Quadrant-table factors provide the final sign/axis selection. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/trigf.c#L24-L107)

### Wrappers and exceptional inputs
The wrappers forward their input and result unchanged. `tanf` directly divides the sine wrapper result by the cosine wrapper result, with no pole or zero-denominator guard. There are no explicit NaN, infinity, or large-input branches in the reduction routines. Out-of-range float-to-int conversion and possible overflow in the integer expression `n * 2` prevent inferring robust all-input behavior from this source; exact target outcomes are not established. The `MUST_MATCH` conditional controls wrapper inlining pragmas. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/trigf.c#L109-L129)

### Semantic assessment
Retain the supported function, constructor, and unit behavior knowledge. Clarify the unit-type description to distinguish locally defined correction storage from externally declared polynomial/quadrant tables. Compiled `.data`, `.rodata`, and `.sdata2` mappings, extents, alignment, and conversion-bias contents remain unresolved rather than being validated from C expressions.

Status: synthesized; independent review and live promotion pending.
