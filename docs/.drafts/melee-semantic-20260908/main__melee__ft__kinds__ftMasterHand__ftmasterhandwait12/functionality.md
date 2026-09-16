## Master Hand destination-driven wait behavior

The unit provides seven public routines, with matching declarations in the header. Its entry helpers select continuation wait motions, while setup stores a destination and optional callback for later physics and completion processing.

### Entry and routing
- `ftMh_MS_389_80150C8C` always enters Wait1_2. It preserves `cur_anim_frame` only when `u.mh.x2258` is Wait1_0 or Wait1_2; otherwise it starts at frame zero and calls `ftAnim_8006EBA4`. It finally records Wait1_2.
- `ftMh_MS_389_80150D28` does the analogous operation for Wait2_1, preserving frames for Wait2_0 or Wait2_1.
- `ftMh_MS_389_80150DC4` is deliberately asymmetric: only an incoming Wait2_0 marker selects Wait2_1. Every other marker, including Wait2_1, selects Wait1_2. The nested Wait2 guard contains a source-level fallback that cannot be reached after the outer equality test under ordinary execution; that branch is not evidence of an additional reachable route. The routine then stores `cb` in `mv.mh.unk0.x4` and copies `*pos` into `xC`. It retains the vector value, not the caller's pointer, and does not explicitly initialize `x18`.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L19-L80.

### Animation, movement, and completion
`ftMh_Wait1_2_Anim` does nothing while frames remain; exhaustion records and restarts Wait1_2 at frame zero, then calls `ftAnim_8006EBA4`. This is a same-state restart, not completion of the destination movement.

`ftMh_Wait1_2_Phys` calls `ft_80085134` before `ftBossLib_8015BE40`. Canonical helper bodies show that the first assigns animation-translation-derived XY self-velocity and the second overwrites XY with destination-derived movement. The second receives destination `xC`, output `x18`, threshold `da->x2C`, and scale `da->x28`. Below the strict distance threshold it writes zero to `x18` and leaves the displacement unscaled; otherwise it writes measured distance and scales normalized displacement by distance times `x28`. Only XY velocity is assigned by this helper, although its vector calculations include Z. Thus `x18` is a floating distance/arrival result, not a countdown.

`ftMh_Wait1_2_Coll` does nothing for nonzero `x18`. At zero it clears all three self-velocity components and invokes `x4(gobj)` if non-null. It performs no collision query, does not clear the callback or status, and does not directly change motion state. Repeated invocations can repeat callback dispatch unless the continuation changes the relevant state or storage. The zero test denotes the movement helper's completion signal, not an independently checked exact-position equality.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L82-L113; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L57-L80.

### Default return and cross-file lifetime
`ftMh_MS_389_80151018` clears `x20`, constructs a destination from `x30_pos2.x/y` with Z zero, and assigns the tracked marker Wait2_1 before testing it against Wait2_0. Consequently it takes the Wait1 entry branch and starts Wait1_2 fresh. The alternative Wait2 helper call remains present in source but is not the ordinary reachable outcome of this sequence. It installs `ftMh_MS_341_8014FFDC` as the continuation.

The continuation in wait10 restores Wait1_0 with animation-frame continuity when the marker is Wait1_2. It also restores or captures `u.mh.x2240_pos` depending on the actual motion ID before transition. Current BackAirplane3 and BackPunch animation-completion paths call the default initializer. Other wait10 paths use the generic setup to copy attack-specific destinations and queue individual or coordinated-action callbacks. Not every attack or combination switch case invokes this setup.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait12.c#L115-L138; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L84-L119; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L222-L311; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackairplane3.c#L13-L56.

### Evidence boundaries
Both canonical and rendered owned files were read completely. The proposed entry names are plausible descriptive hypotheses supported by canonical bodies, not recovered original names. Rendered external helper names were not used as proof of behavior. Symbol suffixes containing numeric state labels were not equated with current motion IDs. Source constants establish zero/one uses but do not establish `.sdata2` contents, pooling, size, or layout; no compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
