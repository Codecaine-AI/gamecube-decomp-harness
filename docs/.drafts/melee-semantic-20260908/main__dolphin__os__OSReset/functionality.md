## Dolphin OS reset subsystem

The unit maintains a persistent intrusive reset-callback queue. Registration asserts a non-null callback and inserts records in nondecreasing priority order, after existing equal-priority records. Unregistration repairs neighboring links and queue endpoints. Records are retained rather than copied and must remain valid while registered. Callback traversal does not itself modify membership, but it invokes external callbacks and reads each next link afterward; arbitrary callback-driven mutation is not proven safe.

`CallResetFunctions` invokes every callback with the requested phase and also synchronizes SRAM, aggregating failures without short-circuiting. `OSResetSystem` disables scheduling, stops audio, and repeatedly executes phase 0 until everything succeeds. Mode 1 with a nonzero menu request commits SRAM flag 0x40 and waits for synchronization. It then disables interrupts, executes phase 1 once, disables locked cache, and only afterward asserts final success.

Mode 1 clears VI register 1, invalidates instruction cache, and calls terminal `Reset` with the reset code multiplied by eight. Mode 0 cancels eligible active threads, enables scheduling, and calls `__OSReboot`. The source retains cleanup after that call, so its non-returning behavior cannot be established locally. Mode 2 saves and suppresses PAD recalibration, then reaches cleanup and restores the saved value. Other integer modes also reach cleanup but have no initialized `padcal` value in this source. The cleanup path does not restore interrupts or scheduling locally. Thread cancellation caches the active-list successor before canceling only numeric states 1 and 4. Cleanup clears five explicit low-memory ranges, not all low memory.

The assembly `Reset` follows branch trampolines to set HID0 bit 0x8, synchronize, wait for a time-base difference of at least 0x1124, write 3 and then the argument to 0xCC003024, and spin forever. `__OSDoHotReset` bypasses coordinated callbacks and prepares interrupts, VI and instruction cache before passing `arg0 << 3` to this terminal routine.

`OSGetResetCode` gives the byte at 0x800030E2 precedence: nonzero returns 0x80000000; otherwise it returns `(__PIRegs[9] & ~7) >> 3`. The startup `ClearArena` consumer uses that distinguished value to select conditional boot-region preservation, including full clearing when no boot-region start is configured.

Canonical SDK function names remain suitable. The rendered file contains no substitutions and reports 33 parse errors; its function-only rendering does not validate parameter names or the inferred `.sbss` identity. Source establishes `ResetFunctionQueue`, but no compiled evidence delivered here establishes its mapping to the generic section target or its compiled extent.

Status: synthesized; independent review and live promotion pending.
