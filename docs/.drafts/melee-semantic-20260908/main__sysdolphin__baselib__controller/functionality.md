# Disjoint Librarian Research

### shard-main__sysdolphin__baselib__controller-000-recovery7
Reviewed canonical and rendered `controller.c` lines 1–480 only.

- Defines library configuration and four-channel master, copy, and game status arrays. Raw input renewal calls rumble interpretation and PADRead, optionally returns when all channels report errors, and enqueues four-channel samples. Full-queue policies merge button bits while dropping an older sample, discard the oldest sample, or skip insertion. Subsequent handling requests PADReset for channels reporting -1 and latches a reset-switch release transition.
- Queue-count access and queue flushing disable interrupts. Flushing can merge button bits into one remaining sample, discard all samples, or preserve the newest sample.
- Input processing applies scalar dead zones and saturation, optional radial stick clamping and dead-zone subtraction, magnitude/angle-based synthetic direction bits, configurable floating-point scaling, and directional-axis conflict filtering. The history-dependent conflict mode remembers the most recent single-axis input.
- Master renewal consumes at most one queued sample under disabled interrupts. Successful channels pass through clamp → analog-to-digital conversion → scale → direction filtering. Error -3 preserves prior input values and clears the error; other errors clear input values. Button changes generate trigger/release masks and reset the repeat delay; unchanged buttons generate repeats when the countdown reaches zero. An empty queue leaves master status unchanged.
- Field helpers copy or clear buttons and raw/normalized analog values without copying or clearing all status metadata. The assigned range ends at the opening loop of copy-status renewal, so its full behavior is not assessed.

### shard-main__sysdolphin__baselib__controller-001
Reviewed controller.c lines 481–596, with preceding helper definitions and function entry read for context; this is not complete TU coverage.

- Copy-status and game-status renewal independently derive four destination records from master status. Each preserves its previous button mask, propagates the master error, and copies input fields on success or zeros them on error. Press and release masks reflect transitions relative to that destination's previous buttons. Any button change restarts the repeat delay and emits newly pressed buttons; otherwise the countdown emits held buttons when it reaches zero and reloads the repeat interval.
- `HSD_PadRenewStatus` calls raw renewal with argument zero, then master, copy, and game renewal in that order.
- `HSD_PadReset` disables interrupts, calls rumble removal and per-index rumble-off routines for indices 0–3, flushes the queue with `HSD_PAD_FLUSH_QUEUE_THROWAWAY`, calls `PADRecalibrate(0xF0000000)`, clears `reset_switch`, and restores the prior interrupt state.
- `HSD_PadInit` installs the library defaults and supplied queue configuration, calls rumble initialization with the supplied list parameters, initializes all four master/copy/game records from the default status, then calls `PADInit`.

### shard-main__sysdolphin__baselib__controller-002
Reviewed the complete assigned header, `controller.h:1–134`, in canonical and rendered views; this is not complete translation-unit coverage.

The header defines a 32-bit controller-input mask, named button masks and combinations, a no-controller error constant, and four queue-flush enum alternatives. `HSD_PadData` contains four SDK `PADStatus` records. `HSD_PadStatus` groups button-state fields, a repeat counter, integer stick/analog fields, floating-point normalized-value fields, direction, and error. `PadLibData` declares queue bookkeeping and storage, repeat parameters, conversion/clamping/scaling settings, reset-switch fields, and rumble state.

Three external four-entry status arrays expose master, game, and copy records. The two inline getters directly return `nml_stickY` or `nml_subStickY` from the selected copy-status entry, without local bounds checking or transformation. The remaining functions are declarations for queue access/flushing, reset-switch access, status renewal, reset, and initialization; their implementations and ordering are outside this assigned range.

### shard-main__sysdolphin__baselib__controller-003
The assigned subjects describe controller initialization templates, persistent four-port input state, selective PAD reset masks, and two input-conditioning helpers. Initialization installs caller-owned queue storage and twelve default status records. Renewal transforms queued samples into master input and independently derives copy/game button transitions and repeats. Analog channels undergo minimum rejection, maximum saturation, and optional rebasing; stick vectors generate direction masks through configurable radial and angular tests. Source behavior is supported, but compiled section ordering and floating-point constant-pool attribution remain unverified.

