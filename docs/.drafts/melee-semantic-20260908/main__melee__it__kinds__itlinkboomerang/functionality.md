## Link and Young Link boomerang

The unit implements article creation, held-state validation, launch, outbound and returning motion, stage and item interactions, two delayed trail models, fighter coordination, and cleanup. Both fighter variants register the same state table and lifecycle callbacks in `it_3F2F.c`.

### State and trajectory behavior

The four table rows correspond to motion IDs 0–3; their animation-resource indices are separately `-1, 0, 1, 2`. Motion 0 has only an animation callback. Motions 1 and 2 share maintenance, equivalent outbound physics, and stage collision handling. Motion 3 adds a temporary child-model rotation adjustment and returning physics, with no collision callback. The precise authored distinction between outbound motions 1 and 2 remains unknown; retaining numeric names is appropriate.

Outbound physics skips processing when `xDE8 == 1`. Otherwise it subtracts attribute xC from planar speed. A result strictly below x18 selects x18, reverses the stored heading by π, initializes return steering, and enters motion 3 before reconstructing velocity. Stage collision selects at most one facing-dependent wall, ceiling, or floor. Negative incidence cosine above xF7C reflects velocity; a more direct impact starts return; nonnegative incidence does nothing.

Return physics increases planar speed with an x14 cap and writes velocity before updating the heading toward the retained owner. Steering occurs while xF80 is positive on entry, including the update that decrements it to zero. It is a steering duration, not a delay. Angle helpers perform single conditional wraps rather than unrestricted modulo normalization.

At catching distance, a present owner passing both fighter checks enters the appropriate SpecialS2 state and receives the article. A present but unavailable owner instead causes removal. An absent retained owner is different: the distance helper returns zero, and qualifying range handling removes only the trails, not the item. The ordinary lifetime mechanism remains available.

### Launch and ownership

Creation distinguishes the supplied previous position from the fighter-derived spawn position, initializes histories and auxiliary models, and attaches the successfully created article to the supplied fighter part. Failure returns null without article-specific initialization.

A significant baseline correction is that `it_802A0534` receives a launch **velocity vector**, not a world-space release position. Through `it_8027429C` and `it_80273B50`, that vector is copied into velocity and scaled by the common throw-speed multiplier. Release position is obtained separately from the fighter attachment joint. The launch routine selects an owner-dependent lifetime, stores heading, invokes the thrown hook, performs common release setup, and restores model orientation.

Reflection sets xDE8 to 1 once, resets lifetime from the half-life timer, redirects and scales velocity away from the selected owner or reflector, and clears the original fighter's active-boomerang bookkeeping. It does not itself null the retained xF98 reference. Reference invalidation clears xF98 independently. Ordinary removal notifies the fighter only when owner is non-null, matches xF98, and xDE8 is not 1.

### Visual maintenance and review outcome

Two auxiliary JObjs consume independent cursors into 16-entry position and rotation histories. Their activation is staggered; playback requires the corresponding command value 2. Shared maintenance processes sound, command-triggered motion entry, activation, and lifetime before conditional history recording and playback. Expired lifetime skips the latter operations.

Existing rendered names generally fit canonical behavior and are retained. Direct lifecycle registration additionally supports `Clanked` for `it_802A1FA8` and `Dropped` for the empty `it_802A0F84`. Corrections address launch-vector semantics, heading reversal mislabeled as normalization, conditional history recording, steering duration, and absent-owner return handling. The header's spawn declaration remains unsubstituted because the renderer reports `shadowed_binding`; this is not evidence against the Spawn name. Source literals do not establish compiled `.sdata2` membership or layout.

Status: synthesized; independent review and live promotion pending.
