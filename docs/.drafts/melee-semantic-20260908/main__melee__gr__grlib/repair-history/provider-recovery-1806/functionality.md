# Grlib Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 405 owned C/header lines reviewed in canonical and rendered form.

## grLib_801C96E8

Reads arg0->user_data as Ground and returns x10_flags.b4. No local pointer guards or writes; the flag meaning is not established here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L32-L36

## grLib_801C96F8

Calls hsd_8039F05C(0,arg1,arg0). A NULL result is returned unchanged. Otherwise reuses appsrt and clears its xA2, or requests one via psAddGeneratorAppSRT_begin(generator,1). If still NULL, calls hsd_8039D4DC and returns NULL. Success copies *arg2 into AppSRT translation, multiplies each existing scale axis by Ground_801C0498(), zeros all generator pos axes and returns the generator. No arg2 guard; foreign allocation, cleanup and scale-source semantics are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L38-L64

## grLib_801C97DC

Calls hsd_8039F6CC(0,arg1,arg0,arg2) once and returns no value. The two integer arguments are reversed in the callee argument list; no local guard or state write.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L66-L69

## grLib_801C9808

Returns hsd_8039EFAC(0,arg1,arg0,arg2) directly. No local guard, postprocessing or state write; the callee owns creation and attachment semantics.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L71-L74

## grLib_801C9834

Passes arg0 unchanged to hsd_8039D4DC once; no local guard, field write or returned status. Cleanup internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L76-L79

## grLib_801C9854

Passes jobj unchanged to hsd_8039D5DC once; no local traversal or null guard. Descendant selection and generator cleanup semantics require callee evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L81-L84

## grLib_801C9874

ORs 0x80 into arg0->type before passing arg0 to hsd_8039D4DC. No null guard; bit meaning and cleanup internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L86-L90

## grLib_801C98A0

Returns immediately for NULL jobj. Otherwise walks hsd_804D78FC, saving each cur->next before any helper call. For exact cur->jobj matches, ORs 0x80 into cur->type and calls hsd_8039D4DC(cur); nonmatches receive no local writes. No JObj-tree traversal occurs here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L92-L107

## grLib_801C9908

Returns for NULL. At each visited JObj, scans hsd_804D78FC while caching next before calls, marks exact attachment matches with type bit 0x80 and calls hsd_8039D4DC. It processes the current node before testing JOBJ_INSTANCE; an instance stops descendant traversal. Otherwise recurses over each direct child linked by next. It does not traverse the original root sibling list. Cleanup internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L125-L149

## grLib_801C99C0

If flag is nonzero, calls hsd_8039EFAC(0,bank,gfx_id,jobj); if zero, calls hsd_8039F6CC with those same arguments. Discards results and stores no local state. No reserved-bank guard or bank constant is present.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L151-L158

## grLib_801C9A10

Calls Ground_801C2D24 for IDs 0,1,2,3 in order with corresponding grLib_8049EF58 entries, then returns the mutable static cache base. It does not inspect callee results. Values written and missing-ID fallback behavior depend on the resolver.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L160-L167

## grLib_801C9A70

For selector 0,1,2,3, copies the corresponding cached Vec3 into *v. Other selectors execute HSD_ASSERT(290,0), with no fallback index assignment. Does not refresh the cache or guard the output pointer.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L169-L189

## grLib_801C9B20

Reads arg1->count and calls lb_8000FD48(arg0,arg2,arg1->count), then lb_80011710(arg1,arg2), in that order. No local guards or result checks; allocation, descriptor mutations and dynamics interpretation are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L191-L195

## grLib_801C9B6C

Calls lb_8000FD18(arg0) once. Exact source parameter is void*; descriptor cleanup and pool effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L197-L200

## grLib_801C9B8C

Calls lb_8001044C(arg0,0,0,0.0f,0,0,0,0) once. Exact source parameter is void*; solver behavior and the meaning of the zero arguments require callee evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L202-L205

## grLib_801C9BC8

Reads gobj->hsd_obj as HSD_JObj*, calls HSD_JObjAnimAll, then passes its X/Y translations to Camera_SetQuakeOffset. Installed by grLib_801C9CEC for QuakeKind_Loop, which sets AOBJ_LOOP. No local completion test or teardown call.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L207-L213

