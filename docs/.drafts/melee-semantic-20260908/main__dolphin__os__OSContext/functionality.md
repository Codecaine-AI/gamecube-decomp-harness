## OSContext semantic review

This unit implements Dolphin OS PowerPC context selection, integer execution checkpoints, context initialization, diagnostic dumping and lazy FPU ownership. Existing SDK function names fit their canonical behavior; no renaming is proposed. All 644 canonical and rendered lines, all 33 subjects and all 15 links were reviewed. The baseline ledger retains 63 facts and 14 links, supersedes nine facts, and leaves four section-related facts and one link unresolved.

### Execution contexts
- `OSSaveContext` saves the listed nonvolatile GPRs, GQR1–7 and control registers, stores LR as the resume PC, returns zero directly and saves one in the restored r3 slot. It is not a complete volatile-register or FPU snapshot.
- `OSLoadContext` restarts a saved PC within the inclusive interrupt-disable RAS bounds. State mask `0x2` selects restoration of r5–r31 and is cleared; otherwise only r13–r31 are bulk-restored. The routine restores the remaining explicit registers and resumes with `rfi`.
- `OSInitContext` initializes the supplied PC, stack and listed register fields with initial SRR1 `0x9032`, inherits r2/r13 and tail-branches to `OSClearContext`. It does not initialize every byte of the record. Thread creation subsequently supplies saved LR and r3.
- `OSClearContext` clears only mode/state and conditionally releases FPU ownership. Stack-local callback contexts must be retired before their storage expires, as demonstrated by the AR interrupt handler.
- Current-context selection does not transfer storage ownership. The getter may return a caller-owned, stack-local record. The setter's owner-equality path sets saved SRR1 `0x2000` but only ORs live MSR with `0x2`; it does not explicitly enable live MSR `0x2000`.

### Floating-point contexts
The public FPU wrappers adapt r3 to the internal loader's r4 or saver's r5. Saving sets state mask `0x1`, captures FPR0–31 and FPSCR, restores fp0 after its temporary use, and conditionally stores paired-single images according to HID2. Loading returns immediately when state mask `0x1` is clear; otherwise it restores FPSCR, conditionally restores paired-single images and then restores ordinary FPR images.

The FPU-unavailable handler enables live FP execution and writes hardware SRR1 from saved SRR1 OR `0x2000`, without writing that value back to the saved field. It publishes the incoming owner, skips both helpers for an unchanged owner, skips saving a null previous owner, and otherwise saves then attempts to load. An incoming record without saved FPU state does not cause register initialization. The handler clears state mask `0x2` and returns through `rfi`. Initialization installs this handler and unconditionally clears the tracked owner.

### Diagnostics and additional source routines
`OSDumpContext` reports integer/control/GQR state and conditionally reports FPR/PSF values converted to u32. Its FPU reporting temporarily installs a stack-local context while interrupts are disabled, then clears that temporary context and restores the prior current pointer and interrupt level. This balances current-context lifetime, not necessarily the prior FPU-owner identity. The stack walk stops at null, `0xFFFFFFFF`, or sixteen frames; it does not validate arbitrary frame addresses.

The fully read source also contains `OSSwitchStack`, `OSSwitchFiber` and `OSFillFPUContext`, although they have no owned baseline subjects here. The first exchanges the stack pointer; the second calls a supplied PC on another stack and restores the original stack/LR afterward. `OSFillFPUContext` enables live FP and captures FPU state with the HID2 guard but does not set the saved-state validity flag.

### Evidence limits
The rendered view reports 666 parse errors and zero substitutions, with function-name-only coverage. It supplies no independent proof of names or assembly semantics. Source literals establish diagnostic uses, but no supplied compiled artifact establishes their `.data` membership, contiguity or layout.

Status: synthesized; independent review and live promotion pending.
