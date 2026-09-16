## Kyasarin / Birdo controller

This unit implements an eleven-state item controller integrated with Mushroom Kingdom II's Ground subsystem. The header declares the controller callbacks, construction/accessor interfaces, and state table. State-table indices and animation identifiers are distinct: states 0/2/4/5 use animation identifier 0, states 1/3/6 use 1, state 7 uses 2, and states 8/9/10 use 3.

### Movement and firing

Construction can fail and return NULL. On success it stores the stage association in `kyasarin.x20`, initializes accumulated damage, preserves the supplied facing in `x30`, and enters state 0. States 0 and 4 establish facing-directed horizontal velocity; state 2 establishes opposite-facing velocity without turning the model. Their animation callbacks renew the same state when the shared model-animation predicate becomes false. Position-bound callbacks advance states 0→1, 2→3, and 4→6. States 1 and 3 decrement `x24` before testing strictly below zero and then enter states 2 and 4 respectively.

State 4's boundary callback initializes randomized departure and firing countdowns and selects a burst counter of either zero or attribute `x48`. State 6 decrements both countdowns, prioritizing departure over firing if both expire. State 7 computes a facing-relative egg position, forces its Z coordinate to zero, and calls the egg constructor before decrementing the burst counter. Consequently an initial zero counter still permits one emission. A positive remaining counter repeats state 7; otherwise only the firing countdown is reset and state 6 resumes. Exact configured burst counts are not established by this source alone.

Turnaround first selects state 5, then sets model rotation, derives facing from the negated saved spawn-facing value, sets the departure flag, and initializes speed-scaled horizontal velocity. Repeated turnaround setup does not simply toggle current facing. State 5's animation callback only renews its animation state.

### Damage and exceptional paths

Received hit value is accumulated in `x38`. Below the first threshold, the current numeric state is saved in `x3C` before entering reaction state 8 and stopping movement. The intermediate branch changes animation speed and invokes turnaround. The upper branch notifies the stage association if present, flips the actor, and randomly selects state 9 or 10. State 9 receives a camera-directed launch velocity and applies downward acceleration each physics update. State 10 receives shared damage-response velocity initialization but has an empty local physics callback. Its collision helper can request termination after enough qualifying contacts; state 9's collision helper always returns false.

State 8 reconstructs saved states 0–7 rather than merely assigning a state number. Saved value 8 re-enters reaction state and sets its temporary hitbox mode, which the common post-switch tail immediately clears. There is no default switch arm: other saved values receive no state reconstruction, but the same tail still runs. All local animation callbacks return false.

### Cross-file lifetime

The stage stores the constructed item and uses the position accessor to move a separate Ground object with a vertical offset. Terminal damage notification does not clear `kyasarin.x20`; its stage callee operates on map collision. Actual destruction invokes the separate stage cleanup routine and then unconditionally clears the item-side association. The generic two-object event adapter clears matching common interaction references through `it_8026B894`, discards that helper's return value, and does not clear the Kyasarin-specific stage association.

### Semantic review

Most existing names and explanations fit canonical behavior and are explicitly retained in the checkpoint ledger. Proposed corrections distinguish waiting before backward movement from an actual turn, correct turnaround setup order, preserve exceptional recovery behavior, and remove an unsupported table-byte-layout assertion. Compiled small-data pool claims remain unresolved. The rendered header suppresses the supported Spawn substitution as `shadowed_binding`; that rendering issue does not invalidate the canonical construction semantics.

Status: synthesized; independent review and live promotion pending.
