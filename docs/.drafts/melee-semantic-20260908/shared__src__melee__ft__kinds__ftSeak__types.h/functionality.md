## Sheik shared type declarations

`src/melee/ft/kinds/ftSeak/types.h` declares shared data types, not executable behavior.

- `ftSeak_FighterVars` contains an integer, an item-object pointer, a generic object pointer, two four-element `Vec3` arrays, and `lstick_delta`. The header alone does not establish pointer ownership or lifetime, or the roles of the unnamed fields. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/types.h#L11-L18)
- `ftSeakAttributes` declares predominantly floating-point attributes, including `self_vel_y`, with integer fields `x38` and `x50`. Its size and fighter-offset comments are source annotations, not independently verified compiled layout. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/types.h#L20-L52)
- `itChainSegment` declares 21 floating-point fields, without explaining their individual roles. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/types.h#L54-L76)
- `ftSeak_MotionVars` provides union alternatives named `specialn`, `specials`, and `specialhi`. These contain distinct typed field declarations, including an `enum_t` and Boolean in `specialn`, three floats in `specials`, and `Vec2 vel` in `specialhi`. No numeric-state meanings, active-member transitions, or initialization and cleanup rules are defined here. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/types.h#L78-L122)

## Semantic assessment

All 125 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; it introduces no alternative names to assess. Subject and link enumeration both returned empty baselines. No supported correction or sufficiently established field interpretation warrants a proposal; offset-style names remain uninterpreted rather than being assigned speculative meanings.

Status: researched; no-change lead bypass; independent review and live promotion pending.
