## AX output backend

AXOut coordinates the AX DSP task, alternating audio-output buffers, AI DMA, deferred voice callbacks, auxiliary processing, a nullable user callback, and optional profiling. Existing canonical function names fit these roles; no rename is warranted. The rendered view matches the canonical file, with zero substitutions and zero parse errors.

### Frame pipeline
`__AXOutNewFrame` forwards `lessDspCycles` to parameter-block synchronization, prints studio state, obtains a prepared command-list address, and sends `0xBABE0180` followed by that address through two separately polled DSP-mailbox handshakes. It then services deferred callbacks, processes auxiliary audio, invokes the optional user callback, and calls `__AXNextFrame` with the intermediate buffer and current output-buffer address. Crucially, AXCL shows that this last call constructs and flushes the *next command list*: it does not synchronously write PCM samples. AXOut toggles the output index and programs AI DMA for `0x280` bytes from the other buffer. Timing fields and voice count are recorded; exactly 56 bytes are copied to a current profile only when one is available.

Evidence: [frame sequence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L25-L79), [command-list handoff and construction](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXCL.c#L19-L107).

### AI/DSP rendezvous
The AI callback records time only when readiness is 0. State 1 is consumed by writing 0 and immediately starting a frame with adjustment 0. Every other value follows the deferred path: write 2 and assert the DSP task. In particular, repeated AI callbacks in state 2 do not refresh the saved timestamp. DSP resume consumes state 2 by writing 0 and passing `(u32)(OSGetTime() - __AXOsTime) / 4` to frame processing; otherwise it writes 1. These are numeric state transitions, not proof that arbitrary callback orderings are impossible. `DSPAssertTask` can return NULL, and AXOut ignores its result.

Evidence: [callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L81-L110), [assertion branches](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dsp/dsp.c#L173-L202).

### Startup, lifetime, and shutdown
Startup checks buffer alignment, resets the frame index, clears and flushes the sample buffers, configures and submits the persistent DSP task, and waits for its init callback without a timeout. The task uses `axDspSlave`, vectors `0x10`/`0x30`, init/resume/done callbacks, no request callback, and priority 0. Its DRAM backing declaration is `u16 ax_dram_image[8192]`; the independently assigned descriptor length is `0x2000`. These must not be conflated. After DSP initialization, AXOut registers the AI callback, primes a command list targeting buffer 1, sets readiness 1 and a null user callback, and starts DMA on cleared buffer 0. The init and done callbacks ignore their task arguments and set their respective flags; only the init flag is polled here.

Shutdown disables interrupts, clears the user callback, stops AI DMA, halts DSP, waits for DSP DMA to become idle, resets DSP, and restores the previous interrupt state. It does not wait for the done flag or explicitly unregister the AI callback. No local timeout or recovery branch bounds the mailbox, initialization, or shutdown waits.

Evidence: [DSP setup](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L97-L140), [startup and shutdown](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L142-L197).

### Higher-level callback
`AXRegisterCallback` replaces one nullable callback slot. HSD initialization installs `HSD_SynthCallback`, connecting deferred voice cleanup, checks of a rotating subset of sound nodes, synthesizer/stream maintenance, optional master-clock notification, and synth-frame advancement to AX frame processing.

Evidence: [registration](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1469-L1477), [consumer](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L46-L57), [HSD callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/synth.c#L1144-L1183).

### Review outcome
Explicit checkpoint dispositions cover all 50 facts and 18 links: 35 facts retained, 5 superseded, 10 unresolved; 11 links retained and 7 unresolved. Source-level storage roles remain useful, but section-target membership/layout is not established by the available evidence. No compiled placement claim is made.

Status: synthesized; independent review and live promotion pending.
