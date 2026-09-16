## src/MSL/limits.h

This guarded header defines integer-limit macros and, when `__cplusplus` is defined, a minimal `std::numeric_limits` interface.

- The macros specify an 8-bit byte; signed/unsigned character, short, int, long, and long-long bounds using constants corresponding to 8-, 16-, 32-, 32-, and 64-bit ranges. These are source-level definitions, not independently verified compiler type widths. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/limits.h#L8-L31)
- The primary `numeric_limits<T>` template only declares static inline `min()` and `max()` methods. This file supplies implementations for `char`, `short`, `int`, `long`, and their four unsigned counterparts; it does not supply signed-char, long-long, floating-point specializations or the broader standard traits interface. Unsigned specializations return zero for their minima. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/limits.h#L33-L140)
- Plain-char bounds need qualification: `CHAR_MIN` is zero and `CHAR_MAX` aliases `SCHAR_MAX`, while the C++ char specialization returns `-0x80` and `0x7F`. These definitions should not be silently reconciled into a claim about compiler char signedness. Likewise, the int and long specialization minima use `-0x80000000`, unlike the macros' subtraction expressions; literal typing and return conversion depend on the compilation model. [Macro evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/limits.h#L14-L27) · [Specialization evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/limits.h#L43-L89)

The complete canonical and rendered views were reviewed. The renderer reported no parse errors and no substitutions; there are no proposed names to correct. Subject and link enumeration both returned empty inventories, so there is no existing knowledge requiring retention or supersession. No runtime state, exceptional control-flow branches, or cross-file resource lifetimes are introduced by this header. No compiled-layout conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
