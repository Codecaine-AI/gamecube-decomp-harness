## Tosakinto / Goldeen item lifecycle

The translation unit defines five item states. Entries 0–2 use animation IDs 0–2 and share animation, physics and collision callbacks. Entry 3 has animation ID -1 and no animation callback; entry 4 also has animation ID -1 but has appearance callbacks. State indices, animation IDs and shared appearance-phase numbers are separate concepts. The header declarations agree with the implementation. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittosakinto.c#L20-L30)

### Initialization and appearance

`it_802C8F4C` initializes the cycling index to zero, loads the configured lifetime, initializes the retained sound identifier to `SFX_NONE`, performs common spawn setup, requests sound 0x272E and enters state 4. Appearance animation delegates shared scaling; appearance physics delegates motion and countdown processing but ignores its completion result. Thus timer expiry does not itself trigger the active-state handoff. State-4 collision processing supplies `it_802C8FE4` as its floor-contact continuation. That function scales the child joint, performs common setup, enters active motion and then snapshots `xD6C` into `x68_sfx_id`. The common terrain routine restores root scale after the continuation returns. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittosakinto.c#L32-L69) · [Appearance callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittosakinto.c#L131-L151) · [Shared appearance logic](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1077-L1130) · [Terrain continuation ordering](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L583-L613)

### Active movement and falling

`it_802C90E8` requests effect 0x46E, prepares airborne state, resets stored indices >=3 to zero, selects the resulting state and randomly chooses the sign of the configured horizontal increment. It does not randomly select the animation index, perform modulo arithmetic or guard negative indices. Initialization and subsequent increments establish the normal 0→1→2→0 cycle.

Active animation updates child-joint motion data and returns the lifetime tick result. Active physics first obtains animation-derived velocity from `it_8027A344`, then adds the stored horizontal increment. Because the shared helper overwrites velocity each tick, this is a horizontal bias, not cumulative acceleration across ticks. [Active callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittosakinto.c#L71-L107) · [Shared velocity assignment](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_279C.c#L1145-L1200)

The active collision callback evaluates `it_8026DA08` and `it_80272C6C`. A true first result increments the cycling index and re-enters active motion regardless of the second result. Both false increments the index and enters state 3. False/true leaves the state unchanged. All paths return false. State 3 delegates configured falling physics and invokes active entry only through the common helper's validated contact path. Landing reuses the stored index subject to the >=3 wrap. The local lifetime tick exists only in the active animation callback; neither appearance nor falling callbacks locally tick it. [Collision matrix and falling](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittosakinto.c#L109-L170) · [Validated continuation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L459-L479)

### Object and audio lifetimes

`it_802C8FC4` forwards both object pointers to common reference cleanup and discards its owner-match result. The common dispatcher preserves the pre-callback owner for a separate conditional destruction decision; reference invalidation itself is not the destruction callback. [Reference lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L474-L525)

Destruction requests audio only when `pos.y - 50.0F < Stage_GetBlastZoneBottomOffset()`, passing the retained sound identifier. The threshold includes the stage camera Y offset. There is no local timer or state transition, and the saved identifier can still be `SFX_NONE` if destruction precedes appearance completion. The source supports a conditional audio request, not guaranteed playback. [Destruction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittosakinto.c#L172-L179) · [Boundary getter](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/stage.c#L106-L109)

### Semantic assessment

Canonical and rendered versions of both owned files were fully reviewed. Rendered function substitutions are coherent hypotheses, not evidence for themselves. Existing `Spawned`, `EvtUnk`, `EnterActiveMotion`, `Fall_Phys`, `Fall_Coll` and `Appear_Phys` names remain supported; conservative numeric entry-helper names need no cosmetic replacement. Three factual clarifications are proposed. Ninety facts and all 33 links are explicitly retained in checkpoints; four compiled-section facts remain unresolved. No compiled section layout, fixed resource lifetime or historical original spelling is asserted.

Status: synthesized; independent review and live promotion pending.
