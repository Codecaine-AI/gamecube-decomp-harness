# Demo mode 14 fighter adapters

Draft at `c302741689bd67c361cd7faadb221df3193992c3`.

`ftCo_800C739C` is callback 14 in demo fighter creation. That creator sets the common-table length to 14, installs the demo common table and per-character alternate table, then invokes the selected callback. Kirby enters numeric state 17, so the motion resolver indexes Kirby extension entry 3. That entry uses JumpB and registers `ftCo_800C7414` as physics. Other fighters delegate to state 13, the common demo Run entry. The source spells these IDs WalkFast and RebirthWait, but those enum names do not describe the alternate-table animations.

Both entry paths request flags 0, frame 0, speed 1, blend 0 and NULL alternate source, then set x2219_b2 and x2219_b1. The three local inline functions form a forwarding chain only. `ftCo_800C7414` unconditionally forwards gobj to `ft_8008521C`, which sets each self_vel component to model-root translation minus cur_pos. No local timers or additional guards exist.

The paired header agrees with both definitions. Both existing object files contain an eight-byte .sdata2 with IEEE float 0 and 1; the report hash equals the frozen manifest hash. No build was run. These literals configure the Kirby entry call; they are not independent gameplay data.

## Canonical evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C739C.c#L9-L42
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C7070.c#L1-L13
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L157-L167
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L368-L380
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L42-L138
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirby.c#L2463-L2504
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L853-L883
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1177-L1181
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1370-L1374
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/forward.h#L292-L308
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L3887-L4028

Independent-review deferral: source inferred_type fact766a2954-190c-4e4e-9765-8a01207373bc is unresolved because its RebirthWait helper wording conflicts with active demo-table semantics. The fifteen-write proposal is unchanged.
