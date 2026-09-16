## Link aerial-attack unit

The header declares the three public `void(HSD_GObj*)` entry points; the implementation additionally defines the two down-aerial callbacks and an indexed capsule helper. Full owned-file coverage is inherited from research; this lead independently checked the proposed facts and contradiction evidence against canonical source.

### Shield setup and model selection
`ftLk_AttackAir_800EB3BC` tests whether `x5F4_arr[2].prev == 0`, then passes the attribute at `xC4`, cast to `ShieldDesc*`, and `ftLk_800EB334` to `ftColl_8007B1B8`. It subsequently sets `x221B_b3`, `x221B_b4`, and `x221B_b2`. The guard is numeric model selection, not a null collision-list pointer or proof of an inactive collision object. Parts helpers write integer selections to `prev` and copy them to `idx`. Neither this initializer nor its collision callee changes the guard field, so repeated eligible calls can repeat setup. The callee stores the shield callback, joint, radius, and offset and resets shield flags before the caller sets its three flags. [Local setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/ftlinkattackair.c#L21-L32); [model selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L598); [shield callee](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3174-L3187).

`ftLk_AttackAir_SetupParts` unconditionally calls both parts helpers with `(2, 0)`. Remembered selection becomes zero and model state is marked dirty; active selection changes only if necessary. The latter operation requests visibility-set reset, whose implementation has lookup/cleared guards. Group 2's visual asset remains unidentified. [Calls](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/ftlinkattackair.c#L89-L93); [helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L555-L669).

### Aerial entry and hit response
Common dispatch routes Link and Young Link through `ftLk_AttackAir_Enter`. The common selector can use either C-stick or left-stick input. After common entry, only AttackAirLw receives `lwOnHit` in `deal_dmg_cb`, `lwOnAnim` in `anim_cb`, and a zero move-local countdown. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/ftlinkattackair.c#L34-L43); [dispatch and selection](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackAir.c#L74-L132).

`lwOnHit` invokes all-capsule collision cleanup, assigns configured vertical velocity, clears fast-fall, and stores the configured hit-animation start value as countdown. It computes `frame_len = end - start`; only when the current frame is strictly greater does it restart AttackAirLw at `frame_len`, with `Ft_MF_None` and playback rate 1. Equality does not restart. Reviewed numeric attributes do not establish velocity sign or start/end ordering. [Hit response](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/ftlinkattackair.c#L45-L60).

### Countdown, capsule updates, and lifetime
`lwOnAnim` subtracts `frame_speed_mul` only from a previously positive countdown. It updates capsule indices 0, 1, and 2 only if the result is nonpositive and the animation frame is strictly before the configured end. There is no clamping, retry of a missed end-window crossing, or guaranteed progress at zero/negative speed. Common aerial animation always runs afterward and can reverse facing or enter Fall. [Countdown](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/ftlinkattackair.c#L62-L87); [common animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_AttackAir.c#L135-L144).

The indexed helper calls `ftColl_8007B064` and then `ftColl_8007ABD0`. Canonical callee evidence shows `attackairlw_anim_flags[idx]` is numeric damage input, with scaling and attack-instance processing—not demonstrated bitmask semantics. Weaker post-bounce damage remains unverified. [Damage consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2987-L3003); [capsule helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3117-L3135).

The hit callback's restart branch does not locally reinstall custom callbacks. Engine code contains motion-state callback replacement and clearing of `deal_dmg_cb` and `shield_hit_cb`; callback survival must not be assumed. Full enclosing conditions, move-local-state lifetime, and motion-table behavior remain a family follow-up. [Engine reset block](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1370-L1390).

### Evidence limits
Rendered names are hypotheses, not independent proof. No supplied compiled evidence establishes `.sdata2` size, ordering, contiguity, or section-to-mechanic attribution. Historical duplicate mechanic links remain independently accounted for without merges.

Status: synthesized; independent review and live promotion pending.
