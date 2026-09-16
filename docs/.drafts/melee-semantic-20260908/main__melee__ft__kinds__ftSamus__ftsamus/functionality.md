## Samus initialization and integration

The canonical and rendered versions of both owned files were read completely, and all 32 subjects, 69 facts, and 32 links were enumerated. Cached evidence from the interrupted attempt was restored rather than researched again. Rendered names were treated as hypotheses.

### Dispatch and resources
`ftsamus.c` defines 18 MotionState entries, annotated with state IDs 341–358. These cover the initial grounded/aerial lower-special pair, six neutral-special phases, four ordinary/smash-input side-special variants, two upper-special states, two Bomb states, and AirCatch/AirCatchHit. Every entry supplies the shared camera updater. The initial lower-special pair must not be conflated with the later Bomb pair. The unit also declares fighter and animation archive names, four demo-motion labels, five costume resource pairs with null third pointers, and a five-element costume-list declaration. These are source-level observations, not proof of compiled section placement.

### Lifecycle and item callbacks
OnLoad enables wall jumping, installs Samus attributes, and submits item slots 0–3 with Bomb, Charge, Missile, and GBeam kinds. This prepares resources rather than spawning those moves. OnDeath calls the parts helper with two zero arguments and zeros six selected Samus fields; it does not clear the complete FighterVars block or itself destroy articles.

`ftSs_Init_80128428` dispatches neutral-special, side-special, and common cleanup in that order. Canonical inline assignments install it for both damage and secondary death. Neutral cleanup is null-guarded, removes an attached charge object when present, conditionally destroys effects, and clears charge. Side cleanup has no corresponding null guard. The proposed OnDamage name remains tentative and does not exclude death usage.

Item callbacks are thin adapters. Pickup and visibility handling exempt heavy items; pickup selects hold animation by hold kind and conditionally updates presentation. Drop resets hold animation unconditionally and conditionally hides presentation. Fixed zero options do not disable the entire operation.

### Charge restoration and scaling
`ftSs_Init_UnkMotionStates4` compares the signed charge field with the floating-point configured maximum using exact equality, then applies color entry 53 with mode 0. Other charge values cause no local update. Charging, firing, interruption cleanup, and common color-channel refresh jointly determine the indicator's lifetime; this callback is not its sole owner.

LoadSpecialAttrs copies attributes before conditionally multiplying x8, x54, x58, x74_vec.y, and all six collision-box floats by non-unit model Y scale. Downstream lower-special code consumes these values for launch magnitude, entry/transition velocities, Bomb placement, and conditionally selected environment-collision tests. Numeric motion-state constants remain distinct from submotion identifiers and rendered semantic names.

### Throw accessory and animation
CreateThrowGrappleBeam uses the descriptor bundle in item slot 4, separately from the registered slot-3 beam article. The shared loader asserts if an accessory already exists and loads a JObj from the descriptor. Setup applies uniform Y-derived scale, binds shared and throw-relative animations, selectively retimes controllers, requests and evaluates frame zero, and associates the hierarchy with ThrowN. The throw-relative array index has no local bounds check.

The rate callback ignores null or looping AObjs and changes only framerate. Traversal excludes material and texture controllers. Later interpretation consumes the rate, with first-play and stopped-animation exceptions. Construction does not establish the accessory's eventual destruction lifetime.

### Evidence limitations
The rendered C view reports two parse errors and leaves the callback-address reference unchanged despite renaming its definition; the header reports no parse errors. No compiled artifacts establish .data aggregation or .sdata2 literal backing. Section-target facts and links remain unresolved rather than treating source declarations or rendered labels as compiled evidence.

Status: synthesized; independent review and live promotion pending.
