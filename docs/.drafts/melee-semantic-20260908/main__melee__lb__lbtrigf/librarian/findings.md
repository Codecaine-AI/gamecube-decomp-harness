# Local Inverse Trigonometry

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Read all 244 source lines and all 5 header lines in canonical and rendered form. Research 2026-09-08T14:32:17Z to 2026-09-08T14:33:58.754602+00:00.

## Behavior

### atan2f
Computes an angular argument using atanf(y/x), sign-bit tests, and pi-based quadrant corrections. If x is either signed zero, it returns pi/2 with the sign of y, including when y is also zero. This implementation therefore has its own zero-axis behavior and should not be assumed to follow every standard atan2 signed-zero special case.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L22-L43

### acosf
Computes the principal single-precision arccosine of an input in radians by reducing it to an arctangent and estimating the reciprocal square root needed by the identity acos(x) = π/2 − atan(x / sqrt(1 − x²)).
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L45-L61

### asinf
Computes the principal single-precision arcsine of an input by evaluating the identity asin(x) = atan(x / sqrt(1-x²)), using the unit's reciprocal-square-root helper and arctangent core.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L63-L84

### lb_sqrtf
Computes an approximate single-precision reciprocal square root for the inverse-trigonometry implementation. For a positive radicand it refines the PowerPC hardware estimate three times, and asinf uses the result to form x/sqrt(1-x²) before calling atanf.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L68-L84

### atanf
Computes a single-precision principal arctangent in radians, using argument reduction and a table-assisted odd-polynomial approximation while preserving the input sign.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L147-L243

## Boundaries

atan2f returns signed pi/2 whenever x is zero, including both-zero inputs. Negative x with negative-zero y follows atanf(y/x)-pi, while negative x with positive-zero y follows pi+atanf(y/x). There is no explicit infinity-pair or NaN dispatch. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L22-L43.

lb_sqrtf returns a reciprocal square root, not a square root. Positive inputs receive three Newton refinements of __frsqrte; zero returns INF and other false-positive-comparison, truthy inputs return NAN. Positive infinity is not separately guarded. acosf duplicates the refinement inline; asinf calls the helper. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L45-L84.

atanf exists here only under __MWERKS__. Its degree-13 odd polynomial uses entries 1-6, with the linear coefficient supplied directly by +result. Although table entry 0 equals 1, the source never reads it as a polynomial coefficient. lookup_index=-1 creates a before-array pointer on small/large paths, then relative accesses reach zero entries 19 and 26. This matches the authored source strategy but does not establish portable C behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L147-L243.

The 46-entry static const table atanf_lookup is canonically named. Its hypothesized equivalence to the .rodata aggregate remains unresolved without compiled evidence. All seven section facts remain unresolved, especially the exact ten-float .sdata2 address layout inherited from historical discussion.

## Names and Parameters

Retain canonical atan2f, acosf, asinf, atanf, and lb_sqrtf. No inferred function names exist and no replacements are proposed. The section inferred_name atanf_lookup remains unresolved as section attribution, while that exact source identifier is attested. Six parameter entities have no facts. Signatures establish float x, and atan2f takes float y before float x; no integer-register assignment follows from these declarations.

## Dependencies and Limits

The header has only an include guard. The implementation depends on math constants, external MSL NAN/INF storage, __frsqrte, __fnmsubs, and compiler bit reinterpretation. This review does not verify external constant definitions, non-MWERKS linkage, numerical error bounds, or floating-point exception effects. Source mutations are local, but that is narrower than proving the absence of hardware floating-point status changes.
