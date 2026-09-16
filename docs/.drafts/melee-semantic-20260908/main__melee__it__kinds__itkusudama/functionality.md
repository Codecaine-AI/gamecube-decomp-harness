## Kusudama / Party Ball

The unit defines a nine-state item implementation and its public declarations. Numeric state indices are distinct from the animation IDs stored in the dispatch table.

| State | Canonical behavior |
|---|---|
| 0 | Settled: entry clears velocity and sets facing-adjusted quarter-turn X orientation; animation maintains orientation, physics is empty, and collision can enter state 2 on lost support. The shared collision helper also has a separate removal branch. |
| 1 | Pre-opening wait: command variable 2 equal to 1 is changed to 2 before randomly selecting sound 0x127 or 0x128. Nonzero command variable 1 enters state 8. Orientation updates still execute on that transition frame. |
| 2 | Ordinary fall: maintains quarter-turn orientation, applies configured fall physics, and supplies state-0 setup to the guarded landing helper. |
| 3 | Activation ascent: initializes vertical velocity and private countdown from attributes, clears X/Z velocity, and sets the activation latch. Countdown expiry or environment mask 0x6000 stops all velocity and enters state 1 while preserving Y rotation. The transition writes private x4=90, but state 1 does not locally decrement that field. |
| 4 | Held: entered by pickup; animation returns false, physics is empty, and the collision slot is NULL. |
| 5 | Thrown: shares animation and falling physics with state 6. Ordered collision predicates either activate the ball or, on the middle branch, clamp positive vertical velocity to zero. |
| 6 | Dropped: qualifying contact compares absolute vertical speed strictly against attribute x2C. Greater values invoke weighted activation; equality and lower values settle into state 0 with facing-adjusted X rotation. |
| 7 | Alternate terminal activation: clears planar velocity and sets the activation latch. Its animation callback decrements shared xD44_lifeTimer, initialized from common attribute xF8—not the separately written private x4=40. Physics and collision are inert. |
| 8 | Content-release state: initializes private x4=85 and clears planar velocity. Each asserted command variable 0 is consumed before content generation and two effects on bones 3 and 5. The countdown decrements independently on every animation invocation, including the release frame, and completion occurs at zero or below. |

The explicit constructor builds an It_Kind_Kusudama descriptor, checks creation failure, and applies settled-state setup on success. The Spawned lifecycle callback instead clears five runtime fields and enters state 2; these are distinct initialization responsibilities.

Activation consumes one random draw over four configured weights. The first three cumulative ranges select ascent; the fourth selects the alternate terminal branch. Event callbacks enforce the private x0 activation guard, but the shared activation helper itself does not. DamageReceived additionally requires xC9C >= attribute x20. Shield and reflection delegate to Clanked; the local reflection callback does not establish what generic reflection processing does elsewhere.

Content generation has two preliminary external special-spawn paths that can return before ordinary selection or owner reporting. Otherwise disabled Food receives zero weight. The configured branch uses attribute kind/count, Food attempts 10–14 spawns, and assorted contents attempt 3–4. Initially unavailable configured contents reroll across Food and random outcomes. Only mid-loop M-Ball unavailability fills the remaining configured attempts with random items; allocation failure does not cause that fallback. The eligible-owner callback receives the result array and attempt count, not a compact successful-spawn list. The local array has 15 entries, but configured count is not locally bounded to that capacity. The random helper lacks an explicit return when its selected kind is -1.

Existing supported knowledge is explicitly retained in the checkpoint ledger. Corrections distinguish the alternate terminal state from pre-opening, repair timer and spawn-reporting claims, and resolve the rendered Fall_Anim/Fall_Phys collisions by naming the shared state-5/6 callbacks ThrownDropped_Anim/ThrownDropped_Phys. The header's spawn declaration remains a renderer shadowed_binding issue. Source declarations and the conditional sdata2 ordering hack do not establish compiled section placement or composition.

Status: synthesized; independent review and live promotion pending.
