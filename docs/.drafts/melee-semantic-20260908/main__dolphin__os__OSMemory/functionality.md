## Dolphin OS memory support

The unit provides read-only physical and simulated main-memory capacity queries. DEBUG builds read boot-area storage; other builds return the corresponding OS globals (OSMemory.c lines 7–25).

Memory-protection initialization reads simulated capacity before disabling interrupts. Capacities at most 24 MiB select Config24MB; capacities above 24 MiB through 48 MiB select Config48MB; larger values skip both mapping callbacks but still receive controller and callback setup. The assembly helpers, guarded by __MWERKS__, replace matching instruction/data BAT0 and BAT2 entries with ordered invalidation and synchronization. RealMode clears translation bits and transfers to the physical callback address through rfi; the configuration callback restores translation and resumes at the LR continuation through another rfi (lines 50–154).

Initialization clears controller register 16, writes 0xFF to register 8, masks 0xF0000000, installs MEMIntrruptHandler in interrupt slots 0–4, and registers the static reset descriptor with priority 0x7F. It rereads simulated capacity and writes 2 to register 20 only for exactly 24 MiB simulated on larger physical memory. It then unmasks 0x08000000 and restores the previous CPU interrupt state. The one-time startup guard belongs to OSInit, not this initializer (lines 139–171; OS.c lines 143–196).

The interrupt callback captures cause and the reconstructed fault address, clears register 16 before dispatch, and invokes error-table entry 15 when present; otherwise it invokes the unhandled-exception path. Its interrupt identifier is unused and its context is forwarded (lines 36–48). The reset framework retains the descriptor and later calls its callback with the phase flag. OnReset always returns TRUE; only the final phase writes register 8 and masks 0xF0000000. This is not a claim that every memory interrupt is masked (lines 27–34; OSReset.c lines 65–86).

Existing behavioral knowledge is retained without equivalent-wording rewrites. The rendered view has no substitutions and reports 117 parse errors, so it supplies no independent confirmation of inferred names. The source object ResetFunctionInfo is explicit, but its association with the compiled .data target remains unverified; no compiled section extent or layout is asserted.

Status: synthesized; independent review and live promotion pending.
