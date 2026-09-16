## Peach shared type declarations

Fully reviewed canonical and rendered lines 1–84. The rendered view has no substitutions or parse errors; it supplies no independent behavioral evidence. The frozen subject and link inventories are empty, so there are no existing facts, names, or links requiring disposition and no supported proposals.

- `ftPeach_FighterVars` declares float-related state, a forward-smash motion ID, two parasol item pointers, aerial-neutral-special usage state, and Toad and vegetable item pointers. These declarations do not establish pointer ownership, cleanup timing, or why two parasol references exist. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/types.h#L12-L21.
- `ftPe_DatAttrs` declares float animation parameters, a three-entry item-chance table pairing `randi_max` with `ItemKind`, named side-special movement parameters, aerial-neutral-special parameters, numerous placeholder fields, and an `AbsorbDesc`. The declaration does not establish random-selection boundary rules or the meanings of the placeholder fields. The `+1C` table annotation is preserved as a source comment, not treated as verified compiled layout. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/types.h#L23-L66.
- `ftPe_MotionVars` is a union of float-attack, side-special, up-special, and neutral-special structures. Their declared members are respectively a Boolean, a Boolean, an `ItemKind`, and an integer named `facing_dir`. The header does not establish Boolean semantics, integer encodings, active-member transitions, or initialization lifetimes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/types.h#L68-L81.

No factual correction or meaningful naming improvement is justified by this declaration-only evidence. No compiled section or layout claims are made.

Status: synthesized; independent review and live promotion pending.
