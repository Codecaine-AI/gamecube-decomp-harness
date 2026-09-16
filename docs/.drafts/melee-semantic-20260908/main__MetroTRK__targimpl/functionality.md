## MetroTRK PowerPC target implementation

This unit implements debugger memory and register transfers, generated register-access instruction stubs, target/monitor context exchange, debugger-internal exception containment, stop reporting, trace-driven stepping, and target-requested host file I/O. The header declares the target interface, memory-option domains, metadata records, and absolute-address OS-thread objects.

### Memory and register access
Memory requests translate the target address, consult the configured memory map, and copy bytes using independently selected source and destination MSR values. The target-side value is the live MSR OR the saved target DR bit. Writes flush the translated range and also the original range when different, before the final exception check. Exception handling resets reported length but does not roll back transferred bytes. The configured map permits the entire 32-bit address space; it does not establish physical accessibility.

Default and Extended1 transfers operate on saved 32-bit register words. FP and Extended2 transfers use live register access with 64-bit message values. Their loops overwrite intermediate error results and count attempted iterations. FP preparation leaves the live MSR changed; Extended2 preparation leaves HID2/GQR0 changed until some later restoration. Extended1 writes set restore flags before reading replacement values. The extended restore helper consumes both flags, conditionally restores the time base, but branches past the DEC write.

Generated access helpers build five-word instruction arrays, install a terminal BLR, flush 20 bytes, and invoke the array synchronously. The source passes a u128 second argument by value; the claimed r4 scratch-address ABI is not established without compiled evidence.

### Context, events, and lifetimes
The conditional PowerPC assembly saves interrupted target state and restores the monitor context. Transport interruption, nested debugger exception, and ordinary target interruption have distinct paths. The transport guard tests inTRK == 1, while general nested routing tests nonzero. Nested recovery records the original PC and exception ID and advances SRR0 only for the explicitly listed exception IDs.

TRKSwapAndGo checkpoints the monitor and normally resumes the target with rfi. Pending input instead restores the monitor; TRKPostInterruptEvent clears inputActivated and returns without posting. The pending-byte pointer is borrowed and must remain valid for later interrupt and resume dereferences. The restored monitor LR permits the continuation in targcont.c to reserve EXI again after the handoff returns.

Ordinary event classification ignores instruction-read and queue-post errors. The two-entry event queue copies a local event only when space is available. Stop and exception serializers use distinct snapshots, and notify.c ignores their serialization errors while retaining responsibility for message-buffer release. Exception reporting obtains PC and exception ID from the debugger-internal snapshot and reads the instruction from memory at that PC.

### Execution control and support
TRKTargetCheckStep returns whether stepping remains active, not whether it completed. Breakpoint/exception handling stops and notifies when that result is false, including newly completed stepping. Count stepping decrements before resume; range stepping continues while PC remains inside the inclusive range. Non-trace interruptions and unrecognized modes finish by default. Step-over requests are rejected. Protocol callers validate count/range operands, while direct target calls do not repeat those checks. The stopped flag expresses logical execution permission, not proof that target instructions are currently executing.

File support decodes saved GPR3–GPR6, narrows command and handle, uses target pointers directly, and returns separate debugger-side and target-visible statuses. Unsupported commands attempt to post an exception without advancing PC. Recognized commands advance PC after service return, including service errors, but an early service rejection can leave the local I/O result uninitialized.

### Semantic assessment and coverage
Full canonical, rendered, subject and link coverage is inherited from the hash-bound research handoff. The lead independently inspected proposed-fact citations and contradiction evidence, including contextual callers and consumers. Existing function names remain appropriate; no renames are proposed. The C rendered view reports 364 parse errors and zero substitutions, so it is not independent proof of inferred names or ABI behavior. The header reports zero parse errors and substitutions. Source-only ConvertAddress ORs its argument with 0x80000000; TRKTargetCheckException is declared but not defined in these owned files. Neither has a writable function subject in this assignment.

Explicitly retain the inherited 174 supported facts and 42 supported links. Adopt the 12 factual corrections, with instruction provenance clarified in the exception-reporting proposal, and preserve the 11 unresolved section-attributed facts and four unresolved section links. No compiled section membership, size, or padding is inferred from initializers.

Status: synthesized; independent review and live promotion pending.
