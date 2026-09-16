# main/melee/ft/ftdrawcommon

Status: TU synthesis complete; independent root review pending.

# Ftdrawcommon semantic review

Pinned `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical and separate rendered C1–450/H1–18 cover468 manifest lines. All renders statusok/exhausted, zero parse errors; C74/H6 substitutions. Proposed names are hypotheses and were checked against canonical functions and relevant callers. Counts: {'owned_files': 2, 'owned_lines': 468, 'targets': 11, 'function_targets': 8, 'writable_subjects': 21, 'parameter_entities': 9, 'existing_facts': 64, 'source_functions': 13, 'source_only_functions': 5, 'proposals': 6, 'dispositions': {'unresolved': 14, 'retain': 44, 'supersede': 6}}.

## Rendering and persistent state

The common callback processes diagnostic geometry before bit7 gates model rendering. Accessories and afterimage remain eligible when the main body is suppressed. The event1 renderer is used by magnify and reflection callers; no lower-resolution asset claim follows from this code. Model-event2 dispatch additionally affects event3. Shadow cleanup and callback reset select defaults; neither saves prior state. Render eligibility may mutate x221F_b0 even when drawing is rejected. Alternate-camera relocation permanently writes cur_pos and root translation from a motion-union overlay.

## Complete function review

### `mtx_thing_2`

`static inline void mtx_thing_2(MtxPtr mtx, Vec3* v, Vec3* v2)`

Writes only matrix translation column as component-wise sum of two Vec3 inputs; all other matrix elements untouched. Assumes non-NULL storage.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L30-L35

### `ftDrawCommon_8008051C_inline`

`static inline MtxPtr ftDrawCommon_8008051C_inline(HSD_GObj* gobj, Vec3* sp54, Vec3* v, Mtx sp18, Mtx sp70)`

Zeros both input scratch vectors, obtains damage XY displacement (Z0), forms identity+translation and computes current->view_mtx times translation into caller sp70. Returns sp70 on success, NULL otherwise; no current-camera guard and no output write on failure.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L37-L52

### `ftDrawCommon_8008051C`

`MtxPtr ftDrawCommon_8008051C(HSD_GObj* arg1, MtxPtr arg2)`

Reads a conditional XY displacement from the Fighter through `ftLib_80087074` and the active camera's `view_mtx` through `HSD_CObjGetCurrent`. On success it initializes a local identity matrix, writes the displacement into its translation column, computes `view_mtx × translation` into the caller-supplied matrix, and returns that matrix. On failure it returns NULL without writing the caller's matrix. The function does not change Fighter state. Its sole behavioral guard is whether either damage-offset component is nonzero: an active offset produces and returns the translated model-view matrix, while two zero components produce NULL and leave the caller's output matrix untouched. The successful path assumes that a current camera object exists. Uses current camera view_mtx directly without forcing refresh. Input/output/current camera must be valid on successful offset path. Signed zero components compare false; nonzero or NaN can trigger it.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L54-L76

### `ftDrawCommon_800805C8`

`void ftDrawCommon_800805C8(HSD_GObj* gobj, s32 arg1, bool arg2)`

Obtains the Fighter from `gobj`, reads its draw-enable bitfield and current collision, dynamics, pickup, visibility, metal/special-appearance, transform, kind, and accessory state, and forwards `draw_pass` to the enabled render helpers. Boolean results from auxiliary renderers are OR-accumulated into `do_invalidate`, which causes `HSD_StateInvalidate(-1)`. For body rendering it selects model-part visibility events, computes an optional display matrix, converts `draw_pass` to a transparency mask, displays the root JObj, and forwards the GObj, pass, and matrix to the fighter-kind-specific callback; the accessory receives the same converted pass with a null matrix. Bits 0 through 6 of `x21FC_flag` independently enable categories of auxiliary fighter geometry, with additional guards for reflector, absorber, shield, damage, thrown-hitbox, and related states. Any enabled helper that reports drawing causes one GX-state invalidation after all categories are processed. Bit 7 gates all later fighter-object rendering. Within that gated path, the main body is skipped when the fighter is invisible, another suppression flag is set, or `draw_body` is false; otherwise normal versus metal/special model-part profiles are selected before display. The accessory and final common attachment path still run when bit 7 is set even if the main body was skipped. Exact diagnostic gates: b6 x914 hit list, hurt capsule override1 whenx221D_b6 else state2 when eitherx1988/x198C==2 else1 when nonzero, plus reflecting/absorb/shield guards; b5 joint markers and dynamics; b3 CPU helper; b4 withx2223_b5 damage helper; b2 pickup rectangles (ground light+heavy, airlight); b1 thrown unlessx2227_b2; b0 x1614 unlessx2229_b4. Reported drawing triggers a single invalidate. Body flags become b2=0,x2227_b7=1,x2228_b0=0. Metal/x2226_b5/x2227_b3 selects event2; ordinaryevent0. Event2 dispatch also affects event3 in ftParts. Accessory and afterimage call execute with bit7 even if body suppressed. No bounds validation for counts, fighterkind or drawpass.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L81-L262

### `ftDrawCommon_80080C28`

`void ftDrawCommon_80080C28(HSD_GObj* gobj, int flag_index)`

Consumes a fighter GObj and rendering-pass selector. It reads the fighter's draw-enable, invisibility, suppression, model-visibility, kind, root-model, and accessory state; switches model events 0, 2, and 4 off and event 1 on when visibility data exists; resets several draw-control bits; and obtains a display matrix from the common matrix helper. The root JObj and fighter-kind-specific callback receive that matrix and the active pass, while the accessory is rendered with a null matrix and the same converted pass mask. Bit7 gates the whole routine. Body additionally requires !invisible, !x221E_b5 and !x2226_b5. Only when x5AC.xC[1] exists does it disable events0/2/4 and enable1; draw flags are still assigned and the body drawn if that table is absent. It clears b2/b3 ofx2223 and x2227_b7, sets x2228_b0. A non-NULL accessory is drawn outside the body guard whenever bit7 is set. Event2 off also dispatches event3 off. No afterimage/auxiliary calls here. Draw-pass conversion indexes the four-entry table [1,4,2,0] without bounds checks.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L264-L308

### `ftDrawCommon_80080E18_inline0`

`static inline void ftDrawCommon_80080E18_inline0(HSD_GObj* gobj, int flag_index)`

If bit7 and !invisible/!x221E_b5/!x2226_b5, disables model events0/1/2, enables4, sets x2223_b2=1 and b3=0, builds optional damage matrix, and displays root. Does not invoke kind callback, accessory, afterimage, or light cleanup.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L310-L334

### `ftDrawCommon_80080E18_inline1`

`static inline void ftDrawCommon_80080E18_inline1(HSD_GObj* gobj, int flag_index)`

Same gated event4 display as inline0, but x2223_b3=1. Leaves persistent model/draw state after display; no automatic restoration.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L336-L362

### `ftDrawCommon_80080E18_inline2`

`static inline void ftDrawCommon_80080E18_inline2(HSD_GObj* gobj, Fighter* old)`

Gets Camera_800310B8 camera (which refreshes its viewing matrix) and inverse viewing matrix; casts &old->mv.co.walk.fast_anim_frame to Vec3*, transforms three consecutive float fields into fp->cur_pos, and sets root JObj translation. Source warns that motion overlay naming may be wrong. The declared fields are fast_anim_frame, slow_anim_rate, middle_anim_rate; do not claim a verified camera-space Vec3 member or preserved logical position.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L364-L377

### `ftDrawCommon_80080E18`

`void ftDrawCommon_80080E18(HSD_GObj* gobj, int arg1)`

Reads the `Fighter` from `gobj->user_data`, fighter draw and visibility flags, model-visibility entry `x5AC.xC[4]`, camera mode, and render eligibility. In alternate camera mode it may transform a fighter-stored vector by the active camera's inverse viewing matrix into `cur_pos` and the root JObj translation; it then selects model event 4, builds draw matrices, converts the draw-pass argument to a hierarchy-render mask, and emits up to three fighter draw operations. In ordinary mode it clears `x2223_b3` and forwards control to `ftDrawCommon_800805C8` with a boolean derived from whether event-4 data exists. x221F_b3 short-circuits the whole call. Otherwise ftLib_80086A8C can mutate x221F_b0 even when it rejects drawing. Mode1 optionally updates cur_pos/root translation when x2220_b7 is set, even without event4 data. If event4 data exists, calls specialized0, common(true), specialized1; each specialized body and its b3 write additionally require bit7 and no invisible/x221E_b5/x2226_b5. Mode0 clears b3 and calls common with draw_body=(event4 data is NULL). Other modes produce no local rendering, but eligibility may already have changed state. Position relocation is a persistent mutation of gameplay cur_pos and root translation; no saved-state rollback. Specialized passes can be skipped while common diagnostics/accessory/afterimage still run.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L379-L401

### `ftDrawCommon_80081118`

`void ftDrawCommon_80081118(void)`

Reads the fighter-list head from `HSD_GObj_Entities->fighters`, follows each GObj's `next` pointer until null, and writes the function pointer `ftDrawCommon_80080E18` into each node's `render_cb`. The GObj rendering scheduler subsequently consumes those callback pointers when drawing fighters. An empty fighter list is a no-op. Otherwise, the function unconditionally transitions every currently linked fighter GObj to the same render-callback state, regardless of its previous callback. Repeated calls are idempotent until another routine replaces those callbacks; newly linked fighters are unaffected until a later invocation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L403-L410

### `ftDrawCommon_80081140`

`void ftDrawCommon_80081140(void)`

Reads `HSD_GObj_Entities->fighters` as the head of the active fighter-object list, follows each GObj's `next` pointer until null, and overwrites every visited object's `render_cb` with `ftDrawCommon_80080C28`. Subsequent fighter rendering dispatches through that callback until another routine replaces it; in the Fountain of Dreams reflection path, `ftDrawCommon_80081118` later replaces every callback with `ftDrawCommon_80080E18`. Empty list is a no-op. Every linked fighter gets the same replacement callback, independent of kind/state. The assignment persists after return and does not save earlier callbacks. The reflection caller later assigns ftDrawCommon_80080E18 through80081118; this is a fixed default assignment, not restoration of arbitrary previous callbacks. No lower-resolution geometry guarantee follows from the setter.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L412-L419

### `ftDrawCommon_80081168`

`void ftDrawCommon_80081168(void)`

Reads the head of `HSD_GObj_Entities->fighters`, follows each GObj's `next` link, obtains its `Fighter`, and checks `fighter->x5AC.xC[1]` for model-visibility data. For each eligible fighter it sends `(event, enabled)` values `(1, false)`, `(2, false)`, `(4, false)`, and `(0, true)` to `ftParts_800750C8`, which applies the corresponding DObj visibility profiles and notifies fighter-kind-specific model-event callbacks. Acts as the restore half of a shadow-rendering state pair. Before shadow work, `ftDrawCommon_80081200` selects event 1 by disabling events 0, 2, and 4; after all fighter shadow renders, this function disables events 1, 2, and 4 and selects event 0. Fighters lacking `x5AC.xC[1]` are left unchanged. Selects a fixed event0 profile rather than saving/restoring prior state. Event2 off also sends event3 off and kind callbacks. Callbacks can have side effects even when table visibility changes are already satisfied.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L421-L434

### `ftDrawCommon_80081200`

`void ftDrawCommon_80081200(void)`

Reads `HSD_GObj_Entities->fighters`, follows each GObj's `next` link, obtains its `Fighter`, and tests `fighter->x5AC.xC[1]` for model-visibility data. For each eligible fighter it sends `(event, enabled)` requests `(0, false)`, `(2, false)`, `(4, false)`, and `(1, true)` to `ftParts_800750C8`; that dispatcher applies the corresponding DObj visibility profiles and forwards the requests to fighter-kind-specific `model_events` callbacks. Acts as the preparation half of a shadow-rendering state pair. Before shadow processing it disables events 0, 2, and 4 and enables event 1 on every fighter with model-visibility data. After all offscreen fighter-shadow renders, `ftDrawCommon_80081168` disables events 1, 2, and 4 and restores event 0. Fighters lacking `x5AC.xC[1]` are unchanged by either transition. Selects fixedevent1, not a state snapshot. Event2 off also sends event3 off and kind callbacks.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L436-L449

## Header, constants, and subject coverage

Header8–15 declares all eight target functions; it adds no inline implementations or parameter names. C26–28 defines writable static U8Vec4 white/blue/gray colors, all alpha128, selected by grounded-light/aerial-light/grounded-heavy pickup regions. The lower helper draws only pass2 and uses Z0; the outer function merely forwards fighter position/facing/pass. C78–79 defines const GXColor white alpha254/255 copied fresh for each dynamics helper call. Zero scratch vectors and matrices are explicit source values; no trailing section-padding interpretation is established. C1–24 imports dependencies. All remaining nonfunction lines are whitespace, source annotations or braces covered in both reads.

Every fact, inferred name, data target, file subject, source-only helper and nine empty parameter subjects was reviewed. Canonical names remain unchanged. .data/.sdata have duplicate item-color attribution in baseline; all14 section facts remain unresolved pending compiled evidence. Six function/file corrections preserve the actual branch and caller conditions.

Exact outgoing links: {'expected': 22, 'reviewed': 22, 'retain': 18, 'reject': 0, 'unresolved': 4}. Lower-resolution, previous-profile restoration, and raw section attribution rationales are unresolved. Other links have pinned source/caller support.

Dry-run only; no source/shared KB, UI, Git, publication or promotion writes. Complete mirrored packet accompanies this review.

Validation: dry-run valid6/reject0/skip0. SHA256 `545d605e68eef4730a6883c70dd974451e45b289be0baa92e3cfdce9cb61ce22`.


## TU independent review

Damage matrix uses current view directly without refresh, multiplies view by translation and returns caller output; zero offset returnsNULL with output untouched. Scratch vectors are zeroed, translation helper writes only column3. No current-camera NULL guard exists. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L30-L76`.

