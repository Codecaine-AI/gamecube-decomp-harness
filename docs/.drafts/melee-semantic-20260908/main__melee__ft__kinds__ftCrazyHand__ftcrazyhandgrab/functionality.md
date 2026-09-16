## Crazy Hand Grab

The complete unit contains five `void(HSD_GObj*)` functions, including the empty collision callback at line 42. The header declares all five. Baseline statements that the file ends after physics are incorrect.

- `ftCh_Init_80159F40` unconditionally calls `Fighter_ChangeMotionState(gobj, ftMh_MS_Grab, 0, 0.0f, 1.0f, 0.0f, NULL)`, then `ftAnim_8006EBA4` on the same object.
- `ftCh_Grab_Anim` calls `ftCh_Init_8015A030` only when `ftAnim_IsFramesRemaining` returns zero; otherwise it performs no transition. The canonical continuation in `ftcrazyhandcancel.c` enters numeric state `0x177`, invokes animation setup, changes position, and clears all self-velocity components. Thus the handoff has cross-file effects rather than merely returning to idle. The Cancel filename and callback names provide context; the numeric state is preserved without assuming a character-independent enum mapping.
- `ftCh_Grab_IASA` obtains the Fighter and queries its player-slot kind. Human slots invoke `ftBossLib_8015BD20`, whose canonical body immediately returns. Other slot kinds skip that hook, but still execute the slot-kind query. No capture, damage, or effective interrupt is implemented here.
- `ftCh_Grab_Phys` delegates to `ft_80085134`. Its canonical body sets `self_vel.x = x6A4_transNOffset.z * facing_dir` and `self_vel.y = x6A4_transNOffset.y`; it does not write the z component.
- `ftCh_Grab_Coll` is empty. This proves absence of processing in this callback, not absence of attack hitboxes throughout the action.

The object is forwarded through these calls without local allocation, storage of a persistent object pointer, or destruction. Entry and continuation can mutate fighter state through external routines. Source literals establish the transition arguments but do not establish a compiled `.sdata2` pool's size, ordering, or ownership. Rendered helper names were treated as hypotheses, with the boss hook, continuation, and physics helper checked in canonical source. Associations with a disabled cooperative grab or no-knockback crush remain unverified by this unit.

Status: synthesized; independent review and live promotion pending.
