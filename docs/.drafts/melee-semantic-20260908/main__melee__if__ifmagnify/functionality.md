## Magnifying-glass HUD subsystem

`ifmagnify.c` owns six player-specific magnifier displays and their capture state. Initialization clears the owner's first `0x74` bytes, initializes four stage-color fields with independent zero fallbacks, loads the `lupe` model from the shared HUD archive, constructs slots 0–5, then creates the capture camera. Slot 0 uses the model's image descriptor; later slots copy it and allocate separate image buffers with allocation sizes rounded to 32 bytes. The camera uses symmetric orthographic extents of ±0.1 times the texture dimensions and a full-texture viewport/scissor.

### Capture and publication

Every capture callback first clears all six `is_offscreen` flags. HUD visibility gates further processing. Each slot additionally requires an unset suppression latch, an existing fighter, both fighter predicates, and successful per-fighter camera activation. Failure of the initial camera activation does not abort the later slot loop. Eligible fighters are framed using fighter-provided scale and interest position. Stage camera bounds select four colors through a nine-callback, sixteen-row lookup; bilinear weights produce the capture erase color. Three fighter draw passes run with `HSD_GObj_804D7814` temporarily set, then cleared. Texture copying and camera-pass completion precede publication of `is_offscreen = 1`. Only the saved orthographic planes are explicitly restored after the loop.

### Screen-edge display

The display callback processes render code 0 only; other codes return without drawing or releasing arrows. For an admitted display, centered fighter screen coordinates determine rotation and a point on the rectangle bounded by X = ±252.70001 and Y = ±162.7. Edge values are 1 top, 2 left, 3 bottom and 4 right. Left/right comparisons take priority at corners; a zero input vector follows the bottom branch. The point is scaled into model translation. Horizontal edges request player/team-colored arrows, while code-zero paths without a horizontal request release the slot's arrow.

The direction getter masks the cached edge with the capture flag; it does not recompute direction. Capture publication and edge assignment are separate operations, so a zero result is not independently proof of inactivity, and an exposed edge can be stale. The Boolean getter directly exposes capture publication to fighter code. Magnifying-damage accumulation, reset and application occur in the fighter caller under additional fighter, camera and damage-percent guards.

### Visibility and lifetime

Hide/Show are supported names for inverse all-slot suppression commands used by aggregate HUD dispatch. They preserve display resources and do not immediately update published capture flags. Show merely permits otherwise eligible capture.

The removal callback is a no-op registered against persistent player-array storage; generic GObj user-data removal invokes it and then clears the registration. Player cleanup removes and nulls six retained display GObjs, but does not explicitly reclaim the capture camera or separately allocated image buffers. Initialization clears old owner pointers before construction, so it is not a demonstrated safe replacement for teardown.

### Semantic review

Most existing names and explanations fit canonical behavior. Proposed corrections preserve exceptional render-code behavior, cached numeric-state ambiguity, guarded damage-counter behavior and the narrower player-display cleanup scope. Source-visible object types and uses are supported, but compiled section placement and literal-pool composition remain unverified. The rendered header leaves `ifMagnify_802FB73C` unchanged because of `shadowed_binding`, despite substituting its proposed name in the C file; this is a renderer issue, not evidence against the name.

Status: synthesized; independent review and live promotion pending.
