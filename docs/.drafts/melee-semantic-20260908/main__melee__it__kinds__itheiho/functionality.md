## Heiho semantic review

This unit implements the Story stage's flying Shy Guy actor. The stage supplies a formation index, position, shared movement variant and stagger delay. Construction stores these values; initialization optionally creates Food, configures its carried state, chooses inward initial facing and enters motion state 0.

### State machine
- **State 0, animation ID -1:** entry clears horizontal and vertical velocity, leaving depth velocity untouched. Animation and collision callbacks return false without work. Physics tests the delay before decrementing, entering state 1 only on an update that begins at zero.
- **State 1, animation ID 0:** ordinary flight rebuilds horizontal velocity from facing and `attr[x21 + 1]`. Animation samples dynamic bone 1 and can restart the same state, resetting the turn counter and restoring accessory handling. Physics performs the local exit-bounds check. Eligible wall contact reverses facing and starts a 20-update model turn; that branch takes priority over terrain-result reentry.
- **State 2, animation ID -1:** the stronger damage branch initializes randomized horizontal launch adjustment and fixed vertical/depth velocity. Physics applies the common falling helper and refreshes spin from three magnitudes corresponding to approximately 1, 9 or 17 degrees. Animation and collision are inert; no recovery transition from this state appears here.
- **State 3, animation ID -1:** the other damage branch sets a counter to 12. Physics subtracts fall acceleration every invocation, decrements nonzero counters and enters state 4 on the following zero-start update. Collision delegates to the common terrain query and discards its result.
- **State 4, animation ID 2:** entry selects outward facing relative to the camera-offset x coordinate. Exact position equality preserves facing; rotation tests can schedule a 20-update turn. Physics uses 1.5 times ordinary horizontal speed but does not call the local exit-bounds helper. Collision reversal temporarily writes unscaled base speed, and its alternate branch reruns departure entry. Animation configures accelerated child/texture playback and contains two identical above-threshold flag calls.

Both flight states conditionally add upward velocity when `x2C > 960`. This unit initializes x2C and reads it, but no increment producer was found by the pinned-source field search; elapsed-time and reachability assumptions remain unproved.

### Food and model lifetimes
Food creation is nullable. The accessory callback uses actor position and facing, replaces the temporary z coordinate with `-2 * facing`, and delegates variant-relative positioning to Food code. Damage releases Food through activation and Food-state-0 entry, then clears x54 before either reaction branch. Boundary departure instead calls the removal wrapper and clears x54. The accessory callback can remain installed because it checks x54 for null.

The boundary helper first latches entry into the strict horizontal interval inset 20 units from the blast bounds. Only subsequent armed invocations test the four outward 20-unit margins. It sets b3 and removes retained Food; it does not itself change Heiho motion state or destroy Heiho.

The bone wrapper uses x3C as previous translation, not velocity storage. The shared inline overwrites velocity with facing-adjusted, axis-swizzled translation deltas, saves the current translation and clears the bone translation. A null bone is a no-op. The final exported callback delegates common interaction-reference cleanup; that helper does not clear the private Food pointer.

### Semantic outcome
Existing supported knowledge is explicitly retained in the checkpoint ledger. Seven corrections address outward departure, Food lifetime versus bone motion, the rendered collision-name conflict, the exact damage-threshold expression and incorrect attribution of boundary cleanup to state 4. Six compiled-section claims remain unresolved rather than being inferred from source literals. Canonical and rendered views were reviewed completely; rendered names were treated as hypotheses, not supporting evidence.

Status: synthesized; independent review and live promotion pending.
