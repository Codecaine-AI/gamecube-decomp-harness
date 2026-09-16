## Motion-Sensor Bomb lifecycle

The translation unit defines a 24-byte special-attribute structure and an eight-row state table. State IDs and animation-resource indices are distinct: states 0–7 use resource indices `-1, -1, -1, 1, 0, 0, 2, -1`, respectively. The header declares the public callbacks and table consistently with the implementation.

- **States 0/1: unarmed rest and fall.** Spawn clears the bomb-specific history bit, sets shared field `xD0C` to 2, and enters state 1. Airborne entry applies special attribute `x0` as root-model X rotation. State-1 physics delegates configured acceleration and maximum-speed threshold to `it_80272860`; that helper conditionally subtracts acceleration and does not clamp afterward. Validated landing selects state 0. Loss of support returns to state 1.
- **State 2: held.** Pickup unconditionally selects state 2, whose table row has no per-frame callbacks.
- **State 3: thrown deployment.** Drop delegates to throw. Throw selects state 3 with transition argument 6, copies the special ECB into `Item.xBFC` and a local helper input, and clears `xDCE_flag.b7`. Falling physics and terrain collision lead toward attachment.
- **States 4/5: armed attachment and detached falling.** State-4 entry uses `ITEM_ANIM_UPDATE` initially and `0x11` after the history bit has been set. Shared setup resets velocity, installs `it_802908D8` in `Item.touched`, updates interaction/hitbox state, and sets the history bit. State 4 sets ground classification; state 5 sets air classification, retains armed setup, and clears the attachment-related flag. Valid support is maintained; invalid support is cleared to -1 and selects state 5. Subsequent terrain contact can re-enter state 4.
- **Surface placement.** `it_80290238` sets `xDCE_flag.b3`. Floor contact skips positional offsets. Otherwise ceiling contact adds `scl * (top - bottom)` to Y; wall query results 8 and 4 add and subtract attribute `x4` from X. The final call plays SFX 243 with pan 127 and volume 64—it is not color configuration.
- **State 6: detonation.** The external dispatch path additionally requires the caller's collision flag, then locally requires clear `x13` and state 4 or 5. Damage-received checks states 4/5 but not `x13`. The installed touched callback has no local guard. All accepted paths select state 6 and run setup. Setup hides the model, initializes shared lifetime processing, supplies packed attack bookkeeping `0x440061`, records owner-related attack information, and invokes positional and explosion-related helpers. The positional helper stores 120 in a count field, not an effect-ID field. State-6 animation processing decrements `xD44_lifeTimer` and returns true at zero or below; it does not test visual animation completion.
- **State 7: entered-air recovery.** EnteredAir selects a collision-only state. Its shared terrain helper invokes the airborne destination immediately on loss of floor, but the supported destination remains conditional on `x1F`/`xD5C` processing.

## Interaction and lifetime distinctions

Damage-dealt and HitShield apply victim rebound and collision resets only in state 3. ShieldBounced uses the distinct shield-rebound helper, also only in state 3. Clanked performs its three-call rebound sequence unconditionally. Reflection delegates planar velocity reversal/scaling, facing reversal, and lifetime refresh. EvtUnk forwards both objects to shared reference cleanup, which independently clears matching owner/interaction references and sets source-player sentinel 6 when the primary fighter reference matches; its owner-match Boolean is discarded.

## Semantic review

Most existing names and explanations remain supported and are explicitly retained in the checkpoint ledger. The state-1 and state-5 proposed `itMsbomb_Fall_Coll` names collide in both rendered files. Retaining the state-1 name and naming state 5 `itMsbomb_ArmedFall_Coll` distinguishes unarmed landing from armed reattachment. Corrections also address audio-versus-color confusion, state-ID-versus-ordinal wording, threshold-versus-clamp behavior, packed attack data, positional count arguments, and timer-driven explosion completion.

Canonical anchors: [state table and initial lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmsbomb.c#L18-L122), [attachment and detonation setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmsbomb.c#L124-L236), [interaction callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmsbomb.c#L238-L330), [audio helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L2071-L2081), [lifetime helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1429-L1450).

No compiled section extent, literal-pool layout, or assertion-string placement is established by this source review.

Status: synthesized; independent review and live promotion pending.
