## Dolphin common types header

`extern/dolphin/include/dolphin/types.h` is an include-guarded header providing primitive aliases and common macros, with no functions or runtime state.

- `s8`/`u8`, `s16`/`u16`, `s32`/`u32`, and `s64`/`u64` alias signed/unsigned char, short int, long, and long long int respectively. These are source-level type mappings; the header alone does not establish platform-independent bit widths, notably for `long`. `f32` and `f64` alias float and double; `vf32` and `vf64` add volatile qualification. `Ptr` is char*, and `BOOL` is int, with FALSE and TRUE defined as 0 and 1. [Canonical declarations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/types.h#L4-L23).
- `ATTRIBUTE_ALIGN(num)` expands to an aligned attribute. `NULL` and `ARRAY_SIZE` are supplied only if not already defined; ARRAY_SIZE divides the operand's size by its first element's size and is not a general pointer-length operation. These definitions do not prove any compiled object's alignment or layout. [Canonical macros](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/types.h#L25-L33).
- The header includes `cmath.h`, `ctype.h`, `stdarg.h`, `stdio.h`, and `string.h`. [Canonical includes](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/types.h#L35-L40).

All 43 canonical and rendered lines were reviewed. The rendered view reports six parse errors and zero substitutions, but the displayed declarations and directives match canonical source. No proposed function names occur. Subject and link enumeration both returned empty results; there is no existing semantic ledger to correct or retain and no supported need for a proposal.

Status: synthesized; independent review and live promotion pending.
