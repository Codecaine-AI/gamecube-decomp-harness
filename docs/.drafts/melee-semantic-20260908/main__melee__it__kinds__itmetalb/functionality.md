## Metal Box item

The module defines five `ItemStateTable` rows, each with animation identifier `-1`. These are state indices, not animation numbers. Spawn clears `xDCE_flag.b7` and enters state 1; pickup selects state 2; dropping selects state 1 with `ITEM_DROP_UPDATE`; entered-air selects state 4.

- **State 0:** Resting entry resets velocity, performs shared setup, and selects state 0. Animation and physics callbacks are inert. Collision delegates support processing with the state-1 entry continuation, then requests floor-gated alignment. The shared support helper also has an exceptional branch calling `Item_8026ADC0`; the wrapper's false result is not a guarantee against helper-side processing.
- **State 1:** Ordinary falling behavior. Physics forwards the common fall acceleration and maximum-fall-speed attributes. The shared helper uses a pre-update speed threshold, not a post-update clamp, so one subtraction can overshoot the threshold. Collision supplies the velocity-resetting state-0 entry continuation.
- **State 2:** Selected on pickup; has an inert animation callback and null physics/collision slots.
- **State 3:** Shares its inert animation callback with state 1 and uses equivalent falling physics, but returns the result of `it_8026DA08` from collision processing. No local selector establishes how this state is entered; calling it definitively thrown or damaged is unsupported here.
- **State 4:** Selected by entered-air. Animation and physics are inert; collision delegates to `it_8026E8C4` with state-0 and state-1 continuations.

Damage handling first calls `it_8027236C`, which synchronizes owner/team information and performs additional shared processing even when it returns null. A non-null fighter association with `xDCF_flag.b6` set receives the fighter-side effect call and player bookkeeping. Other non-null associations clear `xCEC_fighterGObj`; a null association skips these local branches. Every path returns true, which the common damage dispatcher consumes as a destruction request, not an effect-success predicate. Fighter-side transformation lifetime is distinct from the physical box's lifetime.

The unknown-event callback forwards both object pointers to `it_8026B894`. The header declares the callback surface and table. Canonical and rendered views were read completely; both rendered files reported no parse errors. Existing Resting, Falling/Fall, EnteredAir_Phys, and conservative EnterUnkMotion1 names fit the source; equivalent renaming is unnecessary. Rendered external helper names were not treated as proof. Source establishes the callback array, but not the compiled `.sdata2` extent, padding, or pooled-zero attribution.

Status: synthesized; independent review and live promotion pending.
