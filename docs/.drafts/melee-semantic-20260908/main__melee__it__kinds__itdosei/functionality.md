## Mr. Saturn item controller

Independent review of all canonical and rendered pages confirms a twelve-state controller for spawning, autonomous movement, held/released behavior, terrain interaction and damage recovery. State indices are distinct from animation identifiers: state 3 has animation identifier -1 and shares state 5's collision callback; state 4 alone has no collision callback.

### State progression and persistent data
- Spawn clears velocity, seeds xDD4 from attribute unk4, clears xDF0, initializes xDE0 to 1, and enters state 8. Qualified landing enters stationary state 7 without reseeding the delay. State 7 decrements positive delay values and enters state 9 only on an invocation beginning with a nonpositive value.
- State 9 initializes phase xDD8 to 1 and angular remainder xDDC to pi/2. Its animation callback subtracts pi/unkC, rotates during phase 1, and sets phase 2 plus horizontal velocity when the remainder becomes nonpositive. It does not reverse facing. Collision processing subsequently enters walking state 1 while preserving the current animation frame. State 9 physics is empty.
- Walking state 1 derives animation rate from floor-normal X and facing; physics uses that rate to update horizontal velocity. Its terrain classification compares abs(floor.normal.x) against pi/4, not a floor angle against 45 degrees. Early turn and failed-support branches remain distinct.
- State 2 restores the saved position and stops horizontal velocity. Animation completion requests state 1 before reversing facing and updating orientation. Its collision callback has a separate xDD8 == 2 walking-setup branch; a producer of phase 2 during state 2 is not established here.
- EnteredAir selects state 10 when x19 is clear and state 6 otherwise, normalizes animation rate and clears ownership. Both physics callbacks are empty. State 6 preserves the pre-helper floor normal for the grounded movement selector. The shared collision helper dispatches support loss immediately, but its supported-contact callback is conditional on x1F/xD5C.
- Damage enters state 11, launches using the declared integer attributes unk10/unk14, seeds xDF0 to 20 and clears ownership. It subtracts 60 life units, then calls a helper that decrements life once more and reports expiry. Qualified landing enters state 0; that state's predecrement countdown eventually resumes walking.

### Lifecycle and combat
Pickup and held-animation refresh preserve separate first-entry and post-state-request orientation guards. Dropped initialization is unconditional; thrown initialization is guarded by msid != 5, while state selection and the xDE0-consuming follow-up are unconditional. Damage-dealt contact-response selection occurs on every invocation; victim bounce and the follow-up helper are state-5-only. Clank and HitShield unconditionally delegate victim bounce. Reflection delegates scaled XY reversal, facing reversal and half-life timer reset. ShieldBounced delegates the shared shield response. EvtUnk forwards two pointers without exposing its triggering event.

### Semantic assessment
Supported existing knowledge is explicitly retained in the checkpoint ledger. Proposed corrections distinguish state 9's preparatory callbacks from steady walking and correct internal-phase and terrain-threshold interpretations. Other broad Fall/Wait names remain supported, although the renderer suppresses colliding substitutions. Source initializers and sdata2_order do not establish compiled section contents. Shared ground handling also contains an exceptional retained-support branch invoking Item_8026ADC0; ordinary support maintenance is not its only possible effect.

Status: synthesized; independent review and live promotion pending.
