## Ness shared motion declarations

`src/melee/ft/kinds/ftNess/forward.h` defines composed motion-flag constants and separate motion-state and submotion enums. It contains no executable callbacks or resource-lifetime implementation.

### Motion flags
The smash-attack masks share `SkipHit`, `SkipRumble`, `SkipItemVis`, and `FreezeState`. Up smash adds `KeepGfx`; down smash additionally adds `KeepFastFall`. Their start variants add `KeepSfx`. Side smash instead extends the base with `KeepFastFall`, `KeepSfx`, and `SkipColAnim`. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/forward.h#L7-L22)

Special masks share `SkipModel`, `SkipItemVis`, `UnkUpdatePhys`, and `FreezeState`. Down special adds `KeepColAnimHitStatus`; neutral, side, and up specials inherit `SkipThrowException`, with different fast-fall and graphics additions. Air variants add `SkipParasol`; down-special loop masks add `Unk19`. These are symbolic compositions, not proof of the runtime semantics of the unknown bits or of which transitions use each mask. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/forward.h#L24-L58)

### Separate enumeration domains
`ftNess_MotionState` begins at `ftCo_MS_Count`, lists smash and grounded/aerial special states, and computes its local count by subtraction. The list includes aerial up-special rebound and grounded/aerial down-special turn states. Numeric comments annotate some entries but do not assign their values; absolute values depend on the common enum. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/forward.h#L60-L99)

`ftNs_Submotion` independently begins at `ftCo_SM_Count`. It uses neutral-special `Hold0`/`Hold1` names rather than the motion-state enum's `Hold`/`Release` names and has no corresponding down-special turn entries. These differences do not establish a bug or a one-to-one mapping; no mapping table is defined here. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNess/forward.h#L101-L135)

### Semantic review outcome
All 138 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors; it introduces no naming hypotheses to correct. Subject and link enumeration returned no baseline records. No supported correction or useful scoped fact proposal was identified. No compiled placement, layout, or cross-file lifetime claims are made.

Status: researched; no-change lead bypass; independent review and live promotion pending.
