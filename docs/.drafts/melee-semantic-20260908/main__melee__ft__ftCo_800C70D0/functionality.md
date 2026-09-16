# Mario/Luigi Wait selection and model displacement callback

This unit exports two void callbacks taking a Fighter_GObj. It has no mutable local storage and one eight-byte constant pool.

## Entry behavior

`ftCo_800C70D0` reads Fighter.kind. Mario and Luigi select `ftCo_MS_Wait`; every other kind follows three source-only inline forwarding wrappers to `ftCo_800C7070`. That dependency selects `ftCo_MS_RebirthWait`. Both branches call Fighter_ChangeMotionState with zero flags, frame zero, speed one, zero blend and NULL alternate animation source, then set x2219_b2 and x2219_b1 true. The fallback returns before the direct branch runs. There is no local timer, validation, or ground-state check. The verified caller is demo constructor callback9. It replaces motion tables before dispatch; canonical state names do not establish passive gameplay or respawning.

## Velocity callback

`ftCo_800C7158` forwards its unchanged object to `ft_8008521C`. The helper reads its model JObj translation and overwrites self_vel.x/y/z with translation minus cur_pos, component by component. It does not add to prior velocity, modify cur_pos, or divide by elapsed time. A valid Fighter and JObj are expected by the dependency.

## Constant section

The existing PowerPC object has two four-byte .sdata2 symbols, @97 at offset zero and @98 at offset four. Raw bytes are 00000000 3f800000, or float zero and one; ELF flags are allocated but nonwritable. The frozen report confirms the eight-byte contribution. These values are the direct branch's motion-change constants. Object metadata, raw symbols/contents and report slice are included; no build ran.

## Coverage

C1-45 and H1-10 were fully read in both canonical and rendered forms. Dependency C1-14 of ftCo_800C7070 and ftdata C157-172 were also read both ways. All pages parsed without errors and needed no name substitution. Eight baseline facts are retained; ten are superseded after demo-table reconciliation. No names are proposed. Source entity and both empty parameter entities are accounted for in coverage.json.

## Canonical evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C70D0.c#L24-L39 — Mario/Luigi Wait branch, fixed parameters and flags.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C70D0.c#L9-L22 — Three inline wrappers forward to fallback.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C7070.c#L7-L13 — Fallback enters RebirthWait and sets identical flags.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C70D0.c#L41-L44 — Unconditional companion forwarding.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L157-L167 — Self velocity is joint translation minus current position.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C70D0.h#L4-L9 — Both exported void fighter-object signatures.

## Demo table reconciliation

ftdemo.c42-70 and123-125 establish callback9 and replacement tables. fighter.c1177-1181 indexes those active tables. The ten refined facts distinguish canonical motion constants from runtime animation meaning. The original all-retain packet is superseded.
