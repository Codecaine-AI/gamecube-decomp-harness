## DSPCode semantic review

This data-only translation unit defines `u16 axDspSlaveLength = AX_DSP_SLAVE_LENGTH * 2` and the initialized `u16 axDspSlave[AX_DSP_SLAVE_LENGTH]` array with requested 32-byte alignment. The literal image continues through line 375; there are no host-CPU functions. Both globals have static storage duration and are non-const. [Definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/DSPCode.c#L1-L375)

`__AXOutInitDSP` assigns the array and byte length to the DSP task's IRAM image fields, selects IRAM destination 0, initialization vector `0x10`, and resume vector `0x30`, installs callbacks, conditionally initializes DSP support, submits the task, and waits for its initialization flag. The separate DRAM image is not owned by this file. [Task setup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L117-L140)

The boot routine waits for incoming mail, asserts the expected synchronization value, then serializes the instruction-image address, destination, length, and start vector through mailbox handshakes. These waits have no timeout in the inspected code. [Boot protocol](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dsp/dsp_task.c#L230-L282)

AX output startup waits for DSP initialization before generating the next frame and starting AI DMA. Shutdown stops AI DMA, halts the DSP, waits for DSP DMA completion, and resets the DSP; it does not free these statically stored globals. [Output lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L152-L191)

The existing names and explanations fit these source-level roles. Both rendered pages match canonical source, with zero substitutions and zero parse errors; the renderer only handles function names, so it does not independently validate data-target names. All nine baseline facts and three links are explicitly retained in the inherited research. No supported semantic correction or materially better wording warrants a proposal.

Status: synthesized; independent review and live promotion pending.
