# ftCo_800C7070 Functionality

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete owned coverage is C lines 1-14 and H lines 1-9, canonical and rendered. Immutable pages are linked from coverage.json.

`ftCo_800C7070` takes `Fighter_GObj* gobj`, obtains its Fighter, and calls `Fighter_ChangeMotionState` with RebirthWait, flags 0, animation start 0, speed 1, blend 0, and NULL alternate source. After the call it sets `x2219_b2` and `x2219_b1` true. It has no branches, local timer initialization, direct platform-position write, or return value. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C7070.c#L7-L13.

The paired header declares this exact signature at line 6. The parameter entity `#r3` refers to gobj; it has no existing facts and needs no inferred name. The source entity describes this one-helper unit. Neither include references nor the local use of Fighter assigns this TU ownership of shared types.

Demo creation registers this helper at on_create_fighter slot 8, installs ftData_803C52A0 with threshold 14, and invokes the selected creation callback. Fighter_ChangeMotionState resolves ID 13 through that installed table. Slot 13 selects ftCo_SM_Run and has null state callbacks. Thus the source spelling RebirthWait does not imply respawn behavior on this verified call path. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L42-L70, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdemo.c#L122-L125, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1177-L1181, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L4018-L4027.

The ordinary common motion table does contain RebirthWait callbacks, but their timer and positioning behavior is conditional on that table being installed. Nearby ftCo_800C7220.c dispatchers route non-Kirby fighters through wrappers to this helper. Their enum spellings likewise require the active-table context. No timer or platform position is directly initialized here.

The .sdata2 target supplies the two f32 values 0 and 1. The callee signature identifies start/speed/blend, and lines 1221-1222 store anim_speed into two fields. Existing assembly corroborates an 8-byte read-only pool and reuse of zero for f1/f3. See build-evidence.json and assembly-evidence.s. No build was run; archived report matching percentages are not new validation.

All 12 inherited facts have ID/version dispositions. Five remain supported. Seven facts are corrected for alternate-table semantics. No source names or shared KB records were changed.

## Reviewed final render

Root promoted 7 reviewed fact operations. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C7070/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C7070/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/17fad127a15e9ed8506d28aa9cfe6ac5392237694f4814585ae17eb7eebe4725/2026-09-08T15-05-26.700Z-9de21f50-11e4-4925-8f06-dbe2d019758f.receipt.json). Final-render SHA256: `6ed37089cbf489e5a284e06ad36e36f2631bf610e67edad26a5af7d66a1052cc`. Canonical source unchanged.