Diagnostic gates execute before bit7 model gate. Hurt override1 has priority underx221D_b6; otherwise exact2 in either status chooses2, other nonzero chooses1. Drawing reports accumulate to one full HSD invalidation. Signed counts cast unsigned are not bounds checked. Pickup uses white ground-light, gray ground-heavy, blue air-light; lower renderer accepts pass2 only and emits Z0. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L81-L227`.

Common body gate uses bit7 then !invisible,!x221E_b5,arg2; model-event2 for metal or special flags, otherwise0. Accessory and afterimage occur outside body gate but inside bit7. Stack matrix is borrowed by kind callback. Magnify body additionally excludesx2226_b5; event1 selection requires its table but drawing does not. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L229-L308`.

Specialized event4 passes setb2 and b3=0/1 with stricter body guards and leave state persistent. Camera-mode1 can relocate cur_pos/root without event4 table; reinterpretation of walk float overlay is not a verified camera-space field. Eligibility helper can modifyx221F_b0 when rejecting rendering; mode0 clearsb3, other modes can still inherit eligibility mutation. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L310-L401`.

Global callbacks overwrite every linked node without saved state. Shadow helpers set fixed profiles, not arbitrary prior restoration. Model event2 also dispatches event3 and callbacks; callbacks may run despite unchanged visibility latch. Root/body gates and callback arrays lack bounds checks. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.c#L403-L449`.

Magnify calls event1 renderer for passes0/1/2; reflection swaps callback to that renderer then fixed camera-mode renderer. These calls do not establish lower-resolution geometry. Shadow brackets fixed1 then0 profiles. GObj transparency mapping is unchecked table[1,4,2,0]. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grizumi.c#L743-L795`.

All8 target signatures,5 source-only inlines,9 empty parameter identities and5 authored colors reviewed. Header has no implementation or parameter names. .data/.sdata color claims conflict at attribution level;14 section facts and4 exact link rationales remain unresolved.80render substitutions are hypotheses, not canonical names. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdrawcommon.h#L8-L15`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
