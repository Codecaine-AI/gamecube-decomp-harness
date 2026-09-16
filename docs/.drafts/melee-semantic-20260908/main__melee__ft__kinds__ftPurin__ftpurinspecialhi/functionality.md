## Purin SpecialHi / Sing

The implementation provides grounded and airborne entry, animation, IASA, physics and collision callbacks, two situation-conversion helpers, and an accessory-callback clearing helper. The header declares all 13 public functions. Both owned files were read completely in canonical and rendered form by the inherited research; the lead independently inspected the targeted implementation and contradiction evidence. Rendered substitutions are hypotheses rather than independent evidence.

### Entry and move-local state
`facing_dir == -1` selects entry ID 365 on ground and 366 in air; every other facing value selects 367 and 368 respectively. Entry calls `Fighter_ChangeMotionState` with zero flags, frame 0, rate 1 and zero blend, then calls `ftAnim_8006EBA4`. Shared initialization clears `cmd_vars[0]`, installs `ftPr_Init_8013C94C` in `accessory4_cb`, and assigns `mv.pr.specialhi.x0` from the short-circuited conjunction of `gm_8016B1D8()` and `grStadium_801D4FF8(player_id)`. The second predicate is not called when the first fails. Numeric entry IDs remain literal rather than silently equated with the enum destinations used by terrain conversions. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspecialhi.c#L23-L65)

### Animation and completion
Both animation callbacks modify hit capsule 0 only when the move-local flag is nonzero, `x43_b2` is clear, and the capsule is not disabled. They set the marker and assign `HitElement_Sleep`. This guarded conversion does not prove a single-hit move or unconditional sleep activation; another writer can reset the marker. Independently, animation exhaustion calls `ft_8008A2BC` on ground or `ftCo_Fall_Enter` in air. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspecialhi.c#L67-L95)

The inherited completion-helper review establishes that ground completion normally reaches Wait, but is not an unconditional Wait setter. The helper has special fighter-kind dispatch; its ordinary path checks DownSpot and another common handling predicate before entering Wait and can perform conditional post-Wait processing. [Completion implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109)

### IASA and physics
Both IASA bodies are empty: they neither inspect input nor initiate transitions. This establishes absence of interruption through these callbacks, not global immunity to interruption. Ground physics delegates to `ft_80084F3C`; air physics delegates to `ft_80084EEC`. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspecialhi.c#L97-L109)

The physics implementations apply ordinary gravity/terminal velocity and aerial friction in air. Ground processing conditionally multiplies ground friction when absolute ground velocity exceeds walk maximum, then applies friction and ground movement. The multiplier's runtime value was not established, so multiplication is confirmed but an increase is not. Neither wrapper nor these delegated bodies supplies special-move lift or directional acceleration. [Physics implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L53)

### Collision and continuation
Ground collision invokes `ftPr_SpecialHi_8013CD34` when `ft_800827A0` fails. Air collision first tests `ft_CheckGroundAndLedge(gobj, 0)` and, on success, calls `ftPr_SpecialHi_8013CDD8` and returns. Otherwise it calls the common cliff handler; there is no additional fallback operation in this callback. Both conversion helpers choose corresponding left/right enum destinations using the exact `-1` facing guard, pass `cur_anim_frame`, rate 1, zero blend and mask `0x0C4C508A`, and reinstall the accessory callback. They do not explicitly rerun entry initialization. Mask-wide preservation guarantees are not inferred from the numeric mask. [Collision and conversions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspecialhi.c#L111-L161)

### Cross-file accessory lifetime
Entry and situation conversions arm `ftPr_Init_8013C94C`. The inherited cross-file review establishes that it conditionally spawns effect 1238 at WaistN when `x2219_b0` is clear, sets that flag, installs effect hitlag callbacks, and clears `accessory4_cb` on every invocation. Reinstallation therefore does not itself guarantee a fresh effect spawn. [Accessory implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurin.c#L620-L631)

`ftPr_SpecialHi_8013CE7C` clears the slot unconditionally, including when already null. It does not directly destroy effects, clear their existence flag, or change motion state. Its complete caller lifecycle was not established. [Cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/ftpurinspecialhi.c#L163-L167)

### Review outcome
The inherited dispositions cover all 75 baseline facts and 31 links: 65 facts retained, 10 unresolved, and all 31 links retained. Historical duplicate links remain separately accounted for. The lead accepts all ten deferrals without overrides. The empty proposal agrees with this bounded functionality document. The three local descriptive name hypotheses are supported by canonical operations but are not recovered original identifiers. No compiled pool layout, section size, instruction count, or ABI register assignment is asserted from source alone.

Status: synthesized; independent review and live promotion pending.
