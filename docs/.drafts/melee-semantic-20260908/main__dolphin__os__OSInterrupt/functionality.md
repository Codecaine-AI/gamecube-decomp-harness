## Dolphin OS external-interrupt subsystem

The unit implements processor external-interrupt enable/disable/restore primitives, persistent callback registration, two-layer logical interrupt masking, hardware enable-register projection, and prioritized external-interrupt dispatch.

`OSDisableInterrupts` and `OSEnableInterrupts` return the previous MSR external-interrupt-enable bit. `OSRestoreInterrupts` selects disabled versus enabled using zero versus nonzero input, but computes the previous bit in r4 rather than the ABI return register. Its existing defect documentation is retained. The disable routine's restart labels also participate in `OSLoadContext`'s interrupted-sequence restart handling.

Initialization assigns the callback table to cached physical address 0x3040, clears its entries and both mask words, masks supported device groups, and installs the exception-4 entry stub. Reinitialization is destructive. DEBUG initialization additionally writes PI status bit 1 and unmasks logical bit 0x100, which denotes PI_ERROR, not PI_DEBUG.

The global and local mask words reside at cached physical addresses 0x00C4 and 0x00C8. Their union determines suppression. `SetInterruptMask` projects one selected MEM, DSP, AI, EXI-channel or PI group per call and removes that entire group from the worklist. Unsupported work is returned unchanged; consequently an unsupported nonzero worklist can prevent a caller loop from completing. Hardware refresh work is not always equivalent to an effective-mask change: global unmasking includes requested locally masked bits, while the local setter uses `(global | previousLocal) ^ newLocal`.

The dispatcher excludes PI status bit 0x10000, restores context for spurious entries, expands peripheral status into logical causes, filters both mask layers, and selects one cause using ordered priority groups and count-leading-zero. A missing handler does not cause a search for another pending recipient. Registered callbacks execute under scheduler suppression; rescheduling afterward is conditional. Diagnostic values are written separately before eligible callbacks, only for indices above MEM_ADDRESS. DEBUG paths additionally report PI errors and unhandled causes. Context restoration terminates through `OSLoadContext`, rather than ordinary function return.

Canonical and rendered source were reviewed across all 555 lines, and all 26 subjects, 63 facts and 10 links were enumerated. Existing supported explanations are explicitly retained in the checkpoint. The rendered view reports 38 parse errors and zero substitutions and covers function names only; it supplies no independent validation of parameter names or data-section hypotheses. No compiled section-size, placement or padding claims are established.

Status: synthesized; independent review and live promotion pending.
