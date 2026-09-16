## Paired Master Hand Squeezing entries

`ftMh_MS_375_80154C78` and `ftMh_MS_378_80154CF8` are branchless `void(HSD_GObj*)` initializers. Both obtain the Fighter and its special attributes, change motion state with arguments `(gobj, state, 0, 0, 1, 0, 0)`, call `ftAnim_8006EBA4`, and then initialize `fp->mv.mh.unk0.xC`. The first selects `ftMh_MS_Squeezing0` and copies `x118_pos.x/y`; the second selects `ftMh_MS_Squeezing1` and copies `x30_pos2.x/y`. Both explicitly clear z. Neither validates the object, applies damage, performs a throw, or initializes the success flag. [Definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait11.c#L9-L29). The header supplies matching declarations and no additional behavior. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait11.h#L1-L10).

## Cross-file lifetime and exceptional path

Grab initialization clears `mv.mh.unk0.x20`. Grab animation completion clears all self-velocity components and invokes the Squeezing1 entry. The successful-grab callback instead clears velocity, sets x20 true, clears `x221E_b6`, and invokes Squeezing0. [Grab path](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackdisappear.c#L140-L154), [success path](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackdisappear.c#L262-L270).

The destination survives entry for consumption by `ftMh_Squeezing_Phys`, which passes its address and `x18` to `ftBossLib_8015BE40`. On animation completion, Squeezing tests x20 for equality to 1: that branch enters active Squeeze; every other value takes the Fail initializer. Consequently Squeezing1 does not itself establish that an opponent is held. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsqueezing.c#L20-L49), [Fail initializer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackdisappear.c#L171-L179). Active Squeeze and subsequent throw selection are implemented elsewhere. [Squeeze](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsqueeze.c#L18-L50).

## Naming and evidence limits

Rendered `ftMh_Squeezing0_Enter` and `ftMh_Squeezing1_Enter` are reasonable descriptive hypotheses independently supported by canonical state selections, not recovered original names. The rendered `ftAnim_Advance` substitution is not independent proof of that callee's semantics. Numeric substrings 375 and 378 in original function identifiers are not treated as verified motion-state values. No compiled evidence was supplied for `.sdata2`; source literal uses do not establish section contents, size, ordering, or relocation consumers.

Status: synthesized; independent review and live promotion pending.
