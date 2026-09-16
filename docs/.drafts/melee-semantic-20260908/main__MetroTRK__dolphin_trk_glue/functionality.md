## Dolphin MetroTRK glue

This unit implements debugger transport infrastructure, not gameplay. Its private `gDBCommTable` starts with seven null callbacks. `InitMetroTRKCommTable` replaces all seven entries: hardware ID `HARDWARE_NDEV` (1) selects DBInterface; every other ID selects EXI2, without an invalid-ID branch. It returns the selected backend's Boolean stub query. Wrappers assume configuration has occurred and dispatch without null checks. Polling returns the backend integer unchanged; reads and writes make one call and map zero to `kNoError`, every nonzero result to `kUARTError`.

Startup supplies `&gTRKInputPendingPtr` as the initializer's fourth argument; the first three arguments are unused. The selected initializer receives that storage and `TRKEXICallBack`, and the wrapper always reports success. Nub initialization then supplies the resulting pointer to target state. Interrupt enabling is separate. Port release/reservation brackets `TRKSwapAndGo` in `TRKTargetContinue`; neither wrapper handles a callback result.

`TRKEXICallBack` ignores its short argument, decrements scheduler suppression through `OSEnableScheduler`, and supplies the interrupted context plus `0x500` to `TRKLoadContext`. Under `MWERKS_GEKKO`, the loader tests state mask 2, clearing it and restoring GPRs 5–31 when set, otherwise restoring GPRs 13–31. It restores control registers, clears live MSR external/recoverable exception flags, stages original r2–r4 in SPRGs and saved SRR0/SRR1 in r2/r4, and branches to `TRKInterruptHandler`. This assembly body is absent outside that preprocessor branch; nonreturning descriptions apply to the guarded implementation.

The UART interrupt hook itself is empty. The downstream gateway recognizes `0x500`, checks pending input, and distinguishes `inTRK == 1` from its later `inTRK != 0` exception test. Those numeric comparisons must not be collapsed into one Boolean condition.

`TRK_board_display` forwards its argument directly as the `OSReport` format string; `OSReport` passes it to `vprintf`. The welcome caller supplies `MetroTRK for Dolphin v0.8`.

## Semantic review

Existing explanations largely fit canonical behavior and are explicitly retained in the checkpoint ledger. Two corrections clarify the close callback's integer return type and the downstream numeric interrupt-state branches. The source object name `gDBCommTable` is supported, but its exclusive identification with the compiled `.data` target remains unresolved without compiled evidence. No compiled section placement, size, or instruction-count conclusion is made.

Both owned canonical and rendered files were read completely. The C rendering reports 63 parse errors and performs no substitutions; the header reports no parse errors and no substitutions. Thus rendered unchanged names provide no independent validation. The header separately declares `TRK_InitializeIntDrivenUART(u32,u32,void*)` and the implemented four-argument `TRKInitializeIntDrivenUART`; these were not conflated.

Status: synthesized; independent review and live promotion pending.
