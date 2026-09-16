## Mewtwo Confusion lifecycle

This unit implements grounded and aerial Confusion entry, victim processing, physics, terrain continuation, and reflector control. The header declares the fourteen externally visible callbacks; SetFlags and four setup/processing helpers remain file-local.

### Entry and capture
Both entries clear throw_flags, cmd_vars[0..1], and the move-local reflection latch, select their respective motion state with arguments 0.0f, 1.0f, 0.0f, initialize animation, configure grabbing, and install ReflectThink in accessory4_cb. Aerial entry additionally assigns the configured air boost to vertical velocity only when the persistent boost-used flag is false, then sets that flag. This is an assignment, not an additive impulse. Neither entry resets that persistent guard.

Grab setup registers SetFlags and the ground- or air-specific capture callback only when victim_gobj is null; otherwise it applies the 0x1FF common mask operation. SetFlags calls the common mask/reset helpers, clears x221E_b6, and sets x2222_b2. The two animation callbacks process cmd_vars[0] only when nonzero and a victim exists: they apply mask 0, call ftCo_800DE2A8 and ftCo_80090780, then clear the command. A missing victim leaves the request pending. Independently, animation completion dispatches to ft_8008A2BC on ground or ftCo_Fall_Enter in air. Both IASA callbacks are no-ops.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/ftmewtwospecials.c#L43-L178.

### Movement and terrain continuity
Ground physics calls ft_80084F3C; air physics calls ft_80084EEC. Both subsequently call ftColl_8007AEF8. Canonical movement-helper source establishes grounded friction and movement, including a friction multiplier above walking speed, versus gravity/terminal-velocity and aerial-friction processing. The numeric multiplier itself is not established here.

Collision wrappers delegate to common helpers with the corresponding terrain continuation. Ground-to-air changes to SpecialAirS using preservation flags, clamps air drift, and reinstalls grab/accessory processing. Air-to-ground changes to SpecialS, reinstalls processing, and clears the persistent boost guard. Both restore generic reflection bits and the hit callback only if the move-local reflection latch is already active; neither unconditionally opens a new reflector window. Ground-to-air does not award the aerial-entry boost.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/ftmewtwospecials.c#L180-L256 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L53.

### Reflection protocol and limitations
cmd_vars[1] uses 0 for waiting, 1 for ON, and 2 for OFF. ON creates the reflector from Confusion attributes, supplies the no-op OnReflect callback, sets x2218_b4 and the active latch, and acknowledges the command with 0. OFF clears generic reflection state, x2218_b4, the callback, and the active latch only when the latch was active, but acknowledges the command even when inactive. Other numeric values are untouched. ON has no already-active guard.

The canonical comment associates x2218_b4 with Confusion's lack of projectile-ownership transfer; this pass does not independently establish the downstream projectile consumer. Rendered helper aliases are hypotheses, not proof of their semantics. Source literals cannot establish .sdata2 contents, size, layout, or compiled loads; its three baseline facts remain unresolved.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/ftmewtwospecials.c#L24-L39 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMewtwo/ftmewtwospecials.c#L260-L295.

Status: synthesized; independent review and live promotion pending.