### shard-main__sysdolphin__baselib__controller-004
Reviewed the six assigned controller subjects and their 30 baseline facts. Radial stick conditioning precedes directional conversion and scaling; digital cross-axis filtering precedes button-edge and repeat derivation. Raw queue operations expose protected occupancy snapshots and merge, discard, or retain-newest policies. RESET polling produces a persistent release-triggered request consumed by higher-level reset handling. Initialization replaces HSD software state and prepares queue and rumble storage before calling the independently guarded PAD initializer. This review does not claim complete translation-unit coverage.

### shard-main__sysdolphin__baselib__controller-005
The assigned renewal routines poll and buffer four controller records, consume queued input into processed master state, and publish independent copy/game snapshots with button edges and countdown-driven repeats. Raw acquisition also services rumble, requests channel resets, and latches reset-switch release. Master renewal preserves prior input for error -3 and clears input for other nonzero errors. The reset routine clears scheduled and direct rumble state, discards queued samples, requests PAD recalibration, and clears the reset latch under interrupt protection; it does not itself guarantee immediate motor shutdown or successful origin replacement on every channel. This review assesses the six assigned subjects, not complete TU coverage.

### shard-main__sysdolphin__baselib__controller-006
The reviewed controller pipeline queues four-port PAD samples, applies configurable analog clamping, directional-bit conversion, scaling and directional filtering, and derives button edges and repeat timers. Copy and game statuses independently publish master inputs and recompute transitions. Master error -3 preserves inputs while clearing the error; other errors clear inputs. Reset polling latches an observed asserted-to-deasserted transition, and HSD_PadReset clears the request. A higher-level consumer handles audio, blanks video, waits for retraces and invokes OSResetSystem.

### shard-main__sysdolphin__baselib__controller-007
The assigned subjects have no baseline facts. The relevant canonical helpers and their direct callers were reviewed. HSD_PadClampCheck1 mutates an unsigned-byte sample: values below min become zero; other values are capped at max and, only when shift equals 1, reduced by min. Its caller applies it to analogL/R and analogA/B using the corresponding configuration fields. HSD_PadADConvertCheck1 computes vector magnitude and angle, skips conversion below adc_th, and ORs supplied directional masks into button for qualifying angular regions widened by adc_angle. Its caller supplies separate masks for stick and subStick. Register-qualified subject identities are not established by these C bodies.

### shard-main__sysdolphin__baselib__controller-008
The assigned subjects have no baseline facts. Their containing source functions implement radial clamping of signed stick coordinates and directional-button filtering. HSD_PadClampCheck3 zeros coordinates below a minimum radius, scales coordinates above a maximum radius, and optionally subtracts the minimum radially. Its caller applies it to both stick pairs. HSD_PadCrossDir mutates a status record's directional buttons according to global configuration, optionally using remembered axis preference. Master-status renewal invokes these operations on successfully read controller samples. This review covers only the assigned subjects, not the entire translation unit.

### shard-main__sysdolphin__baselib__controller-009
The assigned parameter subjects concern queue flushing, controller initialization, and raw-status error checking. HSD_PadFlushQueue selects between merging queued button bits, discarding the queue, and retaining its newest entry, with interrupts disabled during mutation. HSD_PadInit stores the supplied queue capacity and storage pointer, forwards its remaining two arguments to rumble initialization, resets all four entries of each status array, and calls PADInit. HSD_PadRenewRawStatus optionally returns after PADRead when all four channels report errors; rumble interpretation occurs before this check. All six assigned subjects have empty baseline fact lists, so there are no baseline fact IDs to disposition. This review does not claim complete translation-unit coverage.

### shard-main__sysdolphin__baselib__controller-010
The reviewed links describe four-port controller sample buffering, radial stick conditioning, analog-to-digital direction conversion, directional filtering, and publication of error-filtered snapshots with button edges and repeats. Initialization installs queue storage, initializes status arrays, forwards rumble-pool parameters, and calls PADInit. Reset-switch release latching and channel-mask recovery are supported at source level; their attributed compiled sections remain unverified.

### shard-main__sysdolphin__baselib__controller-011
The reviewed links concern four-port PAD acquisition and buffering, analog conditioning, master-status transitions and repeats, status publication, reset-switch latching, and subsystem reset. Source supports these functional relationships. Compiled-section identities remain unverified, and the external console-reset caller could not be read within the allowed file boundary.

Status: researched; no-change lead bypass; independent review and live promotion pending.
