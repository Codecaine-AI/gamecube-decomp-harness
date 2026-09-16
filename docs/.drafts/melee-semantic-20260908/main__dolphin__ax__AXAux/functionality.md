## AXAux semantic review

AXAux implements two auxiliary audio send/return paths using separate 32-byte-aligned `long[3][480]` arrays and shared DSP-write, DSP-read, and CPU-processing indices. Initialization sets those indices to 0, 1, and 2, clears callbacks and contexts, and explicitly zeroes only the first 480-long row of each array. Shutdown clears only callbacks. Both lifecycle routines report diagnostic messages under `DEBUG`.

Registration stores callback/context pairs for later use without invoking them. Both input accessors test **the Aux A callback**, including the Aux B accessor; output accessors unconditionally expose their DSP-read rows. These helpers write encoded addresses, not sample data.

`__AXProcessAux` refreshes four static DSP-slot pointers, constructs a stack channel descriptor using offsets 0, 160, and 320 in the CPU row, invalidates 0x780 bytes, invokes the applicable callback with `&auxData.l` and its stored context, and flushes using `DCFlushRangeNoSync`. Aux A requires its callback; Aux B additionally requires `__AXClMode != 4`. All three indices advance modulo three even when neither callback runs. The stack descriptor is not persistent storage; registration retains the context pointer rather than copying its pointee.

Cross-file review confirms that `AXInit` calls this initializer, and `__AXOutNewFrame` runs auxiliary processing before the user frame callback and the next command-list build. AXCL obtains addresses through the accessors, rather than the four static pointer snapshots. Nonzero inputs enable paired input/output address emission. Mode 4 still permits an Aux B command, using opcode 0x10 instead of 5, despite bypassing its CPU callback.

The full canonical and rendered file agree. The renderer reports zero substitutions and zero parse errors; existing function names fit their behavior. Most baseline explanations are already useful and are explicitly retained. Corrections narrow unsupported compiled-layout assertions, remove an unsupported completed-DSP-write implication, and preserve the initializer's DEBUG branch.

Status: synthesized; independent review and live promotion pending.
