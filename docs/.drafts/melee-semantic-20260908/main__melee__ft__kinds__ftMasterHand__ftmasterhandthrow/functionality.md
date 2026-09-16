## Master Hand Throw callbacks and Slam entry

The owned C file defines four `void(HSD_GObj*)` routines; the header declares all four. Canonical and rendered views were read completely. Rendered names were treated as hypotheses, not evidence.

- `ftMh_Throw_IASA` extracts the Fighter and calls `ftBossLib_8015BD20` only when `Player_GetPlayerSlotType(fp->player_id) == 0`. The player-kind enum identifies zero as Human. The boss hook currently returns immediately; its rendered CrazyHand-specific name is not established by this implementation.
- `ftMh_Throw_Phys` unconditionally forwards its object to `ft_80085134`. That helper replaces `self_vel.x` with `x6A4_transNOffset.z * facing_dir` and `self_vel.y` with `x6A4_transNOffset.y`, leaving Z velocity untouched.
- `ftMh_Throw_Coll` is completely empty and does not dereference its argument.
- `ftMh_MS_379_80155014` extracts the Fighter, calls `Fighter_ChangeMotionState(gobj, ftMh_MS_Slam, 0, 0, 1, 0, 0)`, calls `ftAnim_8006EBA4`, then clears `cmd_vars[0]`. This independently supports the speculative name `ftMh_Slam_Enter`; the number embedded in the original symbol is not treated as proof of a numeric state identity.

### Cross-file lifetime

Squeeze animation completion calls this entry routine whenever `u.mh.x2250` is not `ftMh_MS_Throw`; this is an else branch, not an explicit Slam-selector equality test. The entry-time command reset prepares the event consumed by `ftMh_Slam_Anim`. On a nonzero command value, that callback clears the slot and calls `ftMh_CaptureWaitMasterHand_80155D6C` with `victim_gobj` before checking whether the victim remains non-null. Only the subsequent common throw/thrown calls are guarded. It also clears `mv.mh.unk0.x20`. Animation completion is checked independently and can trigger the wait continuation in the same invocation. The owned entry routine neither assigns nor clears the victim pointer.

### Evidence limits

The source establishes callback behavior and symbolic Slam entry, not compiled `.sdata2` contents, size, placement, or literal relocations. No compiled artifacts were supplied. External move labels such as Reverse Throw and Vertical Throw, debug/test intent, and the precise animation-script producer of the command event remain unverified. The renderer reported no parse failures, but its helper-name substitutions do not establish those helpers' semantics.

Status: synthesized; independent review and live promotion pending.
