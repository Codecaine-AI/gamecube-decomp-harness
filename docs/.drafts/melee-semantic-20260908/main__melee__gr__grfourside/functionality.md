# Fourside semantic review

The unit registers `Gr_Kind_Fourside`, `/GrFs.dat`, three joint mappings and seven Ground-object callback rows. Startup caches the yakumono configuration pointer and initializes objects in order **0, 4, 6, 2, 1, 3, 5**, then configures camera bounds before blast-zone bounds. The indexed installer reports a missing object and returns NULL; startup ignores those results. Common setup invokes initialization synchronously, retains callback3, and schedules recurring processing separately.

Objects 0 and 2 select default animation data. Object 4 additionally changes Ground flags; its root is optionally cached by object 6. Object 6 registers six fog landmarks, caches three model joints, installs the custom renderer and publishes the collision callback. Qualifying collision records increment map 5's transient UFO signal; map lookup occurs before the category test and has no local null guard.

The crane is map object 1. Its eight-state controller alternates animation segments, waits, chooses randomized vertical targets, moves, and settles. Animation argument **7 is a type mask, not animation index 7**. Downward target crossing clamps immediately; upward crossing does not. State 7 reverses and doubles acceleration on directional target crossings and snaps to the target when the strict stopping threshold is met.

The UFO is map object 5, with numeric states **0, 1, 2, 4**. Its appearance decision combines a transient collision signal, an attempt threshold and randomized placement. Placement 2 bypasses helicopter blocking. A successful random test whose selected placement is blocked resets the attempt count but does not reset the expired wait timer. Entry uses a temporary camera pointer; entry completion releases and clears it before invoking the camera helper. State 2 requires both timer expiry and a distinct animation-flag predicate before departure. The departure state carries the existing timer rather than resetting it. Every update refreshes collision and clears the transient signal.

The helicopter is map object 3, not one of two helicopter controllers. It checks the UFO's state and placement before entering or departing. UFO placement 2 is not a terminal phase. No `heli_stay_time` load appears in this controller. Departure completion resets the wait timer, then the unconditional state-3 increment still executes.

The renderer updates three nullable joints only on render pass 1 and when `abs(eye.y) < 0.99`, using yaw multipliers 0.2, 0.4 and 0.7. Normal display dispatch is unconditional. The camera-vector getter supplies a fallback direction on failure; the caller ignores its status. The shadow callback performs a strict fighter-height comparison against a transformed joint origin; delegated origin sampling may prepare the joint matrix.

Supported existing names and explanations are explicitly retained in the checkpoint ledger. Corrections address factual mistakes and useful missing branch detail rather than stylistic normalization. Rendered evidence reports one collision-callback parse uncertainty, a collision between two external animation-predicate names, and two header shadowed bindings. These do not prove or disprove canonical behavior. Source declarations support metadata and configuration semantics, but no compiled section placement, pool composition or padding conclusions are made.

Review accounting: **251 facts = 236 retained, 7 superseded, 8 unresolved; all 56 links retained**. All 88 subjects, including parameter subjects with no facts, were enumerated.

Status: synthesized; independent review and live promotion pending.
