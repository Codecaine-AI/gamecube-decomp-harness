## Audio Interface driver

`ai.c` implements two hardware-facing audio paths: DSP audio DMA for buffered output, and the AI stream path identified by the public API as streamed disc audio. Existing function names accurately describe their canonical roles; no renaming is proposed. Both rendered pages were reviewed, but their unchanged names are not independent evidence.

### DMA and callback lifetime

`AIInitDMA` programs DSP address and length registers under interrupt exclusion. The exact incoming masks are less restrictive than the decoded hardware fields: address low bits are not explicitly removed, and `(length >> 5) & 0xFFFF` can contribute the DMA-enable bit. Ordinary aligned AX buffers use 640-byte descriptors; `AIStartDMA` and `AIStopDMA` separately set and clear enable. AX registers its callback before starting DMA, then alternates output buffers as its callback coordinates DSP readiness.

Callback registration snapshots the previous pointer before disabling interrupts, protects the replacement write, and restores the prior interrupt state. An executing `AIInit` also clears registrations. `AIReset` only clears the initialization guard; it does not stop DMA, unregister callbacks, or remove handlers.

Both interrupt handlers acknowledge hardware and bracket callback dispatch with a temporary OS context. Stream callbacks receive the current sample count. DMA callbacks receive no explicit arguments and optionally execute on the stack retained by `AIInit`. The assembly trampoline restores its previous stack after normal callback return, but leaves the saved address in `__OldStack`; its single global save slot does not establish nested-dispatch safety.

### Stream and rate transitions

Play state is AI control bit 0; stream rate is bit 1. DSP rate is bit 6 XOR 1. The header defines 32 kHz as 0 and 48 kHz as 1. Left and right stream volumes occupy separate eight-bit fields.

Equal-state requests skip transition work. Starting playback at stream-rate state 0 invokes calibration while muted and then restores channel values crosswise: old right becomes left and old left becomes right. This existing exceptional behavior is retained explicitly.

A changed DSP request first clears bit 6; only the 32-kHz request performs extended muted calibration and restores surrounding stream state. The public stream-rate setter accepts only 48 kHz, while the debug wrapper directly invokes the internal helper. That helper preserves play, volumes and DSP-rate state across calibration. Restoring active playback at new rate 0 can invoke calibration again through `AISetStreamPlayState`; final volume restoration still uses the helper's original same-channel values.

### Initialization and calibration

`AIInit` computes retained timing thresholds, mutes channels, resets trigger/count, requests initial stream/DSP rates, clears callbacks, records an optional callback stack, installs handlers 5 and 8, and publishes initialized state. It does not unconditionally stop playback. Its non-null stack assertion tests `((u32)stack & 7) != 0`, contrary to the accompanying alignment message; this discrepancy must not be silently corrected in semantic knowledge.

`__AI_SRC_INIT` measures sample-counter transitions at rate states 0 and 1. Every attempt restores rate 0 and stops the stream before classifying the interval. Accepted intervals select `min_wait` or `max_wait`; other intervals retry. Sample-counter polling, retries and the final deadline wait have no timeout. DEBUG builds additionally record profile start/end timestamps.

Source declarations establish independently typed persistent globals, not a compiled `.sbss` size, ordering or padding. No compiled layout claim is made.

Status: synthesized; independent review and live promotion pending.
