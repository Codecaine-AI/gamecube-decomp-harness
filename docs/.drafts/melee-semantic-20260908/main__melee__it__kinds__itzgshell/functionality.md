## ZGShell semantic review

The translation unit implements the enemy-derived Green Koopa shell lifecycle, with extensive callback reuse by the Red Koopa shell. Both owned files were read completely in canonical and rendered form, and every frozen subject and link was assessed.

### State machine

The twelve dispatch rows contain animation metadata `0,0,0,1,1,1,0,1,0,0,2,3`. States 5/6 share one callback triplet, states 7/8 share another, and held state 2 has no collision callback. States 0 and 2 have inert animation callbacks and physics counters that begin restoration only when the existing counter is strictly greater than attribute `x2C`. Thrown and dropped events select states 3 and 4 with mask 6; thrown additionally requests sound `0xF2`.

Grounded and airborne active initializers cap horizontal speed and select 5/6 or 7/8. Timer callbacks maintain delayed hitbox operations and an armed countdown. The periodic effect is ID 1029 with a facing-relative offset; its exact visual identity remains unspecified. Motion8 retains an explicit effect guard for states 5/6, despite ordinarily serving states 7/8.

### Important corrections

`it_80277040` processes contact-normal/slope-driven motion in `x88`; it is not a floor-support query and does not change `msid` or `ground_or_air`. The named EnteredAir handler selects state 9 without assigning `GA_Air`. Actual floor loss is handled separately by terrain helpers. State 9 has an inert animation callback and two independent physics stop tests: low horizontal speed and unchanged world x/y position. Both can execute in one invocation.

State 10 handles interrupted restoration. Its animation callback can reset a grounded shell to state 0 after animation completion, but its alternate state-9 branch explicitly excludes states 10 and 11. Because the slope predicate does not change `msid`, this must not be described as an ordinary unconditional state-10-to-9 recovery path.

### Restoration and lifetime

Restoration setup initializes a twenty-update orientation counter and a thirty-five-update delay. Exact combined angles of ±90 degrees take a special path without modulo normalization; other angles use signed integer conversion and modulo 360. A carried-item branch performs additional release and airborne preparation. The hurt capsule is derived from a temporary copy, so repeated enlargement does not compound the stored template.

During active restoration animation, dynamic bone 1 supplies translation deltas for item velocity. `zgshell.vel` stores previous translation, not velocity; state 9 reuses its x/y components as previous world position. The reset helper clears this scratch vector, not `x40_vel`. A NULL bone leaves the shared helper's inputs and outputs unchanged.

Grounded animation completion attempts to create a Nokonoko. It transfers `xDD8` and invalidates the old value only on successful allocation, but returns true even if allocation fails. The common animation dispatcher treats true as a removal request. Nokonoko-to-shell conversion has the same conditional-transfer distinction. Shell destruction delegates to generator cleanup, whose non-Coin path uses a stored index rather than the pointer-match scan used for Coins, and updates respawn bookkeeping.

### Rendered names and evidence limits

Supported existing names and explanations are explicitly retained in the checkpoint ledger. The two competing `itZGShell_Roll_Anim` hypotheses conflate distinct callbacks; the state-9 no-op should receive a distinct numeric-state name. `ResetBoneVelocity` should describe previous-position scratch instead. The header renderer reports `shadowed_binding` for the constructor while the C view substitutes `itZGShell_Create`; this is a renderer issue, not evidence against constructor semantics.

No revision-pinned compiled section evidence was available. Section extents, padding, switch-table membership, and literal-pool placement remain unresolved rather than inferred from C literals.

Status: researched; no-change lead bypass; independent review and live promotion pending.
