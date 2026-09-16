## Runtime context capture and restoration

`__setjmp` and `longjmp` implement complementary PowerPC context operations under `MWERKS_GEKKO`. `__setjmp` stores LR as the resume PC, CR, SP, RTOC, r13–r31, f14–f31, and FPSCR in a caller-provided `__jmp_buf`, then returns zero. `longjmp` restores those saved components and transfers control through the saved LR using the saved stack pointer. A nonzero `val`, including a negative value, passes through unchanged; zero becomes one. These paths are explicit in [the implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/Gecko_setjmp.c#L5-L77).

The [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/Runtime/Gecko_setjmp.h#L4-L33) declares the shared environment and the exact pointer-based interfaces. Its reserved member is not accessed by either routine. The caller owns the environment; neither routine allocates, validates, or frees it. Restoration relies on a previously captured environment and a still-valid saved execution context; these files do not establish individual callers' lifetimes. Although `longjmp` restores CR, its subsequent `cmpwi val,0` updates CR0 before transfer, so restoration should not be interpreted as preserving every CR bit through the final branch.

Both bodies are conditional on `MWERKS_GEKKO`; these files provide no alternative context implementation outside that guard. No compiled layout, section placement, or binary-match conclusion is drawn from source comments or historical baseline assertions.

The rendered files preserve the canonical function names without substitutions. These established runtime names fit the behavior and need no replacement. The C renderer reports 107 parse errors and marks both functions `parse_uncertain`; the header reports none. Canonical assembly, rather than rendered-name inference, supports this review. Nine facts and both pattern links are retained; two longjmp facts receive targeted corrections for the exact interface and zero-result exception.

Status: synthesized; independent review and live promotion pending.
