## OSSync semantic review

This unit implements Dolphin OS system-call exception handling, not gameplay logic. `SystemCallVector` is a file-local assembly routine with exposed start/end entry labels. It saves HID0 in r9, ORs mask 0x8 into r10, writes HID0, executes `isync` then `sync`, restores HID0, and exits with `rfi`. There is no stack frame, explicit memory access, ordinary return value, or alternate branch. The hardware meaning of mask 0x8 is not inferred here.

`__OSInitSystemCall` copies the range between the assembly entry labels to the cached mapping of physical address 0xC00. It then calls `DCFlushRangeNoSync` for 0x100 bytes, executes `__sync`, and calls `ICInvalidateRange` for 0x100 bytes. The cache-maintenance length is distinct from the label-difference copy length. The end label precedes the trailing `nop`, placing that instruction outside the source-delimited copied range. No compiled size or section layout is asserted. See code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OSSync.c#L6-L30.

The installer itself has no guard. Its caller invokes it within the one-time `OSInit` guard, immediately after general exception initialization and before alarm, interrupt, context, cache and device initialization. General exception initialization has debugger-dependent branches; the subsequent system-call installer has no corresponding conditional exemption. See code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OS.c#L143-L187 and code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/os/OS.c#L300-L331.

Existing names accurately describe the canonical behavior. The rendered view leaves them unchanged and reports 10 parse errors, zero substitutions, and `parse_uncertain` for `SystemCallVector`; it is not independent semantic proof. Existing knowledge is retained except for correcting the attribution of the vector boundaries from linker-defined symbols to explicitly defined assembly entry labels.

Status: synthesized; independent review and live promotion pending.
