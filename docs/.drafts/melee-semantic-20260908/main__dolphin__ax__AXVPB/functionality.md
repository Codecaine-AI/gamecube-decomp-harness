## AX voice-parameter management

AXVPB.c owns parallel persistent host AXVPB records and DSP-facing AXPB, ITD-history, and update arrays. Initialization clears the PB, ITD, and host arrays, pairs entries by index, installs split buffer addresses, constructs next pointers using an explicit 0xC0-byte stride, and pushes voices onto the free stack. The local priority assignment of 1 is intermediate: __AXPushFreeStack changes it to 0. __AXSetPBDefault resets selected playback/update fields rather than the whole object, preserving allocator metadata and pending depop state.

## Staging and reconciliation

Public setters generally save/disable interrupts, modify host parameters, accumulate synchronization flags, and restore the previous interrupt state. Descriptor pointers are copied, not retained. Full address, SRC, and ITD setters clear competing narrower flags at the time of their call; subsequent narrow setters can reintroduce flags that take precedence during service.

__AXServiceVPB counts every serviced voice. With sync == 0 it reads DSP state, current volume, and current address into the host image. COPYALL takes precedence and performs 48 u32 assignments, a 0xC0-byte transfer despite the source comment claiming 0xF4. Its update-data transfer runs from __AXUpdates to host updateData. Selective COPYUPDATE transfers in the opposite direction. In selective mode, COPYTSHIFT precedes COPYITD, SWAPVOL precedes COPYVOL, individual address flags precede COPYADDR, and COPYRATIO precedes COPYSRC. State has a readback fallback; current address is read back only when neither full nor partial address flags apply. Current volume is not generally refreshed for an unrelated nonzero sync mask: selective readback requires SWAPVOL. Full selective ITD copying clears sixteen u32 history words.

## Frame scheduling and lifetime

__AXSyncPBs invalidates PB and ITD arrays, resets the serviced-voice count, and walks allocation stacks 31 down to 1. Voices with state exactly 1 or queued updates incur SRC-table, mixer-table, and fixed costs. Admission requires the cumulative estimate to remain strictly below the ceiling; equality dumps the voice. Charged cost is not rolled back after a dump. Other allocated voices are serviced without these added costs. Processed voices have transient synchronization/update bookkeeping reset. Stack 0 follows a separate path that clears DSP state and update counts rather than resetting all host fields. PB, ITD, and update arrays are flushed afterward.

Dumping stops the host/DSP voice and queues a callback; it does not immediately free the allocation. AXOut later services the callback stack, whose allocator implementation invokes callbacks before returning records to the free stack. The serviced-voice count is read into profiling later in the same frame, after intervening callback, auxiliary, command-generation, and DMA work. __AXGetPBs exposes persistent storage whose address AXCL serializes after command opcode 2.

## Audio controls and exceptional cases

Mix staging copies eighteen halfwords and derives mode-dependent routing/ramp bits. Mode 4 uses a different auxiliary-B bit and still tests vDeltaAuxAS, despite omitting vDeltaS and vDeltaAuxBS. Synth callers use ITD initialization/retargeting for stereo positioning and signed envelope deltas for bounded volume ramps. AXSetVoiceVe does not clear SWAPVOL; synth explicitly clears that competing flag before settled full-envelope updates.

Address format 0 asserts that loop/end/current addresses avoid ADPCM frame-header positions. Numeric formats 10 and 25 install distinct decoder defaults; unknown formats reach an assertion. State setters accept arbitrary u16 values, request depopping for zero, and do not clear an existing depop request for nonzero input. SRC ratio conversion multiplies by 65536.0f, converts to u32, then caps the encoded value at 0x40000; no lower-bound or nonfinite-input validation is present.

## Review result

All 1,288 canonical and rendered lines, all 59 subjects, 114 facts, and 21 links were reviewed. The rendered view made no substitutions and reported no parse errors; existing function names fit the canonical behavior. The saved ledger explicitly retains 105 facts and all 21 links, supersedes five factual explanations, and leaves four compiled-layout assertions unresolved. No cosmetic renaming, entity creation, link rewriting, or merging is proposed.

Status: synthesized; independent review and live promotion pending.
