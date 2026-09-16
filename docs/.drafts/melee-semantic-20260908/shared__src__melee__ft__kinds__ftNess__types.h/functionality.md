## Ness shared type declarations

`src/melee/ft/kinds/ftNess/types.h` defines fighter-specific storage, move-state storage, and special attributes; it contains no executable behavior.

- `ftNess_FighterVars` declares Yo-Yo, PK Flash, PK Thunder, and bat object pointers, a Yo-Yo hitbox position, an unnamed float, and a `u32` tentatively described as a PK Thunder graphics flag. These declarations do not establish object ownership or cleanup lifetimes. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/types.h#L12-L21)
- `ftNess_MotionVars` provides union alternatives for up/down smash, PK Flash, PK Thunder, and PSI Magnet. Members describe animation/release timers, gravity delays, collision vectors, movement values, and flags. The header leaves several meanings uncertain: charge-disable polarity, ground/air timer names versus loop/extra-loop comments, numeric collision/GFX states, and purportedly unused fields cannot be resolved from declarations alone. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/types.h#L23-L102)
- `ftNessAttributes` groups parameters for PK Flash, PK Fire, PK Thunder and its self-hit phase, PSI Magnet, Yo-Yo smashes, and bat reflection. It includes absorption and reflection descriptors. Comments describe exceptional zero-landing-lag behavior and ground knockdown/surface-bounce choices; these remain source annotations, not independently verified runtime conclusions. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/types.h#L104-L178)

## Review outcome

All 181 canonical and rendered lines were reviewed. The renderer reports zero substitutions and zero parse errors, and leaves fields and comments unchanged; it supplies no independent support for their semantics. Subject and link enumeration both returned empty baselines. No supported factual correction or meaningfully better name is established, so the proposal is empty. No compiled layout, section placement, or verified byte-offset claims are made.

Status: synthesized; independent review and live promotion pending.
