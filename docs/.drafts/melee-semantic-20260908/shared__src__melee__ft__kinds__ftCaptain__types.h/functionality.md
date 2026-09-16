## Captain type declarations

`src/melee/ft/kinds/ftCaptain/types.h` defines data types rather than executable move behavior.

- `ftCaptain_FighterVars` declares two `u32` fields, `during_specials_start` and `during_specials`, followed by a byte array sized `FIGHTERVARS_SIZE - 8`. Their names suggest side-special bookkeeping, but this header does not establish valid values or reset lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.h#L11-L15)
- `ftCaptain_DatAttrs` declares attributes grouped by neutral, side, up and down specials. Existing descriptive names concern input ranges, angles, velocity, gravity, landing lag, traction and related modifiers; other fields remain explicitly unknown. Declarations alone do not verify the runtime interpretation or units of those names. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.h#L17-L53)
- `ftCaptain_MotionVars` is a union with side-special, up-special and down-special alternatives. The side-special alternative contains `grav`; the up-special alternative contains an unsigned 16-bit field, eight one-bit fields, a byte and `Vec2 vel`; the down-special alternative contains two unsigned 16-bit fields, `friction` and a signed 32-bit field. This establishes alternative storage declarations, not transition rules or cross-file initialization lifetimes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.h#L55-L78)

## Semantic review

All 81 canonical and rendered lines were reviewed in the inherited research. The renderer reported zero parse errors and zero substitutions; its function-name-only scope supplies no independent validation of field names. There are no frozen subjects, facts or links to retain or correct. The lead reconciled the hash-bound handoff with both supplied artifacts: the empty proposal agrees with the document, and there are no proposed facts or upstream contradictions requiring targeted source verification. No supported semantic correction or rename emerged.

The deferral of numeric-state meanings, unknown fields, flag-bit semantics and cross-file initialization/reset lifetimes is accepted because declarations alone do not establish those behaviors. Suggestive names are not treated as runtime proof, and source offset comments are not treated as compiled-layout evidence.

Status: synthesized; independent review and live promotion pending.
