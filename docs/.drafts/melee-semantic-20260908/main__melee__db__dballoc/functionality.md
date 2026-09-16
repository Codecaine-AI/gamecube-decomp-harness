# Object-allocation limiter

## Behavior
`fn_SetupObjAllocLimiter(void)` clears `db_804D6BA0.b0` and `.b1`. It initializes software latches only: it does not disable allocator enforcement, clear recorded peaks, or reset numeric ceilings.

`fn_UpdateObjAllocLimiter(int player)` operates only when `DbLevel == DbLKind_Develop`. B held plus newly pressed D-pad Up toggles the effect allocator (`efLib_AllocData`). Independently, A held plus newly pressed D-pad Up toggles `hsd_804D0F90.alloc_data`, `hsd_804D0F60.alloc_data`, and `HSD_PSAppSrt_804D10B0` together. An enabling branch copies each allocator's own recorded peak into its numeric limit, enables that limit, and sets the corresponding latch. A disabling branch disables enforcement and clears the latch. These are two independent `if` statements: both groups can toggle during one call. Outside DEVELOP mode, existing latch and allocator states are left unchanged, not automatically disabled.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dballoc.c#L7-L62.

## Helper semantics and lifetime
The inline helpers read `peak`, write `num_limit`, and set or clear `num_limit_flag`; disabling does not erase the stored ceiling. They contain non-null assertions. The unused local `peak` in the update function has no source-level role. Limits are sampled on activation, not continuously refreshed.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.h#L47-L70.

`db_Setup` calls limiter setup within its DebugRom-or-higher initialization path. Debug button accessors index the current and pressed states using the supplied selector. `db_RunEveryFrame` calculates pressed edges and invokes the update for selectors 0 through 3; the limiter latches themselves are shared, not per-player. Consequently, separate eligible controller calls can toggle the same latch repeatedly in a frame. The caller refreshes only two controller states when a Master Hand or Crazy Hand is present but still dispatches the limiter across four selectors; this review does not establish that the other states must be zero. Resetting software latches independently of allocator configuration can make them cease to mirror actual enforcement state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L63-L107 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L235.

## Semantic and rendered-name assessment
The entire canonical and rendered owned file was independently reviewed. The rendered view reports zero substitutions and zero parse errors; function names remain unchanged and fit their bodies. Existing setup, update, and translation-unit explanations are retained without equivalent-wording rewrites. The proposed flag name is appropriate for the source object, but its attachment to a compiled section remains unresolved. The parameter subject has no baseline facts; its source signature and selector use are already covered by retained function knowledge.

## Section evidence and limits
The source establishes a static `UnkFlagStruct` and its latch behavior. It does not independently connect that object to `.sbss`, or connect helper diagnostics to `.data` and `.sdata`. Header assertions support a diagnostic-origin hypothesis, not exact emitted strings, section membership, byte extents, or alignment. Historical descriptions and saved-object observations cannot establish equivalence to the pinned revision without provenance and symbol/relocation evidence. All nine section-target facts and the `.sbss` implementation link are therefore explicitly unresolved rather than retained as proved. No compiled-layout replacement facts are proposed. Supported source-level latch and helper conclusions are preserved here and in the retained function and unit knowledge.

Status: synthesized; independent review and live promotion pending.
