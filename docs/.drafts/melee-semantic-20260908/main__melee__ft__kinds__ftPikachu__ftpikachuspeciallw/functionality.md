## Pikachu Thunder: fighter-side state machine

The unit implements paired grounded and aerial Thunder phases: startup states 359/363, waiting states 360/364, self-contact states 361/365, and ending states 362/366. Entry clears command and throw state, initializes the shared control word to 1, clears the tracked article slot, and performs animation setup. Startup completion installs the damage and article-spawning accessory callbacks.

Waiting gives termination priority: control value 3 or nonzero command variable 0 enters End before testing contact. Damage instead writes control value 0, disabling contact detection without directly selecting End. Accepted contact requires a non-null tracked article, nonzero control, strict attribute-defined horizontal and vertical bounds, and zero article contact status. Acceptance mutates the article before returning true; the fighter enters its hit phase and spawns effect 1216. Aerial acceptance additionally assigns attribute xB4 to vertical self-velocity.

The accessory callback gates effect 1219 and article creation on the throw event and an empty tracked slot. It supplies velocity (0, xC0, 0), not a proven upward velocity. The article constructor initially creates stationary, delayed segments and later applies the supplied vector. It returns the first allocation result; later allocations may succeed even when that result is null. Successful tracking suppresses duplicate creation, but the accessory callback is not intrinsically one-shot.

Ground/air conversions retain the current animation frame and corresponding phase flags. Loop0 conversions restore its callbacks; airward conversions clamp drift. Grounded physics delegates to common friction and movement, including speed-dependent friction scaling. Ordinary aerial phases use common gravity and air friction; aerial hit physics instead supplies xB8 to the fall helper. Ending animation completion enters Fall in air or the common grounded completion dispatcher, whose exceptional branches must not be collapsed to unconditional Wait.

The Thunder article stores its fighter owner. Eligible leading-segment destruction writes fighter control value 3; eligible terrain impact requests a small quake at the fighter position and guarded controller feedback. The owner-property predicate retains its exact numeric membership test. Item-side reference cleanup can clear the stored owner; the fighter setter itself does not clear the tracked article pointer.

## Semantic review

The inherited research covers complete canonical and rendered C/header views, all 82 baseline subjects, and all 95 links. The distinct lead independently inspected every proposed fact's canonical citations and reconciled all upstream non-retain dispositions. Rendered names were treated as hypotheses, not independent proof. Existing supported phase/direction names, damage and destruction callback names, contact-helper name, impact-feedback name, unchanged explanations, and all baseline links are retained. Five factual explanations are corrected. Three .sdata2 facts remain unresolved because source literals cannot establish compiled pool placement, alignment, addresses, or word order. No source or knowledge-base writes were performed.

Status: synthesized; independent review and live promotion pending.
