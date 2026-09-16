## Charge Shot article

This unit implements the shared Samus and copied-Kirby Charge Shot article. Its nine-entry source dispatch table separates owner-attached charging state 0 from eight charge-selected fired states sharing animation, physics, and collision callbacks.

### Creation and charging
`it_802B55C8` builds a nullable spawn request, distinguishes the supplied previous position from the owner-derived spawn position, initializes selected command and article fields, records the originating fighter, and invokes common pickup setup. Pickup requests state 0 and attaches variant-specific charging effects. Held animation conditionally queries the originating fighter only when it still matches the current owner. Applicable helper failures return true immediately; missing/mismatched owners and unhandled kinds instead fall through to the scale calculation. Held physics is empty and held collision always returns false.

### Launch and numeric distinctions
`it_802B56E4` writes angle, lifetime, current charge, and maximum charge before checking ownership. Only the matching-owner branch enters fired state, detaches the article, initializes movement and presentation, and sets the released marker. The two ordered charge comparisons do not validate a positive maximum, and interpolation divides by that maximum without a zero guard.

Fired entry changes stored `xDEC`: negative values become zero and values at least eight become seven; it then requests state `xDEC + 1` and installs the accessory callback. Launch subsequently computes speed and the integer property from its bounded local charge argument, but computes scale from the possibly modified stored `xDEC`. These are distinct data flows, not a single universally preserved charge fraction. The normal fighter callers supply integer-valued accumulated charge; arbitrary fractional inputs should not be described as explicitly rounded by this helper.

### Fired updates and interactions
Fired animation reapplies stored uniform scale and returns the common lifetime helper's result: decrement first, then test for a nonpositive timer. Physics reconstructs XY velocity from stored speed and heading without writing Z. Directional collision selects ceiling versus floor and left-wall versus right-wall masks using positive versus nonpositive velocity components; zero components take the floor/right-wall branches.

The accessory callback emits native or copied effect pairs when stored charge equals stored maximum and the modulo-three counter is zero. Unknown kinds emit nothing, and every invocation advances the counter. Installation occurs before launch resets the counter.

Damage-dealt, clank, absorption, and ordinary shield-hit callbacks return true without local side effects. Reflection reverses facing and adds π to the stored heading; velocity changes on subsequent physics processing. Shield bounce immediately mirrors XY velocity, reconstructs heading, and selects positive facing for zero X velocity. Both directional handlers return false and retain the inclusive upper angular endpoint permitted by their loops.

### Lifetimes and cleanup
Explicit article removal is nullable and delegates to common item destruction after clearing effects and the charging-effect marker. The destroyed callback performs fighter-side held-reference cleanup only for an unreleased article whose recorded fighter still owns it. It clears `xE00` only in the unreleased branch, while clearing owner and flag x13 for every valid item. Fighter-side persistent charge is separate from article lifetime and is reset by higher-level full-reset or firing paths.

The reference-invalidation callback delegates to the common helper. That helper clears matching common interaction references, not the Charge Shot-specific `xE00`; the removal loop separately uses the owner cached before callback dispatch to decide destruction.

### Semantic review
Existing rendered role names are supported and retained. Five factual refinements are proposed for exact signature spelling, launch data flow, lifetime thresholds, and accessory initialization ordering. The header renderer leaves the spawn declaration unchanged with `shadowed_binding`; this is not evidence against the spawn name. No compiled section extent or constant-pool placement is established by this source-only pass.

Status: synthesized; independent review and live promotion pending.
