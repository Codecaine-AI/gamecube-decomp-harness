## Celebi item lifecycle

The source defines a three-row `ItemStateTable` for motion states 0, 1 and 2, plus spawn, transition and reference-cleanup helpers. The header exports the spawn callback, two-object event adapter and state table.

- **Initialization:** `itCerebi_Logic23_Spawned` resets facing to 0, enters airborne motion state 0 with effect hitlag callbacks and descriptor 0, then invokes shared Pokémon setup with special attribute 0 as its scale parameter.
- **State 0 — initial appearance:** Animation delegates to shared spawn-scale processing and always returns false. Physics invokes a shared update that performs physics work and tests the appearance countdown before decrementing it. A successful countdown test resets velocity, enters state 1 and spawns synchronized effect `0x472` with scalar 1. Floor contact provides an independent transition route through `it_802D3F6C`; terrain processing restores model scale after invoking that callback. The collision wrapper returns false regardless of terrain results.
- **State 1 — effect-bearing phase:** Entry selects state 1 with animation updates and effect hitlag callbacks. Its animation callback enters state 2 when the model-animation predicate returns zero, but itself always returns false. Physics is empty and collision returns false without inspecting the object.
- **State 2 — departure:** Setup installs effect hitlag callbacks, assigns X velocity from either attribute 1 or its negation, and assigns Y velocity from attribute 2. Physics adds attribute 3 to Y velocity on every invocation without a clamp. Animation returns true only when stored item Y is strictly greater than the top blast-zone coordinate plus camera Y offset; equality continues. Collision is inert. Upward flight describes the supported gameplay role, while this source does not constrain the signs of the supplied attributes.
- **Cross-object lifetime:** `it_802D3F4C` forwards both objects to shared reference cleanup and discards its Boolean result. Independent equality checks clear matching owner and interaction references; clearing the fighter reference also resets source-player metadata to 6. This is not a motion transition or scoring operation.

## Semantic review

Existing lifecycle explanations and the EnterAirState, state-1 Enter, state-2 Setup, Fly_Coll and StateTable naming hypotheses remain useful. The rendered `Fall_Anim` name is less accurate than `Spawn_Anim` for the delegated appearance-scale callback. The state-0 physics explanation incorrectly describes a false guard result as a no-op; the guard itself has side effects. The table's three source rows are established, but compiled row sizes, section extent and `.sdata2` contents are not established by source initializers or literals.

Full owned-file, subject and link coverage is inherited from the hash-bound research handoff. The distinct lead independently inspected the canonical and rendered implementation and shared-helper citation ranges for every proposed correction and upstream exception. All 89 retained facts and 34 retained links remain inherited unchanged; no duplicate ledger rows are emitted.

Status: synthesized; independent review and live promotion pending.
