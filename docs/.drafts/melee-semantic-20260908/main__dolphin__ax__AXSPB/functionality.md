## AXSPB semantic review

AXSPB owns a statically allocated, explicitly 32-byte-aligned `_AXSPB` studio block and nine persistent `long` depop accumulators: main, auxiliary A and auxiliary B, each with L/R/S channels. `__AXDepopVoice(AXPB* p)` unconditionally adds the nine corresponding `p->dpop` values to those accumulators; it neither modifies the input block nor checks the pointer.

`__AXDepopFade` computes the signed integer quotient `hostSum / 160`. If nonzero, it clamps that quotient to [-20, 20], publishes the original sum as DSP volume, subtracts `step * 160` from the persistent sum, and publishes `-step` as the signed DSP delta. If the quotient is zero, it clears the host sum, volume and delta. Thus small negative residuals also terminate; the threshold is not simply a signed comparison against 160. The source supplies no saturation guard for additive accumulator overflow.

`__AXPrintStudio` applies this operation independently to all nine channel paths and flushes the entire studio object. Despite its name, it does not print diagnostics. `__AXGetStudio` merely returns the object's address cast to `u32`, without preparing or flushing it. These behaviors are established by [AXSPB.c lines 7–101](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXSPB.c#L7-L101).

### Cross-file lifetime and ordering

[AXCL.c lines 36–47](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXCL.c#L36-L47) serializes the studio address after command 0 as high and low 16-bit words. [AXOut.c lines 25–59](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AXOut.c#L25-L59) synchronizes voices, updates/flushed studio parameters, then dispatches the selected command list. Callback processing and construction of the next command list occur afterward. The persistent studio object is therefore distinct from the alternating command-list storage.

`__AXSPBInit` resets only the nine host accumulators, not the studio block, and returns normally without a value. DEBUG builds additionally report initialization. `__AXSPBQuit` only emits a DEBUG report and otherwise does nothing. [AX.c lines 6–27](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/AX.c#L6-L27) places these routines in AX startup/shutdown.

### Names and baseline assessment

The complete rendered view matches canonical behavior, with zero substitutions and zero parse errors. Existing storage names and functional explanations remain useful; no equivalent-wording rewrites or speculative renames are proposed. One factual terminology correction replaces the initializer's misleading description as “non-returning.” All 36 baseline facts and nine links have explicit checkpointed dispositions. The parameter subject has no baseline facts. Source section comments are not treated as compiled-layout proof.

Status: synthesized; independent review and live promotion pending.
