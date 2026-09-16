## PPCArch semantic review

This translation unit provides Dolphin's low-level PowerPC architecture boundary. Its frame-free assembly routines expose MSR, HID registers, L2CR, the decrementer, performance-monitor registers, SIA, WPAR, DMA registers and PVR. Readers return register snapshots through r3; writers issue a direct register write from a u32 argument. PPCOrMsr, PPCAndMsr and PPCAndCMsr compute values from an MSR snapshot without writing MSR back. These behaviors are visible throughout [the canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/base/PPCArch.c#L4-L249).

### Exceptional control and ordering

- PPCSync executes `sc; blr`, not a local `sync`. The [installed system-call vector](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSSync.c#L9-L30) saves HID0, sets bit 0x8, executes `isync` and `sync`, restores HID0 and returns with `rfi`. Both GXFlush and LCFlushQueue use this hook; it is not evidence that GPU rendering has completed.
- [PPCEieio](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/base/PPCArch.c#L85-L100) saves MSR and HID0, temporarily clears MSR bit 16 in PowerPC bit numbering and sets HID0 mask 0x8, executes the ordering sequence, then restores both saved values.
- PPCHalt executes `sync` once and loops over `nop; li r3,0; nop; b loop`. It has no local exit and does not itself disable interrupts. OSPanic disables interrupts before calling it.
- PPCMfwpar uniquely includes a `sync` before its WPAR read; PPCMtwpar has no such barrier.

### Caller-owned policy and lifetimes

[L2 cache code](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSCache.c#L564-L611) constructs register masks, surrounds disabling with synchronization, and polls invalidation status. Its second busy loop emits a diagnostic repeatedly. L2Init saves and restores MSR, whereas [debug FPU cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dberror.c#L16-L25) has no corresponding local MSR restoration.

[Alarm scheduling](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSAlarm.c#L48-L59) supplies decrementer values of zero for negative deadline deltas, the delta below 0x80000000, and 0x7fffffff otherwise. Queue insertion, cancellation and exception handling own rearming; PPCMtdec does not manage an alarm object.

HID2 writes serve both configuration and error acknowledgement. [DMAErrorHandler](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSCache.c#L613-L646) halts when the machine check is not classified as DMA/locked-cache related; otherwise it reports applicable flags and writes its HID2 snapshot back to clear error bits. Thus a raw HID2 write cannot be described as guaranteeing persistence of an identical register image.

[GX startup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXInit.c#L29-L36) programs WPAR with the physical FIFO address before enabling write gathering in HID2. [GXResetWriteGatherPipe](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXMisc.c#L53-L58) also programs WPAR, after polling until bit 0 is clear; the reviewed code provides no timeout.

### Assessment

Retain 48 existing facts and all six links. Four replacements correct interrupt-policy wording, HID2 hardware-state semantics, and incomplete WPAR/PPCSync caller explanations. Existing architecture names remain suitable; no renames are proposed. All five parameter entities were reviewed and have no baseline facts; their parent-function facts already describe the inputs.

Both canonical and rendered views were read through line 250. The renderer reports 133 parse errors and zero substitutions, so its unchanged names do not independently validate naming hypotheses. No compiled section, layout, size or symbol-emission claims are made.

Status: synthesized; independent review and live promotion pending.
