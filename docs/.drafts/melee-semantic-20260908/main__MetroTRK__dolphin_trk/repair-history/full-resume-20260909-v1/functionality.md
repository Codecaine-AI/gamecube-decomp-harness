## Dolphin MetroTRK integration

This unit provides debugger bootstrap, communications-interrupt enablement, target-address translation, selected exception-vector installation, and initial stopped-target bookkeeping. Existing function names fit their canonical behavior; the rendered views introduce no substitutions.

Under `MWERKS_GEKKO`, `InitMetroTRK` saves the incoming processor context, repairs the saved r1/r3 values after scratch use, copies LR into saved LR and PC, saves CR, clears MSR_EE while passing the original MSR through SRR1 to extended-state saving, clears IABR/DABR, and switches to `_db_stack_addr`. Incoming r5 supplies the communications hardware identifier. Exactly result 1 takes the defective restoration branch: r3 remains 1 rather than a CPU-state pointer. Every other result tail-branches to `TRK_main`; that branch alone does not prove permanent debugger residence. The neighboring initializer selects NDEV versus other callbacks and returns backend stub status, so the local comment's hardware-validation explanation is not an exact description of the callee.

`EnableMetroTRKInterrupts` unconditionally delegates to the previously configured communications interrupt callback. OSInit externally guards its startup invocation with a non-null BI2 debug flag of at least 2, before arena clearing and global interrupt enablement.

`TRKInitializeTarget`, the final guarded nub-initialization stage, sets stopped=true, snapshots the live MSR, sets `MTRK_NubInit_804A50C8` to 0xE0000000, and returns kNoError. Translation reads this mutable base and the separately saved DBAT3U: addresses in the half-open 0x4000-byte window pass through only when `(DBAT3U & 3) != 0`; otherwise the result is `(addr & 0x3FFFFFFF) | 0x80000000`. This is a saved-register validity test, not a live BAT read or a mapping installation.

Vector installation snapshots the 32-bit selection mask at translated address 0x44, examines bits 0 through 14, and maps selected bits through the ordered exception-offset table. Each helper invocation copies 0x100 bytes from `gTRKInterruptVectorTable + offset` into the translated vector destination and flushes that same range. Unselected vectors are untouched. The source-annotated SECTION_INIT reset hook only invokes this pass; it does not reset the console. The protocol handler issues a success ACK before invoking the hook, without guarding on successful ACK delivery.

The header declares the five public entry points consistently with the implementation. Source declarations establish an uninitialized int base and an initialized fifteen-entry u32 table, but do not establish their combined compiled section membership, ordering, or a 64-byte .data extent. Those baseline claims remain unresolved rather than being replaced with another inferred layout.

Status: synthesized; independent review and live promotion pending.
