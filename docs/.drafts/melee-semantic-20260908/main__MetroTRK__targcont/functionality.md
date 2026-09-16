## MetroTRK target continuation

`TRKTargetContinue(void)` is this translation unit's sole function. Its header declares the same parameterless `DSError` interface. The canonical body unconditionally calls `TRKTargetSetStopped(false)`, `UnreserveEXI2Port()`, `TRKSwapAndGo()`, and `ReserveEXI2Port()`, in that order, then returns `kNoError`.

This is a compact debugger-target continuation wrapper. EXI2 release and reacquisition bracket the handoff call; reacquisition and success reporting occur only if control returns through that call. There is no prior-state check, alternate branch, callee-result inspection, or local error propagation. Clearing the stopped marker requests running state without establishing that the target was previously stopped. The wrapper does not itself restore the stopped marker afterward.

Evidence: [implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/targcont.c#L1-L13) and [public declaration](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/targcont.h#L1-L8).

Both owned files were reviewed completely in canonical and rendered form. Rendered names are unchanged, with no substitutions or parse errors. Existing names and explanations fit this API-level behavior; all seven facts and both links are explicitly retained in the checkpoint. No useful factual correction or naming improvement was identified. Callee-internal hardware behavior, exceptional control transfers, and compiled layout are not established by these files and are not newly asserted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
