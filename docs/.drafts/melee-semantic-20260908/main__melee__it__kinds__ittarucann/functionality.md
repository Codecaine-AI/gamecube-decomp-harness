## Barrel Cannon item

The translation unit implements the portable Barrel Cannon's lifecycle, terrain motion, fighter capture and launch, and terminal disappearance. The header agrees with the implementation, including the unusual float-returning motion-7 physics callback that is explicitly cast in the dispatch table.

### State structure
The ten table rows distinguish passive grounded and falling states 0/1, held state 2, parallel empty/occupied active groups 3–5 and 6–8, and terminal state 9. Callback suffixes are not unique numeric state identifiers: the motion-6, motion-7 and motion-8 families serve paired rows. Rows 4/7 perform thresholded rolling updates, but their entry paths and precise visible phase are not established locally.

Spawn initializes an empty, nonrolling cannon, randomizes x8 independently of the zeroed current rotation xC, and enters state 1. Passive landing either settles into state 0 or bounces. Passive grounded collision can activate rolling on a sufficiently steep surface. Pickup enters state 2; its animation maintains the occupancy-derived flag without updating lifetime, physics is empty, and collision is null.

Drop and throw choose active airborne row 3 or 6 according to occupancy. Their setup differs: drop enables three interaction flags and supplies half-unit horizontal drift from owner facing; throw restores the model and uses different transition flags. Empty active states register the item capture callback together with ftCo_Barrel_Enter.

### Occupancy and cross-file lifetime
Capture stores grab_victim in tarucann.x20. The completion helper always reveals the model, but only states 3–5 receive the occupied-air transition, sound and attribute-derived motion initialization. Other states take the reveal-only path.

The fighter-side Barrel state retains the cannon pointer and initializes separate automatic-fire and manual-input countdowns from the two item getters. Automatic firing occurs on decrement to exactly zero, not when initially zero. Manual input is checked after decrement, permitting A/B firing on the update that reaches zero. Damage and death callbacks also request firing.

Firing constructs attribute-driven hit parameters, derives direction from xC plus π/2, computes an eight-unit muzzle offset, and calls the fighter launch routine before entering item state 9. Destroyed checks object, payload and occupancy before using this path; Fire itself guards only the object pointer. Clearing item occupancy does not establish that every fighter-side reference has ended: the launch consumer installs a later callback that consults the retained cannon's owner.

### Motion and termination
The shared integrator separates steep-slope acceleration from flatter-surface friction. Reaching the steep-slope acceleration threshold does not switch to friction. Ground motion updates speed, facing, projected horizontal velocity and signed rotation; airborne motion updates rotation only. Active collision prioritizes landing over side response and uses a different landing threshold from passive falling. Rolling collision delegates support loss to an airborne transition callback and handles continued support separately.

Shared lifetime processing decrements only while empty. Its preliminary low-lifetime helper call occurs regardless of occupancy; occupied cannons remain visible. Terminal setup selects state 9, clears command and occupant, resets velocity and requests sound. Animation waits for command 1 before effects, a small quake, hiding and initialization of a 40-update countdown; command 2 decrements it to completion. Other command values return false.

### Semantic review outcome
The checkpoint explicitly accounts for all 264 facts and 92 links: 245 facts retained, 11 superseded, eight unresolved; 90 links retained and two rejected. Proposed corrections distinguish passive and active airborne animation names, correct ordinary-Barrel misidentification, clarify numeric-state and nested-branch behavior, and improve supported explanations. Other useful names and descriptions are retained. Compiled section extents and literal allocation remain unverified; rendered names were treated as hypotheses rather than proof.

Status: synthesized; independent review and live promotion pending.
