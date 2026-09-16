## Green Shell semantic review

Inherited research covers all 667 canonical and rendered C lines, all 58 header lines, all 95 frozen subjects, all 258 facts, and all 86 links. The lead independently inspected every proposed fact's canonical citations and all upstream contradiction evidence. Supported existing knowledge and unchanged research dispositions are explicitly retained; no lead overrides are required.

### State organization
The ten-row table distinguishes stationary state 0, initial/rebound falling state 1, held state 2, thrown state 3, dropped state 4, grounded active states 5/6, airborne active states 7/8, and special EnteredAir state 9. Paired rows share callbacks but differ in animation metadata. Spawn enters 1, not 0. State 1's collision callback propagates the floor-contact result when xDE8 is zero; its nonzero branch instead uses a guarded landing callback and returns false.

### Timers and interactions
The armed xDE0 countdown decrements before testing expiration, then disarms, reloads, and performs a conditional secondary action. The post-impact xDE4 countdown tests expiration before decrementing and reinstalls jumped_on without locally clearing its armed flag. The recurring effect timer emits effect 1029 using an attribute offset mirrored by negative facing direction. Both active animation families contain a 5/6 effect guard, including the unusual guard in the 7/8 callback.

Grounded active animation returns true when shell-local xDD4 has expired; airborne active animation always returns false. Generic item animation processing treats a true animation result as a destruction request, while a separate common lifetime path can also remove the item. Reflection copies the common half-life timer into shell-local xDD4; it does not make airborne expiration behave like grounded expiration.

Damage response replaces horizontal velocity in states 0/1/3/4/9 and accumulates it in 5–8. Stomp response instead distinguishes directional launch from randomized upward rebound. Both helpers retain common trailing work even for default switch cases. Clank invokes rebound unconditionally. HitShield distinguishes 3/4 from 5–8, whereas ShieldBounced handles only 3/4.

### Important cross-file corrections
The low-speed landing decision calls it_80277040, which evaluates surface-normal/tangential-motion conditions and updates auxiliary motion fields. It is not simply a terrain-support predicate. Its true branch selects state 9; state 9's collision helper separately detects loss of floor and then enters state 1. Descriptions equating state 9 with ordinary off-platform falling are therefore misleading.

Generic state changes reset the animation frame, install the selected callback row, flush the asynchronous effect queue, and clear jumped_on. Shell initializers reinstall jumped_on afterward where required. ITEM_ANIM_UPDATE does not mean preservation of animation progress. Throw and stomp sounds use IDs 242 and 241 respectively; inherited research identifies the common sound helper's resulting handle storage as xD6C.

### Names and evidence limits
Wait, Held, Thrown, Dropped, Roll, DamageResponse, GroundedInit, AirborneInit, UpdateHitboxTimer, and JumpedOn hypotheses generally fit canonical behavior. The two rendered Fall_Coll names differ only in capitalization despite representing distinct falling families; ActiveAir_Coll is proposed for the shared 7/8 collision callback. Exact original spellings remain unproved. Rendering completed without parse errors. Source declarations do not establish compiled .sdata or .sdata2 contents, and those claims remain unresolved.

Status: synthesized; independent review and live promotion pending.
