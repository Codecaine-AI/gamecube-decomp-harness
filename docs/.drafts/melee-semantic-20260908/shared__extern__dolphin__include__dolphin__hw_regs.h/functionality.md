## Hardware-register definitions

`extern/dolphin/include/dolphin/hw_regs.h` provides volatile register-bank access and symbolic VI/DSP array indices, not executable control flow. Under `__MWERKS__` without `M2CTX`, it uses absolute-address array declarations; otherwise it supplies volatile-pointer macros at the same addresses. VI, MEM and DSP use `u16`, while PI, DI, SI, EXI and AI use `u32`. DSP and DI have unspecified array bounds in the compiler-specific branch. These are source-level declarations, not evidence of compiled sections or allocation layout. [Canonical definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/hw_regs.h#L4-L22)

VI constants identify array-element indices for timing, blanking, field bases, display position, interrupts, scaling, filter coefficients, clock selection, DTV status and width. The indices are not byte offsets, and gaps in the named index sequence are preserved. The field-base comments distinguish ordinary 2D fields from left/right pictures in 3D. [VI definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/hw_regs.h#L24-L88)

DSP constants identify mailbox, control/status, ARAM configuration, ARAM DMA address/size, and DSP DMA registers. `DSP_DMA_START_FLAG` is the separate value `0x8000`, not a register index. The header alone does not establish transfer sequencing, address reconstruction, mailbox direction relative to callers, or cross-file DMA-buffer lifetimes. [DSP definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/hw_regs.h#L90-L112)

## Semantic assessment

All 115 canonical and rendered lines were reviewed. The renderer reports 26 parse errors and zero substitutions; the rendered text nevertheless matches the canonical header. No proposed names, frozen subjects, facts or links exist in this assignment. Existing source names and comments require no supported correction from this evidence. The proposal is intentionally empty.

Status: synthesized; independent review and live promotion pending.
