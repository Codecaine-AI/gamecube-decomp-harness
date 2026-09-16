## Functionality

This unit combines inactive-fighter Sleep lifecycle handling with fighter color-animation playback. `ftCo_800BFD04` unconditionally enters `ftCo_MS_Sleep`, hides the fighter, deactivates its camera subject and sets lifecycle flags. The Sleep animation and IASA callbacks are empty. Creation and transformation callers establish that this is an inactive-entity state, not the ordinary sleep ailment. `ftCo_800BFD9C` performs death-presentation completion: Sleep entry, flag- and null-guarded secondary-entity deactivation, then unconditional game-management notification. Deactivation does not itself free the fighter.

Two three-entry tables dispatch command values 21–23. Primary adapters execute GFX, sound and a refraction-related flag/vibration command; alternate adapters consume these commands without their normal side effects. Dispatchers subtract 21 without bounds checks. The GFX command consumes five records, not six. Sound's recognized behaviors consume three records, whereas its default branch advances twice; the alternate sound handler always skips three.

`ftCo_800BFFD0` routes IDs >=0x7B to x508 and `Fighter_804D6538`, rebasing the ID by 0x7B. Lower IDs use `Fighter_804D653C`, whose `unk5` selects x488 versus x408. Installation is priority-arbitrated and returns acceptance. The final argument supplies a completion countdown; the field named `x4_pri` is not the table priority used for arbitration.

Simple reset wrappers clear x488 or x408 without restoration. The x508 reset conditionally requests ID 0x80, rebased to 5, when x2226_b4 remains set. Motion-transition cleanup resets x488, invokes an optional fighter-kind callback and requests Hammer profile 0x6A when the motion lies within HammerWait–HammerLanding; `Ft_MF_SkipColAnim` bypasses this transition cleanup. Constant-driven unreachable routing branches remain present in source.

Identifier-specific reset selects a controller class, not a check that the supplied profile is currently installed. Its x408 restoration requests are independently evaluated in order: 0x7A, 8, 0x6B, then 9. These are replacement attempts subject to priority, not a queue. Copy similarly selects one whole embedded controller and assigns source to destination; it does not deep-copy command storage. Transformation transfers ordinary controller state and handles cloak lifecycle separately. Reset and copy reject IDs >=0x7B with report/assert/return before controller mutation; neither supplies a negative-index guard.

The update pass advances x508, then x408, then x488. Each completion loop resets and conditionally reinstalls persistent presentation. The numeric test `x408.x28_colanim.i == 0` selects the x488 dispatcher once before its loop. This should not be generalized into a check of all controller activity, nor assumed to be re-evaluated after callbacks. The pass finishes by setting x2221_b3.

## Semantic review

107 baseline facts and 22 links are explicitly retained in checkpoint groups. Three facts are superseded: GFX record count, queue-like restoration wording, and the opaque alternate-dispatcher name. Nine compiled-section facts and one section-membership link remain unresolved because no compiled artifact is available. Source declarations and literals do not prove section sizes, adjacency, padding or generated pool loads.

All owned canonical and rendered pages were reviewed. Rendered names generally fit canonical behavior. The C view suppresses `ftCo_Sleep_Enter` because it collides with the hypothesis for `ftCo_800D4F24`, while the header substitutes it; the local Sleep-entry name remains behaviorally supported. The dox file retains an unknown signature for `ft_800C0098`, despite the C definition and header establishing `void(Fighter*)`.

Status: synthesized; independent review and live promotion pending.
