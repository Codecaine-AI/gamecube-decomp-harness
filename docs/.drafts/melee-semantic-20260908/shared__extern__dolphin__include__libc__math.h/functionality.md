## Math compatibility header

`extern/dolphin/include/libc/math.h` supplies floating-point constant macros, math function declarations, compiler-dependent absolute-value bindings, classification macros, and inline square-root and remainder implementations. Canonical and rendered lines 1–113 were fully reviewed; subjects and links are empty. There are no baseline facts to retain or correct, and no writable subjects for new proposals.

### Constants and declarations
`NAN` is expressed as `0.0f / 0.0f`; `HUGE_VALF` and `INFINITY` as `1.0f / 0.0f`. The header declares trigonometric, power, scaling, sign-copying and floor functions without establishing their implementations. Metrowerks-specific pragmas bracket part of the header, and `fabs`/`fabsf` become compiler intrinsic macros under `__MWERKS__`; otherwise they are declared functions. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/libc/math.h#L4-L28 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/libc/math.h#L75-L81.

### Square-root helpers and exceptional inputs
Both `sqrtf(float)` and the nonstandard `sqrt(float)` return `float`. For `x > 0`, they obtain a reciprocal-square-root estimate using a Metrowerks intrinsic or PowerPC inline assembly, perform three double-precision refinement expressions, multiply by `x`, and store through a volatile float before returning. Otherwise they return `x`: negative inputs are not explicitly converted to domain-error NaNs, and zero and unordered inputs have no separate handling. Positive infinity enters the refinement path without a special case; the source alone does not justify standard-library exceptional-result guarantees. The comment calls `sqrt` incorrect and describes a GXDraw.o section-generation purpose, but that is source intent rather than verified compiled layout. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/libc/math.h#L30-L73.

### Classification
Classification constants are explicitly NAN=1, INFINITE=2, ZERO=3, NORMAL=4 and SUBNORMAL=5. `fpclassify` dispatches by whether the expression's size equals `sizeof(float)`, casting to float or double accordingly; it is not general type-aware dispatch. `isfinite` tests whether the returned classification exceeds 2. The classifier implementations are not present here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/libc/math.h#L83-L93.

### Remainder helper
`fmodf` returns `x` immediately when `fabsf(m) > fabsf(x)`. Otherwise it converts the floating quotient `x / m` to `long long` and returns `x - m * c`. This is a quotient-truncation implementation, not evidence of complete standard `fmodf` behavior: zero divisors, nonfinite quotients, and quotients outside the integer conversion range have no guards. Floating-point rounding also remains relevant to the computed remainder. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/libc/math.h#L95-L106.

### Semantic disposition
The rendered view makes no name substitutions. Its parse uncertainties and external bindings do not prove header-local symbol identities. Preserve the existing source names without attaching another file's knowledge to these inline definitions. No knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
