## Shrine Route functionality

This unit implements the Underground Maze's six-chamber route controller, not the separate Temple Zelda/Sheik encounter. Its header exports `grSh_Route_StageData`; the descriptor selects `/GrNSr.dat` and seven ground-object callback records. Initialization caches Yakumono parameters, clears two stage flags, creates objects 0, 4 and 2 in that order, invokes common ground setup, and reapplies seven collision-line exclusions. Loading creates lighting controller 6. Starting initializes the Zako generator and conditionally supplies a further entry: x24 == 0 always takes that branch; otherwise the sampled result must be zero.

### Chamber controller and lifetimes

Object 4 clears its state and six retained marker pointers, registers a device-position callback and collision callbacks on joints 8–13, and schedules marker population. One randomly selected slot uses object class 3; the others use class 1. Missing source joints and failed object/JObj acquisition remain guarded. The controller retains these markers until individual encounter entry consumes a marker, spawns an effect, destroys the object and clears its slot.

Numeric state 0 detects an unfinished chamber. Ordinary markers enter states 1–5, which isolate the selected chamber, sequence visual transitions and encounter startup, wait for event status plus both contact latches, record completion, and restore the maze. The special marker selects state 6, which sets stage flag 0x10. Although entry assigns xD0 = 0x3C, no countdown or delay is consumed by state 6 in this source. State 4 has an exceptional unsafe-looking branch: its condition admits xD4 == 0, but the body dereferences that encounter-object reference before the later nonzero guard.

Six monitored joints feed two shared contact latches, xCA and xCC. Primary contact sets xCA and can also satisfy xCC when no usable secondary entity must be awaited; qualifying non-primary contact sets xCC directly. Both are consumed and cleared by the main update. The callback ignores joint_id and does not enforce same-joint or same-slot correlation between contacts. Camera tracking switches between the selected chamber and player/reference position, interpolates using xCE, and moves three retained JObjs using saved camera-relative offsets.

### Presentation and lighting

Object 5 initializes damped, bounded two-axis root rocking and independently rotating child geometry. Child placement and angular increments are randomized initially and when the root hierarchy's animation-rewind predicate succeeds. Existing conservative motion names fit this behavior.

Object 6 finds the scene light GObj, configures its existing chain, caches source lights and flags, then appends two auxiliary lights. The static table describes ten point lights and five spot lights: the expression `LOBJ_FLAGS_B1 | LOBJ_INFINITE` encodes type 3, not an infinite-light category. The recurring lighting process ranks type-dependent distances, enables the first six source lights, computes a weighted direction for the diffuse auxiliary, and copies/attenuates one selected source's color into the separate specular auxiliary. It does not blend multiple source colors. The source assumes sufficient, bounded light counts and valid auxiliary results without enforcing all those preconditions.

The regional device callback rejects states 1 and 3 and otherwise tests a strict scaled X interval below a Y threshold, independently of Z. The touch-line hook always returns a null DynamicsDesc. The shadow predicate compares query height strictly against a joint-derived position.

### Semantic review

Supported callback-role names, inert-hook explanations, marker lifetimes, motion descriptions and most lighting knowledge are retained explicitly in the checkpoint ledger. Corrections address erroneous Temple mappings, collision-line versus joint terminology, encoded light types, the unproved completion delay, two-versus-six contact latches, selected-source color attenuation, and the recurring lighting callback's name. Rendered names were checked against canonical behavior rather than treated as proof. Compiled section residency, exact section layout and retail instruction-order claims remain unresolved because no appropriate compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
