# Demo creation slot-7 motion callback

ftCo_800C6150 derives Fighter from its Fighter_GObj and unconditionally calls Fighter_ChangeMotionState with ftCo_MS_Rebirth, Ft_MF_None, frame 0, speed 1, blend 0 and NULL alternate source. It then sets x2219_b2 and x2219_b1 true. There are no local guards, timers, position writes or RebirthWait transitions.

## Verified caller context

ftDemo_CreateFighter selects this function at on_create_fighter[7]. Before dispatch, that caller installs ftData_803C52A0 and the fighter-kind alternate motion list and initializes demo motion data. Therefore the numeric Rebirth label does not establish ordinary post-KO revival-platform transport. Six archived facts imported those mechanics and are superseded. Additional enum/table verification establishes Rebirth=12, selecting alternate demo index12: ftCo_SM_Dash with NULL callbacks. This supports rejecting the two revival-platform links.

## Storage

The existing object and frozen report both attribute eight bytes to .sdata2. Object-local @87 and @88 are consecutive four-byte zero and one float values, raw 00000000 3f800000. The source object has flags3 (WRITE|ALLOC); the original split object has flags2 (ALLOC). A blanket read-only label is unsupported. They supply the transition's zero frame/blend and unit speed. Object/report hashes and contents are included; no build ran.

## Coverage and naming

All 18 C and nine H lines were read canonical and rendered. The same leaf's prior ftdemo C30-129 read is reused at the identical pinned revision. All 15 facts have ID/version dispositions: seven retained, six superseded, two unresolved. Both targets, source entity and empty parameter entity are accounted. The existing ftCo_DemoCallback0 hypothesis remains descriptive and supported by the demo caller, but the C renderer flags a name collision; canonical ftCo_800C6150 remains authoritative.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DemoCallback0.c#L10-L17 — Unconditional numeric Rebirth transition and two flag writes.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_DemoCallback0.h#L4-L8 — Canonical fighter-object signature.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L42-L47 — Callback is slot7 in demo creation table.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L68-L72 — Caller installs alternate motion lists.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L82-L98 — Demo motion initialization selection.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L123-L127 — Creation dispatches selected table callback.

Lead defers the two section data_flow/purpose facts whose Rebirth animation wording lacks active-table qualification. Numeric arguments and zero/one pool remain verified; the six-write proposal is unchanged.

Repair preserves the six-write proposal and independent review record byte-for-byte. Both exact outgoing-link records were checked against the frozen baseline; both remain rejected with enum/table evidence.
