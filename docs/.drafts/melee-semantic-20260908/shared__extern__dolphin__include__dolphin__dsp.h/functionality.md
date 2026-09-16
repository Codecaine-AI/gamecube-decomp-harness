## DSP interface header
`extern/dolphin/include/dolphin/dsp.h` defines `DSPCallback` as a callback receiving `void *task` and declares `DSPTaskInfo`. The descriptor contains volatile state, priority and flags; IRAM/DRAM memory pointers, lengths and DSP addresses; initialization/resume vectors; four callbacks; next/previous task pointers; and two `OSTime` fields. These are source declarations, not independently verified compiled-layout claims. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dsp.h#L4-L29)

The header declares mailbox checks, reads and sending, interrupt assertion, initialization/status, reset and halt controls, DMA status, task addition/cancellation/assertion, and current-task access. It supplies no implementations establishing return-value encodings, scheduling rules, callback order, ownership or task lifetime. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/dsp.h#L31-L47)

The complete rendered view leaves canonical names unchanged, with zero substitutions and zero parse errors. No name or explanation correction is supported by this declaration-only review. The owned baseline contains no subjects, facts or links; the proposal is therefore empty.

Status: synthesized; independent review and live promotion pending.
