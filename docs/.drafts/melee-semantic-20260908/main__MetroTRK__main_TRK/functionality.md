## MetroTRK entry points

`TRKTargetCPUMinorType(void)` returns the invariant `u8` value `0x54` without calls or state changes. `TRKTargetCPUType` writes that result into its caller-provided descriptor's `cpuMinor` field. The inspected code does not establish a more specific hardware interpretation of `0x54`. [Provider](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/main_TRK.c#L8-L11), [consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/targimpl.c#L486-L496).

`TRK_main(void)` synchronously drives the nub lifecycle. It stores initialization status in file-local, static-duration `TRK_mainError`. Zero permits the welcome call and main loop; nonzero skips both. After initialization failure or normal main-loop return, termination is called and its result overwrites the initialization status and becomes the return value. Thus the caller does not receive the original initialization failure directly. Termination on the successful-startup path depends on the main loop returning; this is not a guarantee of eventual teardown. [Lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/main_TRK.c#L6-L23).

The resolved main loop services debugger events and input, with target continuation through its idle path. A shutdown event sets the exit flag; the event is destroyed before the loop returns to the lifecycle driver. [Loop](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/mainloop.c#L19-L61).

The header declares both entry points consistently with their definitions. Canonical and rendered views agree; neither rendered file introduces substitutions or parse errors. Existing function names and behavioral explanations are useful and do not warrant equivalent rewrites. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/main_TRK.h#L1-L9).

Source confirms one file-local static integer, but does not prove its compiled section placement or the complete payload of the `.bss` target. Section-specific identity and payload claims remain unresolved rather than being treated as established layout knowledge.

Status: synthesized; independent review and live promotion pending.
