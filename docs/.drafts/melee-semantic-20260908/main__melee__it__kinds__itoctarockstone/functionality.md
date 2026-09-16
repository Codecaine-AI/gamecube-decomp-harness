## Octorok stone projectile

The canonical C implementation and header, and both complete rendered views, were reviewed. All 48 frozen subjects, 107 facts and 47 links were enumerated. The ledger explicitly retains 101 facts and all 47 links, supersedes two inaccurate data-flow explanations, and leaves four compiled constant-pool facts unresolved.

### Lifecycle and state dispatch

`it_803F8E90` supplies two distinct callback rows selected by motion-state indices 0 and 1. Both rows have zero in their first field; this does not mean they represent the same state. The generic state changer consumes that field as `anim_id`, separately from `msid` (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1180-L1231).

Initialization clears `xD5C`, flag `x15`, and three delegated hitbox-related flags, then enters state 0. State 0 applies the common falling update in its **Anim** callback; its **Phys** callback is empty. The common helper uses a sign-sensitive, pre-subtraction speed threshold rather than a hard post-update clamp, so its terminal-speed parameter must not be described as guaranteeing a clamped velocity (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204).

State-0 collision processing tests mask `0xF`. Without qualifying bits it leaves the motion state unchanged. With contact it performs the common contact response, optionally writes `GA_Ground` for bit 0, and then enters state 1, which writes `GA_Air`, clears `x1F`, selects index 1, and requests sound `0x138` with arguments `0x7F, 0x40`. The ground write is therefore transient on that branch. State 1 has an inert false-returning Anim callback, directly subtracts fall speed in Phys without a local speed cap, and returns the common environmental collision result from Coll (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itoctarockstone.c#L62-L115).

### Interactions and lifetime

Damage-dealt, clanked, ordinary shield-hit and absorbed callbacks return true without local mutations. Damage-dealt termination is independently supported by the item dispatcher, which invokes destruction when the callback returns true; this is not inferred merely from contrasting reflection (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1701-L1741).

Reflection delegates XY velocity negation and `xC70` scaling, facing reversal, and assignment of `xD48_halfLifeTimer` to `xD44_lifeTimer`, then returns false. This assignment does not prove that the remaining lifetime increases or that this module itself decrements that timer. Shield bounce is a separate delegated path: the common helper mirrors velocity, conditionally updates facing, synchronizes collision facing and returns false. The two-object event wrapper forwards its arguments unchanged; its local body does not establish a narrower event trigger (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L418-L456; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itoctarockstone.c#L117-L120).

### Spawn and launch

The Octorok attack supplies bone-14 coordinates, facing, and special attributes `x10`, `x14`, and `x18` at its release event. The constructor distinguishes the supplied previous position, whose Z is flattened, from the position obtained through the parent helper. It assigns the dedicated stone kind and parent fields, requests creation, and initializes velocity only on a non-null result. It does **not** explicitly initialize the SpawnItem velocity before creation (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itoctarock.c#L255-L275; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itoctarockstone.c#L172-L192).

Launch initializes horizontal velocity from speed times facing and clears depth velocity. It queries the nearest eligible fighter using a null reference object, then obtains that fighter's camera-target-bone position. Its actual gravity calculation includes both division by horizontal speed and division by the resulting travel-time-like value. Neither division has a local zero guard. Zero horizontal separation can therefore expose the second division even when horizontal speed is nonzero; algebraic cancellation would conceal this exceptional path. The target branch adds randomized vertical displacement, applies the upper comparison first and lower comparison second, and returns. The no-target branch assigns zero vertical velocity without applying either bound (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itoctarockstone.c#L122-L163).

### Semantic naming assessment

The rendered `Logic4_Spawned`, numeric state-entry names, `Fly_Anim`, `InitVelocity`, and `Spawn` hypotheses fit canonical roles and need no equivalent-wording replacements. `Fly_Anim` describes initial flight, not a recovered animation identity or the absence of falling in state 1. External rendered helper names were not used as self-proving evidence. Both rendered files report zero parse errors; their documented substitution scope excludes parameter, field and data-section names.

No compiled section extent, literal placement, alignment, or conversion-support layout is asserted. Source literals alone cannot validate the existing `.sdata2` storage explanations.

Status: synthesized; independent review and live promotion pending.
