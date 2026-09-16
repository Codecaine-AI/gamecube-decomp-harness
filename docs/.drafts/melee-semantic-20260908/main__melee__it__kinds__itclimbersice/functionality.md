## Ice Shot article lifecycle

This module implements the native Ice Climbers ice article and Kirby's copied variant. Its four-row ItemStateTable uses motion identifiers {-1, -1, 0, 0}; these identifiers are distinct from the numeric state indices.

Construction builds a SpawnItem from the parent, requested position, kind and facing. The supplied position becomes prev_pos with Z cleared, while a parent-derived position supplies pos. Creation failure returns null without article-specific initialization. Success saves the original owner, clears the release/shrink-eligibility flag, saves the configured scale, spawns a variant-specific effect and enters state 1. Native and Kirby fighter command handlers separately create and later release their tracked article.

Release initializes horizontal velocity from attribute x10 and facing, clears Y/Z velocity, initializes lifetime through the shared helper, enables shrinking eligibility, updates facing, spawns launch effects and enters state 2 with its travel effect.

### Numeric states

- **0 — stopped, optionally shrinking:** Entry resets velocity. Animation multiplies stored scale by attribute x28 only when the release flag is set, applies it to the model child and returns true below 0.01. Physics is empty. Collision maintains floor contact and alignment; support loss enters state 1. The animation code explicitly permits a null model child to reach the scale helper; it does not establish that this is safe.
- **1 — falling without lifetime ticking:** Animation always returns false. Physics delegates using the item fall-speed attributes. Collision uses a shared helper with several qualifying-contact checks before invoking the velocity-reset/state-0 entry callback, then always returns false. This is the initial state, but it is not exclusively pre-release: state 0 can reenter it after release.
- **2 — released ground travel:** Animation ticks lifetime. Physics runs a floor-normal/sign-dependent horizontal-velocity update under environment mask 0x18000. Only a strict speed-below-x24 result stops the article, enters state 0, destroys effects and returns true. Only that true result triggers the damage update, after velocity reset; this is not continuous speed-based damage recalculation during sliding. Collision maintains ground contact/alignment, enters state 3 after support loss, and then evaluates the shared speed-sensitive collision result.
- **3 — released airborne travel:** Entry selects state 3 and destroys existing effects. Animation ticks lifetime. Physics applies falling physics and then unconditionally updates hitbox 0 damage. Collision tests result bit 0, recreates the travel effect and selects state 2 when set, then still evaluates the shared collision result.

The shared damage expression first converts ABS(horizontal velocity × x30) to u32, then adds x2C. Preserve these conversion steps rather than assuming a single real-valued formula or a compiled conversion sequence.

### Interaction branches

The shared terrain-collision path returns true for a qualifying collision above speed threshold xC. At or below xC it applies shared collision response, updates facing, subtracts x4 from lifetime and returns false; it does not perform the HitShield lifetime-cutoff test.

HitShield returns true immediately above xC. Otherwise it applies victim bounce, updates facing, scales all velocity components by ItemAttr.x58, subtracts x4 from lifetime and returns true only if the resulting timer is below x8. ShieldBounced is a separate delegated vector-reflection path. Reflection delegates planar velocity reversal/scaling, facing reversal and restoration of lifeTimer from halfLifeTimer. Damage-dealt, clanked and absorbed callbacks return true without local processing.

### Ownership and effects

The saved originating-owner pointer is separate from generic item ownership. Destroyed conditionally notifies the native or alternate fighter subsystem and always clears that saved pointer. Reference removal clears it only on pointer equality, then unconditionally invokes generic reference cleanup. Fighter cancellation callers guard their tracked article and reconcile bookkeeping after the removal call. Generic destruction also clears the asynchronous effect queue before unlinking the object.

### Semantic review

Supported existing explanations and names are explicitly retained in the checkpoint ledger. Two proposed Fall_Coll names collide in both rendered files despite different state destinations and lifetime behavior; numeric-state-qualified names are proposed. One shrinking explanation is corrected to identify stopped state 0 rather than active travel. Compiled section size, layout and constant-pool membership claims remain unresolved rather than being inferred from source literals or MUST_MATCH ordering hints.

Status: synthesized; independent review and live promotion pending.
