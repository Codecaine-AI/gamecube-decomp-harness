## OSSerial.h
This header defines the serial-interface declaration surface. It supplies the no-channel sentinel (`CHAN_NONE = -1`), four-channel limit, register indices, and communication-control/status bit masks ([lines 6–28](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSSerial.h#L6-L28)).

`SITypeAndStatusCallback` receives a channel and type value. `SIControl` declares channel, polling, input-buffer and callback fields; `SIPacket` additionally declares output-buffer fields and a `long long` time field. These are source declarations, not evidence of compiled offsets or buffer ownership ([lines 30–48](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSSerial.h#L30-L48)).

The API declarations cover busy queries, polling-handler registration, initialization, synchronization, status and command access, polling configuration, response retrieval, transfers with an `OSTime delay`, and synchronous/asynchronous type queries ([lines 50–69](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSSerial.h#L50-L69)). Implementations are not present here; return-value encodings, exceptional branches, callback timing and cross-file buffer lifetimes cannot be established from these declarations alone.

The entire canonical and rendered header was reviewed. Rendered function names remain unchanged, with zero substitutions and zero parse errors. Existing names fit the declaration surface; no supported semantic correction or useful owned-subject addition was identified. The frozen baseline contains no subjects, facts or links for this assignment, so the proposal is empty.

Status: synthesized; independent review and live promotion pending.
