## Assessment
The existing function names and baseline explanations fit the canonical implementation. All 14 facts and 8 links are explicitly retained through the inherited research dispositions; no semantic changes are proposed. The hash-bound handoff and both proposal and functionality artifacts agree: there are no proposed facts, non-retain claims, or contradictions requiring additional source checks.

## Functionality
Under `MWERKS_GEKKO`, this unit provides two parameterless, no-frame assembly routines for MetroTRK privileged processor-context preservation. The header declares both routines. Without that guard, their assembly bodies are excluded.

`TRKSaveExtended1Block` captures segment registers and successive special-register groups into `gTRKCPUState.Extended1`, using r2 and r10–r31 as working registers. It stores an explicit zero between the SPRG group and IABR. Fixed branches skip the alternate UMMCR2-family block and the DMISS/DEC block; those source blocks are not executed through normal entry. The selected DABR/performance/thermal/cache-control block is saved before `blr`.

`TRKRestoreExtended1Block` reads and clears both TBR and DEC request bytes before restoration. A nonzero saved TBR request enables lower and upper time-base writes. DEC is consumed but its restoration block is bypassed unconditionally, along with miss-register restoration. Another fixed branch skips MMCR2/BAMR/MSSCR/PIR restoration. The selected register sequence and common segment/HID/BAT/translation/fault/SPRG tail run before `blr`. Save and restore therefore are not an unconditional inverse for every captured slot.

Startup and target-interrupt entry save ordinary context before calling the extended saver. Interrupt early returns and exceptions already inside TRK bypass that target snapshot path. During resumption, `TRKSwapAndGo` calls the restorer only on its no-pending-input path, then reloads ordinary target context and executes `rfi`. These are debugger operations, not gameplay mechanics.

## Evidence limits
The source constant `target_cpu_minor_type = 84` does not provide runtime processor dispatch here. Processor-family labels describe fixed source branches, not independently verified hardware classification. Existing references to a compiled path are retained as descriptions of the guarded assembly control flow; no compiled layout or section conclusion is drawn. The C rendering reports 262 parse errors and no substitutions, so semantic validation rests on canonical assembly rather than renderer inference. These inherited evidence limits are accepted because neither rendered names nor source-only control flow establish compiled layout or hardware classification.

Status: synthesized; independent review and live promotion pending.
