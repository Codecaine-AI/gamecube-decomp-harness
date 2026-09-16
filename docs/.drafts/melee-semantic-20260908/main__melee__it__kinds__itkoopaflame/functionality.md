## Koopa-flame item behavior

This unit implements individual Bowser and copied-Bowser Kirby flames. Its single-entry item-state table installs animation, physics and collision callbacks for state 0.

Spawn constructs the item descriptor and returns NULL if creation fails. Successful creation initializes lifetime, command variables, counters, effect selection and steering direction. Native and Kirby flame kinds use different fighter-specific divisors for speed and scale. Two random samples determine speed and launch angle. The default-kind branch supplies neither divisor-derived field; this routine should not be described as initializing arbitrary item kinds safely. Facing-dependent angle selection tests exactly `facing_dir == 1.0f`.

Setup selects state 0, computes initial velocity, temporarily subtracts planar velocity before collision processing, restores the saved position and invokes the debug hook. Its third argument is unused.

Animation scales enabled hitbox 0 using a lazily captured base scale and applies uniform model scale. The frame counter triggers hitbox processing only after it strictly exceeds the configured hitbox lifetime. A one-shot latch selects effect `1243 + gfx` for Bowser or `1189 + gfx` for Kirby; the default branch still sets the latch without creating an effect. Separately, `it_80273130` decrements the general life timer and returns whether it is nonpositive—not whether an animation has completed.

Physics saves the current position and reconstructs velocity as `x = speed * sin(angle)`, `y = speed * cos(angle)`, `z = 0`. Only the private velocity copy is normalized. Collision sets four three-unit extents, evaluates stage contact, and converts floor/ceiling/wall masks into local bits. Recognized contacts cumulatively add surface normals to the persistent direction, then drive signed angle correction. Corrections below π/2 use coefficient 0.02; larger discrepancies use 0.5. Collision always returns false.

Damage-dealt, clank and shield-hit callbacks are local no-ops returning false. Reflection adds π to the stored angle and negates facing and planar velocity. Shield bounce mirrors velocity and stores `atan2f(y, x)`, which differs from the physics reconstruction convention; it must not be described as guaranteeing synchronized future travel. Neither callback immediately refreshes the private normalized velocity or persistent steering direction. Absorption invokes owner-scoped effect cleanup and returns true. The two-object event callback forwards its arguments unchanged to the shared item helper; its broader event semantics remain unresolved here.

Canonical and rendered owned files were reviewed completely. Existing descriptions are retained except for two supported purpose corrections and seven unresolved compiled-section claims. Rendered external names were treated as hypotheses rather than proof. No compiled section size or layout is established by this review.

Status: synthesized; independent review and live promotion pending.
