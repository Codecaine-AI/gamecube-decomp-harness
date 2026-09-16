# Purin SpecialN semantic reconciliation

Inherited research covers both owned files and all subjects and links. Canonical checks confirm directional startup, capped x2C accumulation, held-mask release, charge-derived horizontal speed, timed/angular ending, slope-sensitive movement, turning, hit response, and paired collision-state continuations. Supported existing mechanical names and operational knowledge are retained; external rendered aliases are not independent proof.

Release input tests absence of held_buttons[0] mask 0x200, not an explicit release edge. The aerial full-charge transition mask evaluates to 0x41092, not 0x41292. Ground release slope influence uses signed base_vel; attributes and floor normals are read, not assigned. Both speed caps execute sequentially.

Release animation processes capsules before its timer guard. The ending helper accepts a Boolean ground/air selector and MotionFlags: 0x40012 is flags, not a state identifier. Aerial turn animation passes false at expiry, unlike aerial release's true. Ending animation clears deferred facing before cleanup, preventing that cleanup's conditional facing restoration. Saved model scale survives in fighter-specific state and is reused by scale animation, damage/death cleanup and cliff cleanup.

Collision callbacks pass the current animation frame and reinstall local callbacks. Literal predicate comparisons are preserved without interpreting return values as ground/air enums. Ground wall-response and air-transition branches are independent. Aerial release handles wall scaling before coll-true vertical response; every coll-true path returns before cliff fallback. Floor angles feed effects, not the separate roll-orientation helper. Attribute multiplication alone does not establish attenuation or reversal. Air-turn collision reads self_vel.x after intervening helpers and state change.

The damage-dealt callback handles four release/turn states, enters SpecialNHit, initializes attribute-based velocity and removes itself while retaining cleanup callbacks. SpecialNHit requests special landing when xD8 is nonzero, but the callee may divert to HammerLanding. The SpecialS-prefixed bookkeeping wrapper is installed during SpecialN turn completion and refreshes generic current-attack bookkeeping; its name does not establish Pound identity. The x21F8 callback negates selected directional values without changing Fighter.facing_dir; its triggering event and atomicity remain unverified. Empty IASA bodies establish only local inactivity.

Shard-boundary gaps are resolved by the aggregate reads, not by assuming gameplay identity. External Rollout/Pound and input mappings, dispatcher-wide interruption rules, collision-helper contracts, attribute bounds, stale-table deduplication callees, compiled sections and register identities remain deferred. The renderer's shared collision-box alias must not merge distinct helpers.


Status: synthesized; independent review and live promotion pending.
