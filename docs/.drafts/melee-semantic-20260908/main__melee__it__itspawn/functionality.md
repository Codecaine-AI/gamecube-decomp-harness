## Random-item spawning and related queries

`itspawn.c` builds and consumes cumulative weighted item tables, initializes the ordinary random-item process, validates stage positions, submits explicit item requests, and exposes item-configuration queries. The header declares the public routines consistently with their definitions. All owned canonical and rendered pages were reviewed; the existing rendered function names fit their canonical operations and are retained.

### Selection and table construction

`bisectValue` resolves a draw against cumulative lower thresholds; `it_8026C65C` draws using `table->x8` and returns the parallel item-kind entry. The primitive has no empty-table guard. `it_8026C75C` adds a zero-total sentinel and conditionally excludes an unavailable **final** M-Ball bucket, restoring the table afterward. It does not generally filter arbitrary tables for M-Balls, and it does not recheck the shortened total before drawing.

The primary and secondary builders count eligible nonzero entries, allocate parallel arrays, and store thresholds before accumulating each contribution. The secondary range begins at BombHei and receives an already-shifted mask. Totals are calculated separately. Addition of `0.99f` before integer conversion is upward-biased truncation, not a general ceiling operation. Threshold storage is accessed through `u16*`, while cumulative arithmetic uses wider integers; allocation sizes alone must not be mistaken for element widths. The monster builder instead uses four `ItemCommonData.x128` counts and consecutive kinds beginning at Kuriboh; a zero sum leaves its existing table untouched.

### Initialization and recurring operation

Initialization stores the enabled mask before primary validation finishes. Primary success gates secondary/monster setup, callback registration and countdown seeding, but failed setup can already have changed the mask or total. Neither repeated-initialization cleanup nor allocation-failure recovery is provided here.

The registered callback ignores its GObj argument and uses global spawner state. The debug gate pauses countdown processing. Enabled calls decrement once and attempt a spawn only when the resulting countdown equals zero. Selection failure, placement rejection and construction failure all still lead to rescheduling after expiry; only successful construction produces effect `0x420` and the notification. Timing interpolation is assigned to the integer countdown before stage scaling is applied in a second assignment. No positive-minimum clamp is visible.

### Placement, explicit requests and cross-file lifetimes

The placement helper obtains a stage candidate, forces z to zero and applies a collision veto. Rejection after that mutation does not restore the output vector. `it_8026D258` instead copies an explicit position, flattens the copy and submits a stationary, parentless request through the grounded marked wrapper. Its Boolean reports admission under the x60/x64 guard, not constructor success. In `item.c`, paired x60 updates additionally require `gm_8018841C()` and marker `x18 == 1`.

`itdrop.c` consumes the secondary table for ordinary releases and the monster table through the unguarded primitive. The M-Ball occupancy state spans item creation, applicable M-Ball destruction and Pokémon-category accounting; it is not established here as simply a fixed count of visible balls.

`it_8026D324` checks mask presence, stage-table presence and the frequency sentinel before testing a kind bit; it does not inspect that kind's stage weight. `it_8026D3CC` evaluates all three Heart/Tomato/Foods queries without short-circuiting. Lucky stores the result for later egg selection, whereas the Whispy Apple constructor consumes it immediately to gate healing apples.

Finally, `it_8026C47C` builds an active-item presence mask, not an Item Switch mask. Its lookup traverses the active-item list, and the snapshot constructor retains the output in snapshot metadata.

### Evidence limits

The source's adjacency comment and MUST_MATCH literal-order helper document reconstruction intent, not compiled section sizes, offsets or emitted literal order. Those layout claims remain unresolved without compiled evidence. Historical duplicate links are retained individually rather than merged.

Status: synthesized; independent review and live promotion pending.
