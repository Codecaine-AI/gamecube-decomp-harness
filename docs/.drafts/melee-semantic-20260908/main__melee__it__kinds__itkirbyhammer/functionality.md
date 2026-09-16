## Kirby Hammer article

This unit implements the fighter-owned Hammer prop used by Kirby's grounded and aerial side special, not the collectible Hammer item. Its header declares five public functions and the state table.

### Construction and effects
`it_802ADC54` builds an `It_Kind_Kirby_Hammer` spawn request. The supplied position becomes `prev_pos`; a separate helper derives `pos` from the parent. Facing is copied, damage and velocity are zeroed, both parent fields receive the parent, `x44_flag.b0` is set, and `x40` is zero. Creation failure returns NULL without Hammer-specific setup. On success, the local helper stores `vars`, performs developer-display and parent/part setup, obtains an attachment JObj, and queues particle 1177 when the stored value equals 1 or 1176 for every other value. This is an equality test, not a boolean validation. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itkirbyhammer.c#L30-L73).

### State and lifetime
The one-record `ItemStateTable` contains `{0, NULL, NULL, NULL}`. Pickup unconditionally requests index 0 with `ITEM_ANIM_UPDATE`; the null callbacks do not imply that generic animation or attachment processing is absent. `it_802ADC34` unconditionally delegates destruction to `Item_8026A8EC`. The separate Destroyed callback does nothing without an owner and otherwise invokes Kirby's reference-clearing helper. `it_802ADDB0` forwards both object pointers unchanged to `it_8026B894`, without local state logic. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itkirbyhammer.c#L11-L83).

The fighter accessory callback supplies `ground_or_air` as the variant and `FtPart_R3rdNa` as the attachment part, stores the nullable result in `u.kb.hat.x0`, and also copies it to `x1984_heldItemSpec`. The destruction notification clears `u.kb.hat.x0`; it does not itself clear that second field. Fighter-side cleanup separately destroys and clears the tracked article. Both side-special entry points install this accessory callback. [Lifetime evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecials.c#L31-L122). Generic destruction preserves owner/flag-dependent cleanup branches, clears ownership, releases dynamic-bone state and queued effects, and unlinks the GObj. [Teardown evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1942-L1980).

### Semantic review
The existing `itKirbyHammer_Spawn`, `itKirbyHammer_Destroy`, and conservative `itKirbyHammer_Logic8_EvtUnk` hypotheses remain useful; no equivalent renaming is proposed. One fact needs its obsolete fighter field path corrected. Compiled `.sdata2` placement, size and padding claims remain unresolved, rather than being inferred from the inline floating literal. The rendered C view is readable; the header reports `shadowed_binding` for the constructor and leaves its original name visible.

Status: synthesized; independent review and live promotion pending.
