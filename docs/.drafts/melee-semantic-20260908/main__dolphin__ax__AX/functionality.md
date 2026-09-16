## AX lifecycle coordinator

`AXInit(void)` optionally reports `Initializing AX\n` when `DEBUG` is defined, then calls `__AXAllocInit`, `__AXVPBInit`, `__AXSPBInit`, `__AXAuxInit`, `__AXClInit`, and `__AXOutInit`, in that order. It takes no arguments and returns no value; it neither passes values between initializers nor checks their results.

`AXQuit(void)` optionally reports `Shutting down AX\n`, then calls the corresponding six quit routines in the **same component order**, not reverse order. Neither wrapper contains a local initialization guard, error-recovery path, or explicit state storage. Resource ownership, repeated-call safety, and dependencies between components remain delegated to other translation units.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AX.c#L6-L28.

The rendered view matches all 29 canonical lines, with no substitutions or parse errors. Existing function names remain appropriate. The rendered absence of a KB identity for `AXQuit` does not negate its canonical definition. No compiled layout or section conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
