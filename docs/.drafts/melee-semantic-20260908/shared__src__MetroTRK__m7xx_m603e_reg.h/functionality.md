## Register-state declarations

`src/MetroTRK/m7xx_m603e_reg.h` defines MetroTRK PPC 6xx/7xx register-state containers, not executable save/restore behavior.

- `Extended1_PPC_6xx_7xx` declares segment registers, time-base and processor-control registers, instruction/data BAT registers, translation and exception-related registers, performance-monitoring registers, and additional fields including `exceptionID`, `GQR[8]`, `HID_G`, `WPAR`, and DMA registers. Its minimum register index is zero; its maximum is computed using `sizeof(Extended1_PPC_6xx_7xx) / sizeof(Extended1Type) - 1`, rather than a hard-coded last index. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/m7xx_m603e_reg.h#L8-L88)
- `Extended2_PPC_6xx_7xx` declares `u32 PSR[32][2]`. `ProcessorState_PPC_6xx_7xx` aggregates default, floating-point, and both extended register groups, followed by `transport_handler_saved_ra`; `ProcessorState_PPC` aliases that aggregate type. This header alone does not establish the saved return address's cross-file lifetime or register-transfer behavior. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/m7xx_m603e_reg.h#L90-L102)

## Semantic assessment

The complete canonical and rendered views agree; the renderer reports zero substitutions and zero parse errors. There are no baseline subjects, facts, or links to rename, correct, or retain. An empty proposal is appropriate.

Offset and size comments near the extended-state arrays and aggregate are internally inconsistent with the declarations. They must not be treated as verified compiled layout. This uncertainty is recorded separately; no compiled layout or runtime protocol claims are made.

Status: synthesized; independent review and live promotion pending.
