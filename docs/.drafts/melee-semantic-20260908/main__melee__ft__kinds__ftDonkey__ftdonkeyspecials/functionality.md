# Donkey Kong SpecialS translation unit

## Scope and retained knowledge
The owned implementation and header provide ten public void(HSD_GObj*) functions and two internal transition helpers. The preceding static declaration gives doAirTransition internal linkage; doGroundTransition is explicitly static. Supported existing canonical names, signatures, no-op IASA behavior, local initialization, callback registration, and completion-pattern knowledge are retained. The active table registers the paired callbacks under SpecialS and SpecialAirS with FtMoveId_SpecialS. Source-level gobj parameters do not establish the twelve #r3 subjects' compiled register identities. No allocation, destruction, or ownership transfer is implemented locally.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyspecials.h#L1-L18; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyspecials.c#L21-L126; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkey.c#L459-L480.

## Entry and effects
Ground entry selects ftDk_MS_SpecialS with flags 0, start 0, rate 1, blend 0, and NULL, calls ftAnim_8006EBA4, clears cmd_vars[0], and assigns ftDk_SpecialLw_8010E0CC to accessory4_cb. It makes no explicit velocity write. Air entry first divides self_vel.x by SpecialS.x3C_MIN_STICK_X_MOMENTUM and overwrites self_vel.y with zero, then performs analogous initialization for ftDk_MS_SpecialAirS with ftDk_SpecialLw_8010E148 as accessory callback. The division has no validation and is not a stick comparison or necessarily attenuation. Numeric tuning and exceptional floating-point behavior remain unproved.

The deferred callbacks conditionally spawn effects 1222/1223 on FtPart_TransN when x2219_b0 is clear, set that flag, install effect hitlag callbacks, and unconditionally clear accessory4_cb. An already-set flag suppresses spawning, not callback installation or self-clearing. One-shot callback execution does not establish effect looping, duration, cleanup, invocation timing, or cancellation behavior.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyspecials.c#L26-L46; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L207-L211; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyspeciallw.c#L164-L184.

## Animation and physics
False ftAnim_IsFramesRemaining results dispatch grounded completion through ft_8008A2BC and aerial completion through ftCo_Fall_Enter. Both IASA bodies are empty, not proof of global uninterruptibility. Grounded completion normally reaches Wait, but common early exceptional branches and subsequent conditional handling prevent an unconditional Wait guarantee. Numeric frame boundaries and the precise animation-helper operation remain deferred.

Ground physics delegates to ft_80084F3C, which multiplies ground friction by a common factor only when ABS(gr_vel) > walk_max_vel, then applies ground friction and movement. Neither equality nor an unproved factor value supports an unconditional increase claim.

Air physics invokes ftCommon_Fall only for nonzero cmd_vars[0], using SpecialS gravity and common terminal velocity. Fall subtracts gravity and clamps only results strictly below minus terminal velocity. Air friction is unconditional and writes x74_anim_vel.x, not self_vel.x: ABS(friction) >= ABS(self_vel.x) selects -self_vel.x; otherwise self_vel.x > 0 negates the supplied friction, and a false comparison leaves it unchanged. This includes the false-comparison path for exceptional values. No unconditional finite-bound or damping invariant follows. The repeated trailing command test is empty; the callback neither writes the command variable nor changes motion state. Activation timing and later animation-velocity integration remain open.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyspecials.c#L48-L85; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L109; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L42-L53; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L253-L261; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L462-L468.

## Collision and continuation
Ground collision chooses ft_800827A0 for nonzero cmd_vars[0], otherwise ft_80082708; a false result invokes doAirTransition. Air collision invokes doGroundTransition on nonzero ft_80081D0C. The wrappers synchronize collision positions and copy corrected positions back; they are not pure tests. GroundOrAir return spellings and rendered collision aliases do not establish exact contact meanings, and ft_80081D0C includes an exceptional ft_80081A00 return path.

Both conversions change situation and pass cur_anim_frame, rate 1, blend 0, NULL, and coll_mf into the opposite SpecialS motion. They do not call local entry functions and restore effect hitlag callbacks only when x2219_b0 == true. coll_mf combines KeepGfx, SkipHit, SkipMatAnim, SkipColAnim, UpdateCmd, SkipItemVis, Unk19, SkipModelPartVis, SkipModelFlags, and Unk27. Full preservation semantics are not established from names. Situation conversion also changes movement/jump/ECB state; grounding includes conditional bookkeeping and a support assertion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftDonkey/ftdonkeyspecials.c#L89-L126; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L424; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/inlines.h#L71-L89; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L594.

## Evidence limits
Rendered ftAnim_Advance, CreateLoopGFX, and collision aliases remain hypotheses rather than independent proof. The ground-friction-and-movement interpretation is supported by its canonical callee. Canonical table evidence establishes SpecialS membership, not independently the external Headbutt name or bury, meteor, and shield-damage properties. No local hit-property implementation is present. The .sdata2 subject has no explicit source declaration; visible constants do not prove emitted contents, placement, size, order, or relocations. Compiled section/ABI claims and the physics TODO's compiled significance remain deferred.

Status: synthesized; independent review and live promotion pending.