## grLib_801C9C40

Captures gobj->hsd_obj and its aobj pointer before HSD_JObjAnimAll. After animation, passes JObj X/Y translations to Camera_SetQuakeOffset. Calls HSD_GObjPLink_80390228 if the captured aobj is NULL or has flag 0x40000000. The camera update precedes that test; the aobj pointer is not reloaded after animation. Installed for the Small, Medium and Large quake cases. Flag and teardown internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L215-L227

## grLib_801C9CEC

Maps QuakeKind_Loop, Small, Medium and Large to animation indices 0,1,2,3; other kinds return NULL. A NULL stage_info.quake_model_set also returns NULL. Calls GObj_Create(HSD_GOBJ_CLASS_STAGE,18,(u8)kind), loads the model joint, passes both to HSD_GObjObject_80390A70 and installs the looping or finite local process at priority 1. Adds the selected joint animation with NULL material/shape animations and requests frame 0; only Loop applies AOBJ_LOOP via HSD_ForeachAnim. Returns the GObj. There are no local GObj/JObj allocation-result guards or animation-array bounds checks beyond the kind mapping.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L229-L270

## grLib_801C9E40

Returns stage_info.x708 as int without writes. Counter purpose or consumer behavior is not established by this accessor.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L272-L275

## grLib_801C9E50

Assigns the s16 input directly to stage_info.x708 without guards or validation. The paired getter returns that field; trophy/drop semantics require consumer evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L277-L280

## grLib_801C9E60

For Gr_Kind_RCruise, BigBlue or Icemt, forwards v to grRCruise_80201918, grBigBlue_801EF7D8 or grIceMt_801FA728 respectively, then returns true without inspecting output. Every other kind writes z,y,x to 0.0F and returns false. No v guard; vector meaning and supported-provider effects are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L282-L306

## grLib_801C9EE8

Scans fighters first and returns true on the first PointInsideColl success. Only if none match does it scan items, skipping exactly It_PKind_Random, and test their collision records. Returns false if neither scan succeeds. The local inline compares point X/Y with ECB axis centers translated by cur_pos and half extents expanded by offset; rejects only strict greater-than comparisons, so finite boundary equality is accepted. Z is unused; negative offsets and NaNs are not validated. No object-state writes occur locally.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L340-L369

## .bss

Section ownership, byte size, literal order and physical layout cannot be established from C alone. Source declares a static VecMtx and two static Vec3 objects; exact compiler-section attribution is deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L28-L369

## .sdata

Section ownership, byte size, literal order and physical layout cannot be established from C alone. Source declares a static VecMtx and two static Vec3 objects; exact compiler-section attribution is deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L28-L369

## .sdata2

Section ownership, byte size, literal order and physical layout cannot be established from C alone. Source declares a static VecMtx and two static Vec3 objects; exact compiler-section attribution is deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L28-L369

## file

Shared adapters for generator helpers, a mutable four-entry vector cache, dynamics helper calls, animated camera-quake objects, access to stage_info.x708, stage-kind vector dispatch and a fighter/item X/Y collision query. Local behavior is distinguished from foreign helper and caller semantics.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grlib.c#L28-L369

## Owned Inline Helpers

jobj_child: Returns NULL for a NULL node, otherwise node->child.

jobj_next: Returns NULL for a NULL node, otherwise node->next.

PointInsideColl: Tests Y then X. Each center is the ECB edge midpoint plus cur_pos; half extents add offset. Only ABS(delta)>extent rejects, so boundaries pass for finite ordered inputs; no Z test, extent normalization or NaN handling.

## Header and Read Receipts

The header declares 20 external entry points at lines 13–32. Two quake process functions and three inline helpers are local. The point-query return type is spelled int in the header and bool in its definition; no source edit is proposed.

[src/melee/gr/grlib.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grlib/pages/src__melee__gr__grlib.c.1-200.json)

[src/melee/gr/grlib.c canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grlib/pages/src__melee__gr__grlib.c.201-370.json)

[src/melee/gr/grlib.h canonical/rendered receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grlib/pages/src__melee__gr__grlib.h.1-35.json)
