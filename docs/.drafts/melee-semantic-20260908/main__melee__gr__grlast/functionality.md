# Final Destination stage implementation

`grNLa_StageData` binds `Gr_Kind_Last`, `/GrNLa.dat`, ten indexed object callback records, lifecycle hooks, and joint metadata. The header exports this descriptor.

Initialization caches yakumono parameters, configures stage flags and camera values, and constructs objects 0–3. Object 3 initializes the background controller and enters state 1. Its deferred startup callback clears `xC4_b0` after the common stage-start hook. Background processing requires both `xC4_b0` and `xC4_b1` to be clear; the common collision and dynamics calls remain outside that guard. The initializer also invokes collision-joint setup, so it should not be described as exclusively background initialization.

The background controller manages six slots for objects 4–9 and cycles through numeric states 1–17. Ordinary progression eligibility tests `xC8 > 1800` before incrementing the counter. Internal stages `0xB0` and `0xFB` instead use selected descending Hand-health thresholds. Eligibility and successor readiness are separate: notably, entering state 3 already sets the advancement flag. Successor tests include distinct AObj flag queries, exact frame equality at 100, material-overlay readiness, and color completion. The argument 7 to the animation queries is a selection mask, not a track number.

Object 7 integrates damped, bounded X/Y angular motion and applies it through the `xDC` rotation multiplier. States 9 and 10 respectively increase and decrease this multiplier. A generator is created in state 9, synchronized from joint 5 only when its pointer and AppSRT exist, then passed to the removal helper and cleared in state 10. States 14 and 17 replace background object groups and clear the corresponding controller slots. Demo identifier 26 conditionally removes objects 4–9 and freezes object 3, but does not locally clear those controller slots.

Color transitions capture current fog RGB, store destination RGB and duration, and clear the color-ready flag. Updates decrement duration before interpolation, apply the target when the countdown expires, and update fog and camera background colors. State 15 selects RGB components from `{0,30}` with a 60–119-update duration. Its rejection expression compares current green twice and never compares current blue. The fog getter's failure result is ignored, and interpolation output initializes RGB but not alpha even though the fog setter copies the complete `GXColor`.

The uniform dark palette is installed in states 1 and 14; the varied palette is installed in state 10. These helpers update nine shared GroundParam colors, four of which are copied by magnifier initialization. Most other indexed callbacks are explicitly inert. The shadow check always returns true, and the touch-line hook always returns NULL without implying absence of ordinary collision geometry.

Supported existing knowledge is explicitly retained in the checkpoint ledger. Corrections address callback-slot misidentification, void versus non-returning terminology, collision participation, animation-mask semantics, material readiness, palette call coverage, and overstrong timing or visibility claims. No compiled section membership or layout conclusions are asserted.

Status: synthesized; independent review and live promotion pending.
