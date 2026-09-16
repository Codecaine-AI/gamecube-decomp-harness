## BackCrush implementation

The owned C file implements a Master Hand state-entry routine and animation, IASA, physics, and empty collision callbacks. The header declares all five functions; its collision symbol remains `ftMh_BackPunch_Coll`. Neither that spelling nor the numeric suffixes on entry routines are treated as proof of dispatch-table membership or numeric state identity.

### Entry and persistent working state

`ftMh_MS_370_80153D2C` selects `ftMh_MS_BackCrush`, calls `ftAnim_8006EBA4`, and obtains a position through `ftBossLib_8015C208`. It explicitly assigns only current X and Y: X from the returned position, Y from attribute `x70`. It clears all three self-velocity components, initializes movement counter `mv.mh.unk0.x0` from attribute `x74`, and initializes scale counter `mv.mh.unk0.x70` from attribute `x7C`.

The entry saves the existing three-axis JObj scale in `x64`, computes each component of `x58` as `(saved scale - attribute x78) / attribute x7C`, assigns a uniform scale of attribute `x78`, and enables scale updates through `cmd_vars[0]`. The source does not guarantee this is a reduction, and it contains no zero-divisor guard. These are fighter-resident values consumed by subsequent callbacks, not local temporaries surviving by accident. [Entry and consumers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush0.c#L23-L119).

### Animation and completion

While `cmd_vars[0]` is nonzero, animation pre-decrements the scale counter. A negative result clears the flag and restores the saved scale exactly; otherwise it adds the stored delta to the current scale. Consequently a result of zero still takes the incremental branch. Separately, animation exhaustion clears horizontal self-velocity and calls `ftMh_MS_389_80151018`. The completion test does not wait for scale recovery to finish. [Animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush0.c#L70-L96).

The current completion callee configures a wait destination from `x30_pos2`, selects `ftMh_MS_Wait2_1`, invokes wait setup, and installs `ftMh_MS_341_8014FFDC` as the move callback. This establishes a cross-file wait handoff, not the baseline link's asserted direct BackDisappear-to-Grab continuation. No scale-restoration guarantee across that handoff was established. [Wait setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L115-L138).

### IASA, physics, and collision

IASA forwards the object to `ftBossLib_8015BD20` only for player-slot type zero. The enum independently identifies zero as Human, and the pinned callee is an empty return: this is a human-gated hook, not implemented boss-input processing. [IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush0.c#L98-L104), [slot enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L11-L17), [empty hook](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34).

Physics pre-decrements the movement counter and calls `ftBossLib_8015BF74(gobj, da->x58)` only while the result is positive; otherwise it clears horizontal self-velocity. It always calls `ftBossLib_8015C190`. The former helper adds a target-relative horizontal increment, bounded by the supplied parameter under its explicit comparison; it does not assign a constant movement speed. The latter clamps X to floor 0's endpoints and clears X velocity when outside. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush0.c#L106-L119), [movement helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L82-L98), [bounds helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L128-L144).

`ftMh_BackPunch_Coll` is entirely empty. [Definition](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackcrush0.c#L15-L15).

### Evidence limits

Both owned canonical and rendered files were read completely, and every frozen subject and link page was enumerated. The renderer reported no parse errors; its four C-file substitutions were treated as hypotheses rather than evidence. No compiled artifacts were supplied, so section placement, literal-pool contents, and emitted storage types remain unresolved. Flying Slap and grab-sequence mappings remain provisional: configurable scale and position mechanics alone do not independently establish the player-facing attack. The authored callbacks contain no direct victim-damage operation, but that does not exclude effects in animation scripts or other systems.

Status: synthesized; independent review and live promotion pending.
