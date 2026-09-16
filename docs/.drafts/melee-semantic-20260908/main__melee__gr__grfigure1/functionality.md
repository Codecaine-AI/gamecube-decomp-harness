# Figure1 Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 179 owned canonical and rendered lines, 21 functions, two data targets, 20 entities and 118 facts reviewed. 19 empty parameter entities explicitly reviewed. Dispositions {'unresolved': 21, 'retain': 58, 'supersede': 39}; 39 proposed writes, no name changes.

## grFigure1_OnDemoInit

Empty Figure1 on_demo_init callback; ignores its int argument and has no local effect.

## grFigure1_OnInit

Caches Ground_GetYakumonoParam in file-local yakumono_param, clears stage_info.unk8C.b4 and sets b5, requests objects 0, 2 and 1 in that order, then calls Ground_801C39C0 and Ground_801C3BB4. Ignores failed object returns and does not retry or roll back.

## grFigure1_OnLoad

Empty on_load callback; no local effect.

## grFigure1_OnStart

Calls grZakoGenerator_801CAE04 with NULL once, ignoring its return. No local guard or recovery; actual manager allocation and scheduling require callee evidence.

## grFigure1_8020E078

StageData.callback4 returns false without reading state or making calls.

## grFigure1_8020E080

Forms the address of callback-table entry at unchecked signed gobj_id before requesting Ground_GetStageGObj. Nonnull result enters Ground_SetupStageCallbacks; null result reports filename, fixed line value 194 and ID. Returns the lookup result. The shared inline clears Ground x8/xC callbacks, registers GX link 3 with priority 0, stores callback3 if nonnull, invokes on_init, then schedules gobj_proc at priority 4. It does not use callback1 or the table flags.

## grFigure1_8020E168

Object-0 on_init reads Ground user data map_id and calls grAnime_801C8138 with gobj, map_id and zero. Archive animation behavior is delegated; no local null guard or return-value check.

## grFigure1_8020E194

Object-0 callback1 table entry ignores its pointer and returns false. Reviewed setup inline does not install or invoke callback1; table membership alone does not establish a dispatch path.

## grFigure1_8020E19C

Object-0 gobj_proc is empty and ignores its argument.

## grFigure1_8020E1A0

Object-0 callback3 is empty and ignores its argument.

## grFigure1_8020E1A4

Object-1 on_init obtains Ground map_id and the GObj JObj, then calls Ground_801C2ED0 with the JObj and map_id. Collision binding and activation internals are delegated and not inferred from the rendered alias.

## grFigure1_8020E1D0

Object-1 callback1 table entry ignores its pointer and returns false. Reviewed setup inline does not install or invoke callback1.

## grFigure1_8020E1D8

Object-1 gobj_proc calls Ground_801C2FE0 with the same GObj, then lb_800115F4 without arguments. No local guard or field write; exact collision or wind behavior requires callee review.

## grFigure1_8020E1FC

Object-1 callback3 is empty and ignores its argument.

## grFigure1_8020E200

Object-2 on_init calls Ground_JObjInline1. That canonical inline obtains Ground map_id and JObj, calls Ground_801C2ED0, then grAnime_801C8138 with gobj, map_id and zero. It does not check either result.

## grFigure1_8020E250

Object-2 callback1 table entry ignores its pointer and returns false. Reviewed setup inline does not install or invoke callback1.

## grFigure1_8020E258

Object-2 gobj_proc is empty and ignores its argument.

## grFigure1_8020E25C

Object-2 callback3 is empty and ignores its argument.

## grFigure1_OnTouchLine

StageData on_touch_line ignores its enum_t argument and returns NULL. This callback provides no DynamicsDesc; it does not establish absence of ordinary stage collision.

## grFigure1_OnCheckShadowRender

StageData on_check_shadow_render ignores all three arguments and returns true. This hook never rejects a query; actual shadow submission remains the caller's responsibility.

## grFigure1_8020E270

Exported bool-argument no-op. Figure2's canonical StageData uses this symbol for its demo-init entry; Figure1 instead uses its separate int-argument no-op. Shared StageData declares the demo callback void(int), so the exported bool signature is a cross-file type detail requiring owner coordination, not an inferred adaptation.

## Family and Limits

Figure2 repeats three records with flags 0/0xC0000000/0, object order 0/2/1, shared two-call object-1 processing, constant predicates and no-op hooks. Uses distinct Gr_Kind_Figure2 and /GrEF2.dat and reuses grFigure1_8020E270 as demo-init. Similarity establishes structure, not event/visual identity.

Shared types and inlines were read canonically only and are not owned coverage. Physical section attribution, event identity and unreviewed callee internals remain unresolved. No source, knowledge, compilation, matching, publishing or UI changes.
