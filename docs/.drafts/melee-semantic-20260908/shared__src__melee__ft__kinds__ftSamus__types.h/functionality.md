## Samus shared type declarations

`src/melee/ft/kinds/ftSamus/types.h` defines character-specific data containers, not executable behavior:

- `ftSamus_FighterVars` contains two `Item_GObj*` fields and signed, unsigned, and byte-sized scalar fields. Their offset-based names do not establish item identity, ownership, or lifetime ([canonical lines 14–28](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/types.h#L14-L28)).
- `ftSs_DatAttrs` declares mostly offset-named attributes, including floating-point and integer values, a `Vec3`, `ftCollisionBox height_attributes`, and an `UNK_T` field. Source offset comments are not independent compiled-layout evidence ([lines 30–77](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/types.h#L30-L77)).
- `UNK_SAMUS_S1` groups joint, animation-joint, and material-animation-joint pointers. Its comment only tentatively associates it with Samus's grapple; that uncertainty should remain ([lines 79–85](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/types.h#L79-L85)).
- `ftSamus_MotionVars` overlays several state-specific structs. The charge-shot member declares `x4` as `s32`, while the grapple member declares `x4` as `float`; comments describe these as a frame counter and duration respectively. This type distinction is explicit, but runtime interpretation requires consumer evidence. The remaining numeric state names are unresolved, and `unk7.x0` is floating-point rather than the signed integer used in `unk2`, `unk5`, and `unk6` ([lines 87–121](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSamus/types.h#L87-L121)).

## Review result

All 124 canonical and rendered lines were reviewed. The renderer reported zero substitutions and zero parse errors; there are no rendered naming changes to validate. Exhaustive subject and link enumeration returned no baseline records. No supported correction or meaningful naming improvement is established by this declaration-only evidence, so the proposal is empty. No runtime branch, cross-file lifetime, or compiled-layout claims are inferred.

Status: synthesized; independent review and live promotion pending.
