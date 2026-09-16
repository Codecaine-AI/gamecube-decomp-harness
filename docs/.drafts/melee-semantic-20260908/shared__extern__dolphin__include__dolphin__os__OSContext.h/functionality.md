## OSContext.h
Defines the OS context interface: register-offset constants, the OSContext register-storage declaration, and context, floating-point context, stack, and fiber operation prototypes. The header supports C++ callers through extern C linkage. Canonical source: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSContext.h#L1-L174.

The source defines __OS_CONTEXT_FRAME as 768 and constants for GPRs, CR/LR/CTR/XER, FPRs, FPSCR, SRR registers, mode/state, GQRs, padding, and PSF slots. OS_CONTEXT_STATE_EXC is 0x02u and OS_CONTEXT_STATE_FPSAVED is 0x01u; their runtime transitions are not specified here (L10-L135). OSContext declares 32 GPRs, 32 FPRs, special registers, 16-bit mode/state, eight GQRs, and 32 PSF entries (L137-L153).

Do not equate the numeric macros or comments with verified compiled layout: OS_CONTEXT_FPSCR is 400 whereas the fpscr member comment is 0x194 and fpscr_pad is annotated 0x190. Likewise OS_CONTEXT_PSF0 is 456 while the psf member comment is 0x1C4 (452). These source distinctions are preserved, not corrected by assuming alignment or assembly access width. No compiled evidence was supplied.

The prototypes cover stack-pointer inspection, context dumping/loading/saving/clearing/initialization, current-context access, FPU-context operations, and stack/fiber switching (L155-L167). They do not establish implementation branches, return-value semantics, or cross-file context ownership and lifetimes. Existing API names fit their declared interface; there is no supported rename. The rendered view has zero substitutions and zero parse errors, and marks ten implementation-owned function bindings unchanged/shadowed. No owned subjects, baseline facts, or links were returned; the proposal is empty.

Status: synthesized; independent review and live promotion pending.
