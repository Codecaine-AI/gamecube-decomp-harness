## Dolphin OS bootstrap and exception infrastructure

`OS.c` coordinates one-shot platform startup and implements the low-level processor-exception installation and dispatch machinery. Existing function names fit canonical behavior; the rendered view introduces no proposed substitutions.

### Startup and persistent state
`OSInit` sets its initialization guard before capturing startup time and disabling interrupts. It imports BootInfo and either live BI2 configuration or preserved low-memory debug/controller bytes, selects arena bounds, initializes OS/device subsystems, derives console classification, reports configuration, optionally enables MetroTRK interrupts, clears eligible arena memory, and finally enables interrupts. Subsequent calls skip the body; the guard is not a separate successful-completion indicator. BI2DebugFlag can point into the external BI2 block, into the static fallback holder, or remain null.

`OSGetConsoleType` returns the populated console-type field or OS_CONSOLE_ARTHUR. Only the null-BootInfo branch avoids dereferencing BootInfo; the zero-field fallback necessarily reads it.

`ClearArena` normally zeros the arena. For reset code 0x80000000 it consults the boot-region bounds. A zero boot-region start gives a full clear; otherwise clearing occurs only when arenaLo is below that start. The split-clear path preserves the designated region, but arenaLo at or above the boot-region start produces no clearing at all. Bounds are not independently validated here.

### Exception installation and execution
`OSExceptionInit` conditionally copies the debugger integrator to the cached alias of physical 0x60 when its first word is zero. It patches a common vector template with each exception number and a debugger jump or NOP, then copies and cache-synchronizes the installed code. Marked exceptions with BI2 debug level at least 2 retain their MetroTRK-owned vectors. Regardless of vector ownership, all software handler-table entries are initialized to OSDefaultExceptionHandler at the cached alias of physical 0x3000. The exception-number opcode is restored afterward; this is not a claim that every modified template byte is restored.

The first-level vector saves r3–r5 and machine/control state into the physical current context, marks exception state, and later loads the virtual context pointer. Saved SRR1.RI determines whether dispatch uses the software table or bypasses it for OSDefaultExceptionHandler. Both OS dispatch paths use SRR0 and rfi with address translation enabled. The debugger jump supplies a continuation in LR; the integrator saves that continuation in the debugger interface, forms the cached debugger destination, writes MSR=0x30, and transfers through the replacement LR.

The default handler completes register capture through OS_EXCEPTION_SAVE_GPRS, including the macro's GQR1–GQR7 saves, reads DSISR and DAR, and tail-transfers to the dispatcher in OSError.c. Recoverable registered errors may restore context after callback execution; a recoverable decrementer can also restore context without a registered callback. Remaining paths report diagnostics and halt.

The handler getter and setter directly access the initialized table. The setter returns the displaced callback and supplies no local synchronization. Their range assertions depend on whether DEBUG is defined; they are not unconditional runtime validation. __OSException is a u8 typedef, while the valid table-index contract is 0 through 14.

### Processor and device helpers
`__OSPSInit` preserves existing HID2 bits while setting 0x80000000 and 0x20000000, invalidates the instruction cache, synchronizes, and clears GQR0. The early hardware initializer calls it after enabling floating-point support and before general cache initialization. The separate FPR initializer copies ZeroF into all 32 floating-point registers; OSInit does not call it in this file.

`__OSGetDIConfig` returns the low byte of DI register 9. HIO consumers reject operations for 0xFF, and EXISync uses that value as one component of its special four-byte, 1 MHz USB-adapter transaction condition. These consumer rules do not establish broader hardware semantics for the numeric value.

### Semantic review result
The checkpoint ledger explicitly retains 49 facts and all four links, supersedes four factual overstatements, and leaves seven section-attribution facts unresolved. Source-level roles of the declarations and constants are supported, but no compiled evidence establishes their exact .data/.sbss membership, offsets, padding, or aggregate size. The rendered file was reviewed completely: it reports 104 parse errors, zero substitutions, and function-name-only coverage, so it cannot independently validate assembly parsing, parameter names, or section layouts.

Status: synthesized; independent review and live promotion pending.
