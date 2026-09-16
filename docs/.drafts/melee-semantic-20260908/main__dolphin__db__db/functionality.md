## Dolphin DB interface

`DBInit` binds `__DBInterface` to the cached mapping of physical address `0x40`, publishes the physical address of `__DBExceptionDestination`, and sets `DBVerbose` to TRUE. Bootstrap calls it immediately before `OSInit`. It does not initialize or clear the shared presence field or exception mask.

`DBIsDebuggerPresent` returns FALSE for a null interface and otherwise returns `bPresent` directly, without Boolean normalization. Melee uses a zero result to allocate 0x2000 bytes of diagnostic workspace and install its panic callback and selected OS-error callbacks; numeric cases 4, 7, 8 and 9 are excluded.

`__DBIsExceptionMarked` computes `u32 mask = (1 << exception)` and returns the raw intersection with `exceptionMask`. `__DBMarkException` sets the selected bit for any nonzero value and clears it for zero. Neither validates the shift index nor guards the interface pointer. `__DBSetPresent` directly stores its u32 argument. OS exception initialization skips marked vectors when a nonnull BI2 debug flag is at least 2; otherwise marked vectors receive debugger-jump instructions and unmarked vectors receive NOPs.

The installed assembly destination allocates no frame, ORs MSR with `0x30`, and branches to the auxiliary helper. That helper reads the saved-context address through a pointer whose literal address is `0xC0`, converts the loaded address to a cached pointer, reports `DBExceptionDestination\n`, dumps the context, and calls `PPCHalt`. There is no context-validation or recovery branch. `PPCHalt` is a nonreturning software loop, not a demonstrated hardware power-stop instruction.

`DBPrintf` retains a variadic diagnostic interface but has an empty body. Caller-side argument evaluation is not suppressed by this no-op implementation.

The source also declares a 4096-byte `DBStack` and initializes `DBStackEnd` to `DBStack + 4088`; this file does not use them or switch to that stack. Source declarations and string literals do not establish their compiled section placement.

Canonical and rendered lines 1–71 were reviewed. The rendered view makes no substitutions and reports seven parse errors, including uncertainty around assembly and nearby functions. Existing function names remain appropriate; rendered names were not used as independent evidence.

Evidence-locator correction: the first checkpoint's crash-fallback retention group contains a transcription error in its dberror.c revision. The correct supporting locator is `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L62-L81`.

Status: synthesized; independent review and live promotion pending.
