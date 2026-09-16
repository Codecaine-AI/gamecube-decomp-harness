## Big Blue Route semantic review

Completed independent lead reconciliation of the hash-bound research, all proposed fact citations, and all reported contradictions. Recovery enumeration is complete: all canonical and rendered pages of the owned C file and header, all 82 frozen subjects, all 245 facts, and all 73 links were delivered. Every baseline ID is accounted for by the adopted research ledger: 226 facts retained, 12 superseded, and 7 unresolved; 72 links retained and 1 unresolved. The proposal contains 12 supported fact changes and no link, entity, merge, or follow-up proposals. No additional lead overrides were needed.

### Registration and lifecycle

The module registers a 38-row Ground callback table with active rows 0, 1, 4, 31, and 32. Stage initialization caches Yakumono parameters, creates components 0, 32, and 31, initializes camera and blast-zone bounds, and constructs the initially hidden Big Blue warning interface. Controller 31 queues construction of car component 4; the shared Ground queue executes this work after stage `on_start`. Demo initialization conditionally destroys component 31 and unconditionally requests component 1. Existing indexed callback names and inert-callback explanations remain supported.

### Route objects and scheduling

Component 4 constructs 30 model objects, retains three splines, and allocates a zeroed 0x554-byte block representing 31 route records. The first activation selects warning-only entry 30; subsequent activations select inactive ordinary entries 0–29. The scheduler checks its total activation limit before post-decrementing the countdown. Ordinary delays use integer-converted parameter bounds with an exclusive upper endpoint when unequal.

The existing inferred name `grBigBlueRoute_SpawnRoute` collides with the canonical inline helper. The proposed replacement, `grBigBlueRoute_UpdateSpawnScheduler`, distinguishes the scheduling wrapper from entry setup. Exhaustion is not safely handled: the helper writes the selected entry's special flag before checking whether the selector returned -1.

### Movement and feedback

Active records follow numeric states 1 → 3 → 0 → 2 → 1. State 0 follows the road splines; state 1 follows an offset airborne spline; states 2 and 3 blend positions between them. Transition rotations are not interpolated: state 2 retains road rotation and state 3 retains airborne-frame rotation. The airborne offset follows the rolled frame-up axis, not necessarily world vertical.

Only ordinary records write model transforms. The special record instead contributes its computed position to warning behavior. Strict X/Z boxes, not radial distance, control feedback: the larger box gates a stage sound, while the smaller box controls warning activation or repeated loop-quake requests and per-entry probabilistic sounds. Missing P1 fighter, root, or initial child skips the entire movement pass.

### Traversal, resources, and utilities

Controller 31 initializes four track references but updates only the first three in X/Y relative to P1 under its fighter-status gate. Separately, it advances at most one ordered checkpoint per invocation and publishes progress through `stage_info.x6DC`. Ground position resolution can provide fallbacks for missing checkpoint markers.

Cleanup frees `car_info` without clearing its field. Model attachment selects children from a shrinking pool, reparents them beneath destination anchors, then destroys the temporary Ground object; Vi0801 requests 23 models at half scale. The helper does not clamp arbitrary counts to 30.

The camera helper preserves its input, ignores Z, clamps X only below and Y on both sides, and writes shared offsets. The shadow callback applies a strict world-height comparison against joint origin Y minus 3; its delegated origin query may set up a joint matrix. The normalization helper preserves the original magnitude and applies ordered signed-axis repairs. The next-JObj accessor's canonical integer/temp-struct representation remains distinct from its inferred pointer semantics.

### Evidence limits

Rendered names were treated as hypotheses, not proof. Compiled section membership, padding, and retail literal order remain unresolved. Supported existing names and explanations were retained rather than cosmetically rewritten. Broad existing Big Blue links do not establish identity between Adventure BigBlueRoute/F-Zero Grand Prix and versus Big Blue. The BB0C link explanation remains explicitly deferred because it calls the fourth function slot the third callback.

Status: synthesized; independent review and live promotion pending.
