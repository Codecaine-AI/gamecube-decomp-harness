## Purin shared type declarations

`src/melee/ft/kinds/ftPurin/types.h` defines data types, not executable move behavior.

- `ftPurin_FighterVars` declares an unsigned integer, a `Vec3`, an `HSD_JObj*`, a `DObjList`, and `FtPartsVis`. Source comments label their fighter-relative offsets; the header does not establish the object's ownership or lifetime. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/types.h#L13-L19.
- `ftPurin_MotionVars` is a union of `specialhi` (one Boolean) and `specialn` (integer, float, and vector fields, including `facing_dir`). These are alternative union members, not independent storage. The declarations alone do not identify the integer fields' state meanings or transition rules. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/types.h#L21-L41.
- `ftPurinAttributes` contains float and signed-integer fields, `Vec2 specialn_vel`, explicit byte arrays, and two `UNK_T` fields. The source includes `ASSERT_SIZE(ftPurinAttributes, 0x100)`; this is a source-level size requirement, not independently verified compiled-layout evidence. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPurin/types.h#L43-L106.

## Semantic review

All 109 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors, and supplies no independent behavioral evidence. Existing descriptive field names are preserved without expanding them into unsupported behavioral claims. Offset-named fields and unknown types remain unresolved rather than receiving speculative names.

Subject and link enumeration both returned empty results; there are no baseline facts or links requiring retention or correction and no writable subjects. No knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
