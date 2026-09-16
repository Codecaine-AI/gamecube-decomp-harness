## Barrel lifecycle and dispatch

`ittaru.c` implements the ordinary Barrel's eight-state item lifecycle; `ittaru.h` declares its callbacks, helpers, and dispatch table. Full canonical/rendered and baseline coverage is inherited from the hash-bound research handoff. The lead independently checked every proposed fact's canonical citations and all upstream non-retain evidence.

Motion-state indices differ from animation selectors: states 0, 1, 2, and 4 use selector -1; states 3, 5, 6, and 7 use selectors 0, 1, 2, and 3. State 2 alone lacks a collision callback.

- **State 0 — standing/waiting:** animation checks the externally maintained lifetime without decrementing it; physics is empty. Collision handles support loss, ground alignment, and slope-triggered rolling with initial signed speed 0.1.
- **State 1 — initial/support-loss falling:** animation is inert, physics delegates common falling acceleration, and qualifying collision settles into state 0 below the Barrel impact threshold or bounces otherwise. It does not directly enter rolling.
- **State 2 — held:** pickup sets `xDB0_itcmd_var1` and enters this locally inert state. The orientation helper subsequently consumes that field for child-model realignment.
- **State 3 — thrown or dropped:** both release paths select this state. Throwing performs model preparation and requests animation updating; dropping uses a different mask preserving hit state. Lifetime expiration returns true. Collision can initiate terminal breaking, bounce, transfer horizontal speed into state 5, or suppress upward velocity. The forwarded break callback returns false rather than requesting immediate deletion.
- **State 4 — rolling-related:** physics integrates rolling and updates orientation, promotes to state 5 above `attr->x1C`, and independently sets interaction flags below speed 0.01. No entry into state 4 is established by the owned source. Promotion clears x15; that helper is not a grounding operation.
- **State 5 — rolling:** animation changes command value 1 to 2 before lifetime processing. Physics updates rolling motion then orientation. Collision supplies the dropped-state initializer to shared support processing, then performs non-airborne surface-vector updates and speed-dependent breaking or damped reversal. Missing `0x18000` flags clear only the stored vector's X component.
- **State 6 — alternate no-content-spawn terminal branch:** setup writes local `xDD8 = 40`, but completion consumes common `xD44_lifeTimer`, initialized from `it_804D6D28->xF8` by `it_8027518C` and decremented by `it_802751D8`. Physics and collision callbacks are locally inert; that does not prove all engine-level interactions are inert.
- **State 7 — contents-release terminal branch:** performs short-circuit prioritized content-spawn attempts, hides the model, zeros planar velocity, and initializes a local 40-update countdown consumed by its animation callback. Physics and collision callbacks are inert.

## Shared behavior and exceptional paths

Grounded rolling applies slope acceleration when the stored surface-vector X magnitude exceeds 0.1 and rolling speed is below `x2C`. The sufficiently level-contact alternative applies friction; exceeding `x2C` on a slope does not itself select friction. Processing then aligns facing, applies the `x20` speed cap, and projects speed through the stored surface vector. Airborne processing changes only accumulated tumble angle.

Model alignment uses an approximately one-degree-plus-configured-step snap band. Z convergence clears `xDB0_itcmd_var1` independently of X convergence; X processing still occurs after Z clears the flag.

Damage-dealt, clank, shield-hit, and reflection callbacks share a one-shot guarded terminal selector and always return false. Damage received distinguishes threshold-triggered breaking, randomized state-0 rolling initiation, and additive impulses in states 4 or 5. Subthreshold damage in other states leaves their motion state unchanged. The unknown event adapter forwards both object pointers without establishing the precise event trigger.

## Semantic assessment

Supported existing lifecycle, rolling, held, helper, and parameter knowledge is retained, as are unchanged research dispositions and links. The meaningful rendered naming correction is state-3 `Fall_Anim` to `Thrown_Anim`: it separates that callback from state-1 `Fall_Phys`/`Fall_Coll` and matches its state-3 siblings. Dropped use remains explicit.

Existing knowledge distinguishing state-6 common lifetime from state-7 local countdown is retained. Contrary duration claims, grounding claims, motion-state/animation-selector conflation, and alignment-tolerance claims receive targeted corrections. Tentative EmptyOpen/OpenEmpty names remain only a no-content-spawn distinction, not proof of harmlessness or smoke identity.

Compiled section size, constant-pool placement, conversion-support placement, and opcode identity cannot be established from source literals or `order_sdata2`; these claims remain unresolved. Rendered substitutions are hypotheses, not independent proof. The malformed upstream alignment-disposition locator is not evidence; the independently checked locator is `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ittaru.c#L149-L187`.

Status: synthesized; independent review and live promotion pending.
