## MetroTRK PowerPC register definitions

`src/MetroTRK/ppc_reg.h` is a declarative header, not executable register-save or debugger-message logic.

- Defines the default register block with 32 GPR entries followed by PC, LR, CR, CTR and XER; supplies debugger register indices and sizeof-based element-size and maximum-index macros. `DefaultType` and `Extended1Type` alias `u32`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/ppc_reg.h#L6-L38)
- Defines `FloatType` as `u64`, aliases it as `FPType`, and declares 32 FPR slots plus FPSCR and FPECR slots with corresponding indices. These are integer storage declarations, not floating-point arithmetic types. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/ppc_reg.h#L10-L56)
- Declares stopped-notification information containing PC, the instruction at PC and an exception ID; exception-notification information aliases the same type. `BreakpointRestore` aliases the instruction type, with a comment identifying the saved instruction as software-breakpoint restoration information. This header does not establish serialization, restoration execution or object lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/ppc_reg.h#L58-L84)
- Provides numeric special-purpose register identifiers, distinct time-base read/write identifiers, BAT and GQR identifiers, performance-monitor and other processor-register identifiers, plus condition and MSR constants. Both `SPR_THRM3` and `SPR_FPECR` are explicitly 1022; the header alone does not establish their processor-specific applicability. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/ppc_reg.h#L88-L227)

The complete canonical and rendered views agree; the renderer reports zero substitutions and zero parse errors. There are no baseline subjects, facts or links to rename, correct or retain. No knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
