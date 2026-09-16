## AMC EXI2 stub backend

The complete canonical and rendered file contains eight unchanged API functions. Existing names accurately preserve their interface roles; existing explanations distinguish those roles from this backend's inert behavior. All 38 facts and both links are retained explicitly in the checkpoint. No semantic rewrite is warranted.

- `EXI2_Init` discards the pending-input pointer reference and callback without storing, dereferencing, or invoking either.
- `EXI2_EnableInterrupts`, `EXI2_Reserve`, and `EXI2_Unreserve` do nothing. They establish no interrupt or reservation state.
- `EXI2_Poll` always returns zero pending bytes.
- `EXI2_ReadN` and `EXI2_WriteN` ignore their buffer and length arguments and return `AMC_EXI_NO_ERROR` without transferring data. Read destinations remain untouched; no buffer lifetime is extended.
- `AMC_IsStub` always returns integer 1.

These behaviors follow directly from [the complete implementation](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/amcstubs/AmcExi2Stubs.c#L1-L34). The [interface header](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/amc/AmcExi2Comm.h#L8-L104) distinguishes zero as a pending-byte count from zero as the no-error status, supplies explicit control-operation prototypes, and documents the intended monitor reservation lifecycle. That lifecycle is not implemented by these stubs.

## Cross-file integration and exceptional behavior

[MetroTRK's non-NDEV selection branch](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/dolphin_trk_glue.c#L66-L91) installs the seven EXI2 callbacks in its persistent communication table and returns the stub flag. Selection still installs the callbacks even when it reports unavailability. Subsequent wrappers dispatch through that table; the stub initialization does not retain the supplied callback or pending-input reference.

In the `MWERKS_GEKKO` bootstrap assembly, [status 1 bypasses `TRK_main`](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/dolphin_trk.c#L92-L114). This is not a safe-recovery guarantee: the failure path uses the returned status in r3 as a context pointer when restoring execution state, an explicitly documented defect in the canonical source. The existing availability descriptions remain valid without implying clean failure handling.

## Evidence boundaries

The rendered view has no substitutions or parse errors and agrees with canonical function names; it is corroborative presentation, not independent behavioral proof. Source-level descriptions of eight function definitions and no local storage are retained without making compiled section, object-layout, or physical-hardware claims. The six parameter subjects contain no baseline facts; their roles and lack of retention are already covered by the function facts.

Status: researched; no-change lead bypass; independent review and live promotion pending.
