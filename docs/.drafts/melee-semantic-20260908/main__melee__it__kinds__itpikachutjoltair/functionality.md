## Linked Thunder Jolt air-kind component

This unit implements the air-kind component paired with Thunder Jolt's ground-kind controller, including Pikachu, Pichu and both Kirby-copy variants. The ground controller creates this component at terrain contact and refreshes it on accepted surface updates; the `Air` kind name alone does not identify the initially fired descending projectile.

### Construction and synchronization
`it_802B4224` constructs the requested kind, returns NULL on allocation failure, clears four command variables, stores the ground partner, resets `xDF4`, establishes facing-dependent Y rotation and invokes post-creation initialization before storing the owner. `it_802B43D0` clears generic flags, performs common setup, enters state 0 and configures debug collision display from the owner.

`it_802B3F88` copies position, the complete collision snapshot and a supplied surface-direction vector; resets refresh age; synchronizes root translation and facing-adjusted X rotation; and re-enters state 0 with flags `0x12`. It dispatches audio `0x3A9CF` for Pikachu variants and `0x382B6` for Pichu variants, with no audio in the default branch. Its apparent null-object guard is not a safe null-input contract: GET_ITEM and GET_JOBJ dereference the object first.

### State and lifetime
The sole source table row dispatches animation, physics and collision for state 0. Animation derives rotation using `atan2f(xDE8.x, xDE8.y)`, increments `xDF4`, then survives only while the incremented value is at most 24 and the ground partner points back to this object. Without another reset, a zero counter permits 24 continuing callbacks and expires on the 25th. Missing or mismatched reciprocal linkage terminates immediately. Accepted terrain refreshes and reflection reset age, so 24 is not an absolute total-lifetime limit. Physics clears ordinary velocity; collision simply returns false.

### Cross-file ownership and interactions
The nullable accessor exposes the ground backlink. The position helper instead samples the air model's dynamic bone 6, clamps z to zero and supplies that position to ground-state tracking; it writes a zero vector when the link is absent. Clearing the air backlink alone does not directly destroy either object. Ground teardown clears the air backlink and its own link; air terminal paths clear the ground backlink and their own link. Subsequent state callbacks enforce the resulting lifetime consequences.

Damage dealt, clank, absorption, shield hit and shield bounce all reset hitboxes, conditionally unlink the pair and return true. Reflection is exceptional: it reanchors at bone 6, flips facing, reconstructs heading using root and bone-4 rotations, wraps the angle into the inclusive 0-to-2π range, rebuilds planar direction, resets age and restarts state 0 while returning false. It does not locally clear the partner link. The reference-invalidation wrapper delegates common ownership/interaction-reference removal rather than explicitly clearing article-specific partner fields.

### Semantic and rendered assessment
Existing accessor, spawn, surface-refresh, animation, unlink and event names remain useful semantic hypotheses. `Logic107_Spawned` describes post-creation use, not independently verified registration in an item-logic Spawned slot. The header renderer reports `shadowed_binding` for `it_802B3EFC` and `it_802B4224`, leaving those declarations unchanged despite substitutions in the C file. Other owned pages rendered without parse errors. No compiled section sizes, padding, literal-pool contents or placement are established by this source review.

Status: synthesized; independent review and live promotion pending.
