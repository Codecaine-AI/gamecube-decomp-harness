## Mato target item

The canonical registry identifies this module as Target (Mato). Its single `ItemStateTable` row uses animation index `-1` and the state-0 animation, physics and collision callbacks. This is a source-level table description, not a compiled section-layout claim.

`it_802D84F8` performs shared initialization through `it_8027B730`, clears facing, `xD5C` and `xDCC_flag.b3`, then calls `it_802D8554`. That helper clears only velocity X and Y and selects state index 0 with `ITEM_ANIM_UPDATE`. State index 0 and animation index -1 are distinct values; neither warrants inventing an animation identity.

Animation and collision ignore their arguments and always return false. Physics checks the optional saved anchor: when non-null, it calls `lb_8000B1CC(anchor, NULL, &pos)` and replaces the complete item position; when null, it leaves position unchanged. It performs no local velocity integration or state transition. Shared initialization clears the stage-actor joint slot, but this module neither supplies a later attachment nor establishes ownership or lifetime of the referenced joint.

`it_802D85F4` ignores its item argument, calls `Ground_801C4338`, and returns true. The ground routine decrements `stage_info.x6D4` and sets flag `0x20` only when the resulting count equals zero. It has no pre-decrement guard or duplicate-notification protection. The registry places this callback separately from the destroyed callback, so it should not be renamed simply as a destruction handler.

## Semantic review

The existing explanations largely fit the canonical implementation. Retain the state-entry name `itMato_UnkMotion0_SetStatus`. Replace the initializer's unsupported `Logic10` qualifier with the role-only inferred name `itMato_Spawned`; initialization behavior supports Spawned, while another item's numeric naming convention does not establish Mato's number.

Both owned files were read completely in canonical and rendered form. Rendered declarations agree with rendered definitions, with no parse or substitution failures. Rendered helper names were treated as hypotheses rather than independent evidence. The three `.sdata2` facts remain unresolved because source zero expressions cannot establish constant-pool size, bytes or placement.

Status: synthesized; independent review and live promotion pending.
