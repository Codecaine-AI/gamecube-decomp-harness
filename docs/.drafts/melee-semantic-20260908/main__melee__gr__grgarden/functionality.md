## Garden / Jungle Japes

The unit registers `/GrGd.dat`, seven indexed Ground-component callback records, and the stage lifecycle/query hooks. Initialization caches the Yakumono parameter pointer, sets two stage flags, and constructs components in order **0, 4, 5, 6, 1, 3, 2**. A failed component lookup is reported and returned as NULL; startup ignores those returns and continues. The final sound request requires both stage ID != 62 and `gm_8016B238() == 0`.

The main-stage initializer queues water-device registration. Ground drains and frees that queue after the stage's start hook; the fighter-device registry separately retains the Ground/type/callback tuple until reset. Its single-slot registrar asserts on overflow. Background initialization snapshots six model-joint origins into persistent fog-reference vectors, which the Ground camera path subsequently consumes. Birds and visual water primarily receive default animation and numeric Ground-mode initialization; their remaining hooks are inert.

Cranky Kong uses a four-state animation controller. Updates are gated by two distinct animation-flag predicates, not animation-component availability. Eligible updates decrement a nonzero hold counter or advance the animation state; states 0 and 2 reload randomized holds with explicit zero-bound fallbacks.

Klaptrap initialization stores an item-backed component associated with joint 8 and initializes an idle delay. Controller state 0 decrements any nonzero counter; at zero it requests item state 2, starts animation 0, selects an X position using an **integer-truncated absolute float span**, and enters state 1. Active counts 38/148 and 110/210 request different sounds. Completion requests item state 0, removes animations and reloads the idle delay, but the unconditional final increment still executes: the next idle counter is base + random offset + 1. Other controller-state values perform no switch action. Numeric item-state calls are preserved without deriving their full item-subsystem semantics from rendered names.

The fighter-water callback returns true only below the configured surface and writes the configured horizontal current with zero Y/Z components. On false it leaves the output vector untouched. Splash and sound require a strict crossing from previous Y above the surface to current Y below it. Splash Y is fixed at -30, and scale comes from the fighter camera-subject extent divided by ten. Generator creation failure skips local scaling; success multiplies all three existing application-transform scale components.

The touch-line hook always returns NULL. The shadow hook compares fighter Y strictly against a reference joint's transformed origin. The separate -20 height query is independently confirmed by the camera caller as a pause-camera eye-height floor, not the water surface or splash plane.

## Semantic review

The inherited complete research accounts for 256 baseline facts and 53 links: 245 facts retained, four superseded, seven unresolved; 52 links retained and one unresolved. Supported existing names and explanations are retained without cosmetic rewriting. The lead independently checked every proposed fact's canonical citations and all upstream contradiction evidence, accepting the four corrections without overrides. Compiled literal-section contents remain unresolved because source expressions do not establish section placement, padding or generated conversion constants. Full baseline coverage is inherited from the hash-bound handoff; lead review used targeted canonical and rendered reads.

Status: synthesized; independent review and live promotion pending.
