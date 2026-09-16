## Matadogas / Weezing behavior

This unit implements the parent Pokémon item and two emitted gas variants. The header declares the callbacks and both state tables; its rendered declarations agree with the rendered definitions. All owned canonical and rendered pages were reviewed, along with all 52 subjects, 136 facts, and 56 links. The checkpoint ledger explicitly retains 127 facts and all 56 links, supersedes four facts, and leaves five compiled-section claims unresolved.

### Parent lifecycle

The parent table has state indices 0, 1, and 2 with animation IDs 0, 1, and -1 respectively. These are separate numeric domains. Initialization clears command variable 0, loads the emission countdown from attribute x4, clears the sound-alternation field, performs shared Pokémon setup, enters airborne state 2, resets model yaw, and requests sound 0x2715.

State 2 delegates appearance-scale animation and terrain collision to common Pokémon helpers. Its physics guard is not pure: it invokes falling-physics processing and checks a startup timer before decrementing it. On success, the Matadogas callback resets velocity, selects state 1, installs effect pause/resume callbacks for hitlag, resets yaw, installs the accessory emitter, and sets xDD1_flag.b1. The direct JObj rotation path asserts a non-null, non-quaternion joint and marks its matrix dirty unless independent SRT is enabled.

State 1 selects state 0 when the model-hierarchy animation query returns zero. The common state-change routine clears on_accessory and hitlag callbacks; Matadogas reinstalls only the hitlag callbacks on this transition. Thus emission ends through a cross-file callback reset, not an explicit local accessory clear. State 0 returns true when no enabled joint animation remains; engine animation dispatch consumes true by destroying the item. Both state-0 and state-1 physics callbacks are empty. Their collision callbacks perform shared terrain processing with an empty item-specific event and return false. State-2 collision likewise returns false through its wrapper, although its terrain helper performs contact bookkeeping and floor-contact scale restoration.

### Emission and gas children

The accessory emitter does nothing while command variable 0 is zero, including leaving its countdown unchanged. Otherwise it pre-decrements the countdown and acts only on exact zero. It reloads the interval before selecting Gas1 or Gas2 and making one spawn attempt. A zero or negative initial countdown is not treated as immediate expiry; there is no local clamp or nonpositive fallback.

The spawn helper samples an integer-degree direction and computes planar velocity from the supplied float. Despite the canonical parameter name radius, that float scales velocity, not spawn-position displacement. Initial position comes from the parent's position plus its ECB vertical midpoint. The descriptor carries the parent's owner and the Matadogas object as separate parent references. Allocation failure produces no child and leaves the alternation field unchanged. Successful creation toggles that field; successes leaving it nonzero request one of sounds 0x2712–0x2714. With initialization to zero, these requests occur on the first and alternating subsequent successful creations.

The two gas spawn callbacks attach effect pairs 0x45B/0x45D and 0x45C/0x45E at unit scale, then share initialization. Attribute x0 supplies the child lifetime, and both enter child state 0 with effect hitlag callbacks. Its animation callback delegates to Item_TickLifetime: a nonpositive timer returns true immediately; a positive timer is decremented by one and returns false, even when that decrement reaches zero. The physics callback multiplies all velocity components by child attribute x4 for Gas1 or x8 for Gas2. Unknown kinds retain a zero multiplier. Attribute values are not supplied, so this is velocity scaling, not necessarily damping. Child collision is an inert false-return callback; that does not establish immunity to other engine removal paths.

Both two-object event adapters delegate matching-reference cleanup to it_8026B894. That helper clears matching owner and interaction references and resets source-player metadata to 6 when the fighter reference matches. Neither adapter propagates its ownership-match result.

### Semantic assessment

The existing spawn, gas-initialization, and state-slot names generally fit canonical behavior and are retained. Differences such as MatadogasGas versus Matadogas_Gas do not justify cosmetic rewrites. The parent event adapter's rendered Logic31 name is not supported by adjacency to separately registered child callbacks; a behavior-based cleanup name avoids that numeric assumption. Other corrections distinguish spawn attempts from guaranteed creation, randomized velocity from randomized placement, and velocity reset/accessory lifetime from vague activation wording.

No compiled artifact was supplied. Source declarations and literals do not establish section sizes, string placement, padding, or constant-pool membership. Those layout claims remain unresolved rather than being inferred from rendered names or C source order.

Status: synthesized; independent review and live promotion pending.
