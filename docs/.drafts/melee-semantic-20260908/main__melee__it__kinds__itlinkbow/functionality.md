## Link-family bow article

This unit implements the attached bow prop, not the fired arrow, for Link, Young Link and their Kirby-copy variants. `it_802AF1A4` creates the requested item, returns NULL on failure, and on success clears four command variables and flag b3, caches owner-derived scale and the original fighter reference, and delegates attachment to the requested fighter part. The existing proposed name `itLinkBow_Spawn` fits this behavior.

The state table has six active rows, indexed 0–5, sharing animation, physics and collision callbacks. Row 6 has animation ID -1 and separate terminal callbacks. These numbers must not be conflated: -1 is not the terminal row's motion-state index. The identity map is `{0,1,2,3,4,5,6}`; the counterpart map is `{3,4,5,0,1,2,6}`.

`it_802AF32C` requires a retained original owner equal to the current owner. For supported bow kinds it obtains the native or copied neutral-special phase, leaves an already matching state unchanged, preserves the animation frame when changing from its mapped counterpart, and otherwise changes state without restoring the old frame. Pickup initializes Start directly, maps both AirStart and None to AirStart, and reapplies cached uniform scale. Other classified phases are unchanged. Both routines leave their phase variable uninitialized for unsupported item kinds; their default branches are not safe general-purpose fallback handling.

The active animation callback first reapplies scale. Current states 2 and 5 notify fighter-side destruction cleanup and return true at frame exactly zero or at least 24; otherwise they skip synchronization. Other states invoke synchronization. Subsequent checks return true for a missing retained owner, ownership mismatch, or a nonzero fighter lifetime predicate. Native and copied predicates account for both move phase and the controlling x2071_b6 flag. Active collision merely reapplies scale and returns false. Both physics callbacks are empty; terminal animation and collision return true without inspecting the object.

Destruction notification clears fighter-side bow tracking through variant-specific helpers; it does not itself delete the item. The separate null-safe removal wrapper delegates to the generic item routine. Native and copied fighter callers also clear their own retained bow handles after calling that wrapper. The event callback only forwards two object pointers; its visible triggering event remains unspecified.

## Semantic review

All owned canonical and rendered pages, all 33 subjects and all 52 links were examined. Existing supported knowledge is explicitly retained in the checkpoint ledger. Three factual explanations are corrected: active callback scope, precise active lifetime behavior, and terminal index versus animation ID. Four compiled-layout facts and four .sdata-attribution links remain unresolved rather than being certified from source switches, literals or address-like names.

The renderer reports no parse errors. The C definition substitutes the supported spawn hypothesis, but the header declaration remains unchanged with `shadowed_binding`; this is a rendering limitation, not contradictory source behavior. Rendered external helper names were not treated as independent proof.

Status: synthesized; independent review and live promotion pending.
