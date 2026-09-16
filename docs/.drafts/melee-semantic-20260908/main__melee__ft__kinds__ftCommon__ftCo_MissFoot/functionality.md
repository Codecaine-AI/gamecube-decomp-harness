# MissFoot backward edge-slip lifecycle

Two observed collision callers enter MissFoot when their support test fails and the ledge-slip side opposes facing: negative facing with RightLedgeSlip, or positive facing with LeftLedgeSlip. The entry itself has no slip predicate. It clears vertical knockback, starts MissFoot at frame0/speed1, clamps horizontal self velocity to air_drift_max, then converts a still-grounded Fighter to air. That helper clears ground velocity and selected Z/Y state, sets one jump used and ecb_lock=10, and marks the collision box locked.

## Callback behavior

Anim invokes ftCo_80090780 only after frames run out. This converts ground state if needed and selects ItemParasolDamageFall when parasol status differs from -1, otherwise state0x26 with flags0x18001 and drift/damage-fall setup. IASA does nothing. Phys delegates to the same aerial helper as ordinary Fall, including fast-fall/gravity and drift. Coll delegates to a routine that selects landing or neutral behavior on accepted contact, otherwise offers wall-jump and cliff handling. Therefore MissFoot is not guaranteed to persist until animation completion.

## Object evidence

Both existing objects contain eight bytes float0/float1, source symbols @88/@89. Source flags are 3; split flags are 2. No blanket read-only characterization is used. Object hashes/ELF metadata and frozen report are included; no build ran.

## Coverage and decisions

C1-44 and H1-13 fully read canonical and rendered. Six targets, source entity and five empty parameter entities are accounted. All 33 baseline facts have ID/version dispositions: 26 retained, seven superseded. Five exact outgoing links retained, three unresolved with current code evidence, with independent ledge-slip support. The three unresolved records additionally assert unverified Debug Mode UI spelling. Four callback names are canonical; MissFoot_Enter remains a supported hypothesis. Header address comments are historical and do not supersede current symbol/report identities.

## Evidence

- ftCo_8009F39C: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L14-L24, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1139-L1154, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1207-L1222, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L447-L460, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525
- ftCo_MissFoot_Anim: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L26-L31, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c#L95-L109, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemParasolDamageFall.c#L14-L20
- ftCo_MissFoot_Coll: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L40-L43, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L624-L639
- ftCo_MissFoot_Phys: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L35-L38, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L203-L206
- ftCo_MissFoot_IASA: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L33-L33, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L40-L43, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L624-L639
- .sdata2: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L17-L19
- src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L14-L24, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1139-L1154, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1207-L1222, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L447-L460, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L525, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L26-L31, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c#L95-L109, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_ItemParasolDamageFall.c#L14-L20, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L40-L43, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L624-L639, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_MissFoot.c#L35-L38, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1363-L1375, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Fall.c#L203-L206

Independent link review defers Debug Mode spelling claims in three exact baseline records. Fact proposal unchanged.
