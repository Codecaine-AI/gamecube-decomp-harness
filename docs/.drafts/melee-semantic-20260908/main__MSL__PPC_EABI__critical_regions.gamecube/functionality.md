## Critical-region shutdown hook

`critical_regions.gamecube.c` defines only `void __kill_critical_regions(void)`, whose entire body is an unconditional `return`. It takes no arguments, returns no value, accesses no state, and performs no resource teardown. The guarded header declares the same interface. Evidence: [implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/PPC_EABI/critical_regions.gamecube.c#L1-L7), [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/PPC_EABI/critical_regions.gamecube.h#L1-L7).

In `exit`, the hook follows the internal exit-callback loop and lies outside the `__aborting == 0` guard that controls earlier cleanup. After the hook returns, a non-null console callback is invoked and cleared, followed by `_ExitProcess`. This routine itself neither clears callbacks nor terminates the process. Evidence: [caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/abort_exit.c#L20-L48).

Both complete rendered files preserve the canonical function name, with no substitutions or parse errors. The existing name fits the runtime interface; no rename is warranted. Four existing facts are retained. One purpose fact is corrected because a no-op implementation does not prove that the platform requires no teardown. No compiled layout conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
