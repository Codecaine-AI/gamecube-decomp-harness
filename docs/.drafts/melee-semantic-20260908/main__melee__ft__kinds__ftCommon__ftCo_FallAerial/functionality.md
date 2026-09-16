# FallAerial Functionality

Pinned revision: `c302741689bd67c361cd7faadb221df3193992c3`. Complete owned review covers the 36-line C file and 12-line header.

## Entry and Animation

`ftCo_FallAerial_Enter` selects the common FallAerial state, starts animation at frame zero with speed one and blend zero, and initializes the persistent submotion ID and blend value. The final transition argument is a null fighter-object pointer, not a callback. Entry has no vertical-velocity guard. The JumpAerial animation-completion callback is a confirmed caller.

`ftCo_FallAerial_Anim` delegates directional choice to the shared fall helper. It normalizes horizontal velocity by maximum air drift, clamps the ratio to [-1,1], and chooses neutral below or at the common threshold. Above it, velocity relative to facing chooses forward or backward. The target blend scales from the threshold to full drift; x4 updates as `x4 += common.x448 * (target - x4)`. A changed motion is installed only when the updated blend is nonzero. The subsequent helper advances the skeleton and processes its TransN component only for nonzero blend.

Evidence: [entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallAerial.c#L10-L17), [caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_JumpAerial.c#L272-L277), [direction and smoothing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L153-L195), [skeleton update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L90-L102).

## Callback Wiring and Dependencies

The active FallAerial table row assigns this TU's animation, IASA and physics callbacks, with collision supplied by `ftCo_FallAerial_Coll` in another TU. The neighboring FallAerialF/B rows share this IASA adapter but use ordinary Fall animation/physics/collision callbacks.

IASA passes its object unchanged to an ordered short-circuit checker and has no further local action regardless of the returned Boolean. The checker includes independently verified Peach input paths: kind, availability and held-button/stick or nonpositive-velocity conditions can enter Float. Physics makes one unguarded call to `ft_80084DB0`, which checks fast-fall, chooses fast-fall or gravity/terminal-velocity handling, and calls the common horizontal routine.

Evidence: [table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L486-L517), [IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L114-L150), [Peach](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPeach/ftpeachfloat.c#L26-L80), [physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375).

## Data and Names

Both existing objects contain an 8-byte `.sdata2` section, hex `000000003f800000`, representing big-endian floats zero and one. Existing assembly loads these for entry arguments and persistent x4. The frozen report agrees on section size and addresses. This is compiler-owned section storage; no authored global name is proposed. See [corroboration](data-corroboration.json).

The four canonical function names are retained. There are no inherited local inferred-name facts. Foreign rendered aliases were treated as hypotheses and were not used as evidence.

## Review Sources

Each snapshot below contains canonical lines, rendered lines and frozen name metadata.

- [src/melee/ft/kinds/ftCommon/ftCo_FallAerial.c lines 1-36](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_FallAerial/pages/src__melee__ft__kinds__ftCommon__ftCo_FallAerial.c.1-36.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_FallAerial.h lines 1-12](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_FallAerial/pages/src__melee__ft__kinds__ftCommon__ftCo_FallAerial.h.1-12.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_Fall.c lines 90-212](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_Fall/pages/src__melee__ft__kinds__ftCommon__ftCo_Fall.c.90-212.json>)
- [src/melee/ft/ftmotionstates.c lines 486-519](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftmotionstates/pages/src__melee__ft__ftmotionstates.c.486-519.json>)
- [src/melee/ft/ft_081B.c lines 1363-1376](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ft_081B/pages/src__melee__ft__ft_081B.c.1363-1376.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_JumpAerial.c lines 265-279](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_JumpAerial/pages/src__melee__ft__kinds__ftCommon__ftCo_JumpAerial.c.265-279.json>)
- [src/melee/ft/kinds/ftPeach/ftpeachfloat.c lines 1-100](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftPeach__ftpeachfloat/pages/src__melee__ft__kinds__ftPeach__ftpeachfloat.c.1-100.json>)
- [src/melee/ft/fighter.c lines 933-967](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__fighter/pages/src__melee__ft__fighter.c.933-967.json>)
