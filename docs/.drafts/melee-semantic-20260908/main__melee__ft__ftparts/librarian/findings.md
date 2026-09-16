# Ftparts librarian review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. All 1,214 owned canonical lines and separate rendered text reviewed. 143 subjects, 42 target functions, four source-only inline helpers and 96 parameter entities covered. All source bodies/signatures/parameter uses are inventoried in coverage.json.

## Rendering contract

Correction activation tests fighter Z only but builds reciprocal XYZlocal scale conjugated by rmtx. Unit Z clears flag and preserves stale matrix. All helpers share this global state; no zero/inverse guard. Rigid cache miss uses OR; shared cache miss uses AND per slot and rewrites both marks before return. Once shared setup runs, both position blocks run with or without MUST_MATCH. Normal calculations and projection use AND tests; actual normal upload additionally requires current joint lighting. Cache keys omit matrix/rendermode/correction changes.

Envelope palette is capped at10list nodes. First weight>=1 ignores later influences; otherwise it sums unnormalized weighted transforms. Node transform concatenation writes the same mtx aliased by mtxp whenever needed. PObj dispatcher pmtx is position, not projection. Unknown type with correction active does nothing.

## Visibility and hierarchy findings

The cleared latch is shared by selection, show-all and hide-all. Selection sets true even when alternatives remain hidden, so show-all called next can skip unexpectedly. Selection uses ordered writes; duplicate references can overwrite a selected group later. Zero models leaves selection latchfalse while show-all/hide-all still transition it. Changed active selector invalidates only channel0 and does not provide atomicity.

Splice mode0 reparents only the first adopted child; mode2 adopts siblings without fixing parent fields. Active modes dereference root despite conditional reads and never perform reference-count/dirty bookkeeping. New-node topology is not validated. Attachment loads DObj-suppressed interpolation nodes twice and registers with fresh DObj index0; no rollback. Auxiliary DObj collection never writes count and can ascend beyond a non-root supplied node. These are observed source contracts, not source edits.

## Types and naming

Canonical ftPartGetRotZ returns Yrotation in both branches, supporting GetRotY hypothesis already in baseline. ftPartSetRotY directly indexes per-kind slots, without logical Fighter_Part remapping. C and public header outrank the legacy dox: Blend frames/bool getter, void placeholders and several pointer signatures are stale. Header func_800743E0 has no body and shares SetupParts address annotation; no merge proposed. Header pointer-return aliases are shadowed while C render substitutes them. All pages report0parser diagnostics.

## Complete inventory

