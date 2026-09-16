## OSResetSW

This unit implements console reset-switch input handling, not terminal hardware reboot. Its five static objects retain callback, down-state, filtered-state and timing history across interrupt and polling calls.

`__OSResetSWInterruptHandler` records `HoldDown`, then waits while elapsed time is below 100 microseconds and PI register 0's active-low reset bit remains asserted. A separate post-loop register read controls acceptance: a low sample latches `Down` and `LastState`, masks reset-switch interrupts, and clears a nonnull callback slot before invoking its saved value. Consequently, a high sample ending the loop does not guarantee rejection if the subsequent sample is low. The final register write of 2 occurs on either branch if callback execution returns. Neither handler parameter is used.

`OSGetResetButtonState` saves and disables interrupts while updating shared history. A first pressed sample starts `HoldDown` and reports whether `HoldUp` is nonzero. Continued presses report true if `HoldUp` is nonzero or the down interval strictly exceeds 100 microseconds. The first released sample repeats `LastState` and starts a release timestamp only for a true state. Later released samples preserve true while the nonzero timestamp is less than 40 milliseconds old; otherwise they clear it. These are sample-driven rules: pressed branches do not independently check the age of `HoldUp`, and zero timestamps act as inactive sentinels.

The filtered result is stored in `LastState` before an optional `GameChoice` override. With nonzero low six bits, strictly after that value times 60 seconds from `__OSStartTime`, the returned state alternates true and false in two-second phases, beginning true. This override does not update the retained filtered state. Interrupt status is restored before returning. `OSGetResetSwitchState` forwards this result unchanged.

Canonical function names already fit these roles. The rendered view makes no substitutions, reports one parse error, and leaves a shadowed `callback` binding unchanged; it does not independently establish names or identities. Source declarations establish static lifetime and types, but not compiled `.sbss` membership or padding. Callback registration, interrupt rearming, and initialization of external startup/configuration inputs are not shown here.

Status: synthesized; independent review and live promotion pending.