- `ftParts_JObjMakePositionMtx` (C28–47): Forwards to base make_pmtx, then tests fighter Z override; reciprocal of all three local scales is conjugated by rmtx into shared correction. Unit fighter Z clears only flag. No local current-GObj, zero-scale or inversion-result guard.
- `ftParts_JObjInfoInit` (C49–55): Initializes ftJObj under hsdJObj and replaces make_pmtx. Class-system internals are delegated.
- `ftParts_80073758` (C57–60): Passes supplied JObj and ftJObj to hsdChangeClass; ignores result.
- `ftParts_IntpJObjLoad` (C62–70): Saves descriptor u.dobjdesc, nulls it for base load, restores and returns signed base result; restoration assumes normal return.
- `ftParts_IntpJObjInfoInit` (C72–78): Initializes ftIntpJObj under hsdJObj and replaces load.
- `ftPartsGetSetupFlags` (C80–96): Shadow suppresses all normal/projection requests. Lighting requests NORMAL; reflection/highlight textures request NORMAL plus corresponding projection bit.
- `ftPartsSetupZScaleMtx` (C98–107): Inverse transpose of correction*src when enabled, otherwise src; no inverse-result check.
- `ftPartsSetupNrmMtx` (C109–115): Loads/counts normal matrix only under current JObj LIGHTING, even if reflection/highlight requested its computation.
- `ftPartsSetupTexMtx` (C117–121): Loads GX_MTX3x4 texture matrix at supplied index and increments load counter.
- `ftPartsSetupRigidMtx` (C123–152): Slot0 misses when object differs OR kind differs. Only on miss sets mark/current PN0, loads pmtx, derives normals/projection. Cache key excludes matrix content, rendermode and correction changes. pobj/vmtx unused.
- `ftPartsSetupSharedVtxMtx` (C154–222): Each of two slots misses only when object differs AND kind differs. Both marks are rewritten before early return. Any miss runs both PN0 and PN1 blocks; MUST_MATCH OR conditions are always true, non-MUST_MATCH has unconditional blocks. Actual normal/projection tests use AND. Both normal loads use current JObj lighting.
- `ftPartsSetupEnvelopeMtx` (C224–297): At most10 envelope list nodes. First influence weight>=1 takes direct first-joint path and ignores remaining influences; otherwise sums every weighted joint*envelope transform without normalization. Node matrix concatenation writes mtx which mtxp aliases whenever node exists. vmtx composition precedes upload; pmtx unused. Normal upload requires lighting; projection independent of that upload.
- `ftParts_PObjSetupMtx` (C299–320): Flagfalse delegates base. Flagtrue dispatches skin NULLsecondary to rigid, nonNULL to shared, shape to rigid, envelope to palette. Unknown type does nothing. pmtx is prepared position matrix, not camera projection.
- `ftParts_PObjInfoInit` (C322–329): Initializes ftPObj under hsdPObj, overrides load with lbRefract_PObjLoad and setup_mtx with local dispatcher.
- `ftPartsPObjSetDefaultClass` (C331–334): Installs ftPObj with setter; does not save prior override.
- `ftPartsPObjClearDefaultClass` (C336–339): Passes NULL to default-class setter; no prior override restoration.
- `ftParts_80074194` (C341–390): Binds joint, records six render flags and tree depth. Appends DObjs with124limit and changes nonNULL materials to ftMObj. xD is totalindex-1 or0 even with no local DObjs; flags2_b6 records local presence. Separate128local count assertion.
- `ftParts_SetupParts` (C392–455): Depth-first primary hierarchy walk excluding instance children. Exceptional slots receive NULL without consuming current node. Writes final DObj count; configured count max140 checked before walk and equality after, not per-iteration bounds.
- `ftParts_8007462C` (C457–498): Same omitted-slot/depth-first traversal for animSkeleton into x4_jobj2; no DObj collection/depth write. Final count equality assertion; no initial max140 check.
- `ftParts_8007482C` (C500–507): Sets default ftIntpJObj, loads descriptor hierarchy, clears default toNULL and returns root. Does not restore preceding override. Explicit descriptor-class resolution behavior remains delegated.
- `ftParts_8007487C` (C509–540): Copies model count (assert>11), selects four costume channels with independent costume0fallback, sets fifth NULL and all latchestrue, invokes hide0/1/3/4 on primary and2 on secondary. NULLchannels staytrue; no costume bounds check.
- `ftParts_800749CC` (C542–553): Initializes visibility from fighter descriptor/costume/two lists, sets all prev=-1, then clears all idx=-1 and dirtyfalse.
- `ftParts_80074A4C` (C555–560): Unchecked prev write and dirtytrue even equal; leaves idx and visibility flags alone.
- `ftParts_80074A74` (C562–566): Unchecked return of prev, not current idx.
- `ftParts_80074A8C` (C568–577): Copies every prev to idx and clears dirty. Does not apply visibility or reset channel latches.
- `ftParts_80074ACC` (C579–588): Sets all idx=-1 and dirtyfalse; preserves prev and all DObj/latch state.
- `ftParts_80074B0C` (C590–598): On changed idx only, stores value, dirtytrue and calls hide channel0; other channels stay untouched. No atomicity/concurrency guarantee.
- `ftParts_80074B6C` (C600–627): Requires nonNULLlookup and false latch. In model/group/index order clears flag1 for matching group index, sets for others. Out-of-range/-1 selectsnone. Duplicate DObj references can overwrite earlier decisions; latchtrue inside model loop, zero models leavesfalse.
- `ftParts_80074CA0` (C629–649): Requires nonNULLlookup and false latch, clears flag1 from every referenced DObj and sets latchtrue even zero models. True latch may mean selected-only application, so show-all can skip while alternatives remain hidden.
- `ftParts_80074D7C` (C651–671): Requires nonNULLlookup and true latch, sets flag1 for every referenced DObj then latchfalse even zero models. False latch skips hiding. Latch is shared with selected-only and show-all operations.
- `ftParts_80074E58` (C673–693): Allocates parts and DObj storage without failure checks; only flags8/flagsC cleared for configured count, then b3root/TransN/XRotN/YRotN/HipN/TransN2 and b4TransN/0x35 set. Pointers/count not initialized here.
- `ftParts_GetBoneIndex` (C695–698): Unchecked part_to_joint lookup using fighter kind; input logical part, returned physical slot despite same enum type.
- `ftPartsRemap` (C700–710): Source joint index bounds and INVALIDlogical part checked; returns destination part_to_joint mapping otherwise. No kind/table/destination validity checks.
- `ftParts_8007506C` (C712–728): First matching x0 in kind list returns1<<ordinal; NULL/empty/missing yields0. Shift width/negative table count not guarded.
- `ftParts_800750C8` (C730–759): True applies selection; false hides. Event2 invokes group2 auxiliary callback then group3 primary callback; other events use primary. Callback lookup repeated and notified even helper no-op. No event bounds validation.
- `ftParts_80075240` (C761–794): Flattened TObj chain index across count DObjs, skips NULLDObjs/materials. Returns nth pointer; exhausted/negative index reaches assertion without explicit fallback return.
- `ftParts_80075304` (C800–875): Mode0 adopts old child and reparents only its first node; mode1 prepends sibling child; mode2 adopts old next as child but does not repair adopted parent links; mode3 insertsnext. Active modes require nonNULLroot/new despite guarded old-link reads. No dirty/reference bookkeeping or detached-node validation.
- `ftParts_800753D4` (C877–916): Selects root for x3FF or advances x3 descriptor steps; copies descriptor and strips next/child; loads two independent interpolation nodes; inserts into primary/secondary anchors, registers destination with local DObj index0, depth+1 only modes0/1, marks b2. No rollback/allocation guards.
- `ftParts_800755E8` (C918–927): Removes both joint pointers, nulls both and clears b1/b2. Other bone metadata and DObj bookkeeping remain untouched.
- `ftParts_80075650` (C929–985): Depth-first traversal excludes instance children, collects DObjs from index0 with32limit and changes materials. Can ascend beyond supplied node if it has a parent. Does not write list count; arg0unused.
- `ftParts_JObjSetRotation` (C987–991): Passes Vec4rotation to HSD setter then clears quaternion flag. Header Quaternion typedef compatibility is not independently established here.
- `ftPartSetRotX` (C993–1005): Primary unless quaternion flag then alternate; assert if alternate quaternion; passes Xangle to selected setter; indices/pointers unchecked.
- `ftPartSetRotY` (C1007–1019): Primary unless quaternion flag then alternate; assert if alternate quaternion; passes Yangle to selected setter; logical bone remap not performed.
- `ftPartSetRotZ` (C1021–1036): Primary unless quaternion flag then alternate; assert if alternate quaternion; passes Zangle to selected setter.
- `ftPartGetRotX` (C1038–1049): Primary unless quaternion then alternate with assertion if also quaternion; returns Xangle. Legacy dox Blend frames/bool signature is contradicted.
- `ftPartGetRotZ` (C1051–1062): Despite canonical Zsuffix, both branches call Ygetter and diagnostic saysY; proposed GetRotY is supported. Unused static Zdiagnostic string is separate.

## Dispositions and limits

240 exact facts: {'retain': 101, 'supersede': 11, 'reject': 1, 'unresolved': 127}. 40 exact outgoing links: {'retain': 23, 'reject': 0, 'unresolved': 17}; duplicates and every original field preserved. 12 draft operations. Four sections remain compiled-attribution limited; source object alias is not treated as section identity. External caller/archival/delegated claims are marked unresolved.

Five-file packet mirrored. Dry-run valid: 12 operations, zero rejected/skipped; SHA 5d15db5d09479f67ff211575d50a1217dbb8a06cbf765ffbb05f3289ecd7d750; no source, shared KB, Git, UI or matching changes.
