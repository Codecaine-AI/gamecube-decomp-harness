# Eflib semantic review

Pinned `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and separately rendered C1–1528/H1–125 cover1653 manifest lines. All renders returned statusok and exhausted. C renderer reports12 parser errors and20 substitutions; H0/0. Raw canonical source controls the review. Counts: {'owned_files': 2, 'owned_lines': 1653, 'targets': 58, 'function_targets': 54, 'writable_subjects': 153, 'parameter_entities': 94, 'existing_facts': 238, 'source_functions': 57, 'source_only_functions': 3, 'proposals': 24, 'dispositions': {'unresolved': 14, 'retain': 200, 'supersede': 24}}.

## High-impact findings

Creates from unchecked DAT[gfx_id/1000].data[gfx_id%1000]. LoadKind 0 (named EF_LOADKIND_ASYNC) enforces count>=64 eviction and increments count before allocating; allocator failure returns NULL without rollback. is_async stores LoadKind as u8; nonzero requires a parent. GObj allocation failure assigns NULL then tests the same field for non-NULL, so the cleanup branch is unreachable and the duplicate-free assertion executes. JObj load failure destroys the GObj. Selected fields only are initialized. Lifetime converts through u32 into u16; nonzero stored values increment with u16 wrap (65535 becomes 0). Animation queue count increments and the JObj is written before the >=32 assertion. IDs25/26 use p_link12, others11; render gx_link7/proc15.

PauseAll writes (state_flags & 0x80) | 1 for owner matches in both lists. Update switches on the full byte: exactly 1 increments to 2 and still runs this tick; exactly 2 returns. States 0x81 and 0x82 do not enter either case. ResumeAll preserves only 0x80. Thus the preserved asynchronous-state bit prevents these pause cases from matching; no masking is performed by Update.

AttachChild adds an RObj constraint, not a child hierarchy link. Main skips particle links1/2; aux skips0, so both include3..15. Generator deferred queue processing occurs before mask checks. Parameter setters deliberately access assumed-adjacent storage beyond AnimQueue.

## Complete source behavior

### `eflib_create_generator_add_appsrt`

`void inline eflib_create_generator_add_appsrt(HSD_Generator** generator, s32 gfx_id, HSD_JObj* jobj)`

Creates attached EFAC generator on link0 with gfx_id/1000 bank; ensures status0 AppSRT, destroys/nulls on failure, sets gp backlink, clears type0x600 and sets B11.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L64-L84

### `eflib_create_effect_and_attach`

`static inline EF_Effect* eflib_create_effect_and_attach(int gfx_id, HSD_GObj* gobj, HSD_JObj* jobj)`

Calls Create; a missing effect root destroys the GObj and returns NULL. Otherwise installs lb_8000C1C0 RObj constraint, copies supplied joint world origin and stores attach_jobj.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L86-L104

### `eflib_generator_add_appsrt`

`static inline HSD_Generator* eflib_generator_add_appsrt(HSD_Generator* generator, s32 status)`

Returns existing AppSRT generator or adds with supplied status; on allocation failure destroys generator and returns NULL.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L106-L121

### `efLib_Init`

`void efLib_Init(void)`

Initializes efLib_AllocData for 0x2C-byte EF_Effect allocations with four-byte alignment; resets efLib_EffectCount; clears the first 50 asynchronous effect-data pointers; installs efLib_Cb_PtclAppSRTHook and the JObj S/D-particle callbacks; creates main and auxiliary particle-manager GObjs with distinct process-link and render priorities; initializes AppSRT and the asynchronous queue; and clears eight parameter-owner slots while restoring each slot's alpha to 0xFF. Establishes a clean effect-subsystem startup state with zero managed effects, no loaded entries in the first 50 asynchronous data slots, no parameter slots owned by a GObj, and all parameter alphas fully opaque; it also activates separate main and auxiliary particle update/render paths. No manager-GObj allocation checks. Does not reset AnimCount or parameter gfx_id; clears only first50 DAT entries.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L154-L187

### `efLib_SetFlags`

`void efLib_SetFlags(HSD_GObj* gobj, s32 expire_flags)`

Reads HSD_GObj_Entities->x2C and ->x30, follows each GObj's next link, obtains its EF_Effect user data, and compares effect->parent_gobj with the input owner. For every match, it writes effect->expire_flags |= expire_flags; the function returns no value and does not directly destroy or unlink an effect. For owner matches, ORs the supplied s32 mask into the signed8 expire_flags field, preserving representable existing bits but narrowing the result. No direct removal or clearing occurs; callbacks such as SetRotYAndTransition react to a nonzero stored expiration byte. expire_flags is s8, so the s32 OR result narrows.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L189-L212

### `efLib_Destroy`

`void efLib_Destroy(HSD_GObj* gobj)`

Reads EF_Effect user data and its is_async flag from the supplied GObj. For an eligible effect, it scans all eight efLib_ParamTable entries and clears each gobj field equal to the input, reads the GObj kind and JObj pointer to dispatch hierarchy cleanup when applicable, and passes the GObj into the general GObj removal path, which invokes its user-data destructor and frees the GObj. Destruction is immediate only when the GObj has EF_Effect user data and that effect is not asynchronous. Missing effect user data or is_async != 0 leaves the effect, its parameter-table references, and its JObj hierarchy unchanged. An eligible effect is cleaned and unlinked during the call rather than being marked for later expiry. Reads gobj->user_data before the null-GObj test, so NULL input is unsafe.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L214-L235

### `efLib_DestroyAll`

`void efLib_DestroyAll(HSD_GObj* gobj)`

Consumes an owner HSD_GObj pointer; clears every matching gobj reference in the eight-entry efLib_ParamTable; traverses HSD_GObj_Entities lists x2C and x30; reads each candidate's EF_Effect user data and parent_gobj; runs hsd_8039D688 over JObj-backed matching effects; and sends each matching effect GObj to HSD_GObjPLink_80390228. It finally runs the same JObj-tree cleanup over the owner when the owner is JObj-backed. Performs immediate owner-wide termination rather than requesting a pause or expiry transition: every matching effect found in either managed list is unlinked during the call, regardless of its asynchronous flag. Before unlinking JObj-backed effects it walks their JObj trees to clean particle state, and it also cleans the owner's JObj tree after all child effects have been removed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L237-L283

### `efLib_PauseAll`

`void efLib_PauseAll(HSD_GObj* gobj)`

PauseAll writes (state_flags & 0x80) | 1 for owner matches in both lists. Update switches on the full byte: exactly 1 increments to 2 and still runs this tick; exactly 2 returns. States 0x81 and 0x82 do not enter either case. ResumeAll preserves only 0x80. Thus the preserved asynchronous-state bit prevents these pause cases from matching; no masking is performed by Update.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L285-L310

### `efLib_ResumeAll`

`void efLib_ResumeAll(HSD_GObj* gobj)`

PauseAll writes (state_flags & 0x80) | 1 for owner matches in both lists. Update switches on the full byte: exactly 1 increments to 2 and still runs this tick; exactly 2 returns. States 0x81 and 0x82 do not enter either case. ResumeAll preserves only 0x80. Thus the preserved asynchronous-state bit prevents these pause cases from matching; no masking is performed by Update.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L312-L335

### `efLib_remove_user_data`

`void efLib_remove_user_data(void* user_data)`

Receives the EF_Effect through the GObj user-data callback interface and reads its gobj and is_async fields. When gobj is non-null, it decrements efLib_EffectCount only for a non-asynchronous effect and passes the record with efLib_AllocData to HSD_ObjFree, which inserts the released storage into that allocator's free list and updates its free/used accounting. When gobj is null, it instead sends the record address to OSReport and enters the assertion path. Has two guarded cleanup outcomes. A record whose gobj field is non-null transitions back to the reusable EF_Effect pool; this also reduces the capacity-tracked effect count when is_async is zero. A record whose gobj field is null is treated as a duplicate free, producing a diagnostic and a failed assertion instead of being returned to the allocator.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L337-L351

### `efLib_RemoveLast`

`void efLib_RemoveLast(void)`

Reads the x2C entity list first and the x30 list second from HSD_GObj_Entities. For each candidate it saves gobj->next before calling efLib_Destroy, then reads efLib_EffectCount; it returns immediately when that count is below 64, otherwise advances using the saved next pointer. After each destruction attempt, returns if EffectCount<64, even when the count was already below64 or the candidate was ineligible. Otherwise traverses x2C then x30 using saved next pointers and asserts if both lists end. There is no initial threshold guard or established chronological oldest ordering.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L353-L385

### `efLib_Update`

`void efLib_Update(HSD_GObj* gobj)`

PauseAll writes (state_flags & 0x80) | 1 for owner matches in both lists. Update switches on the full byte: exactly 1 increments to 2 and still runs this tick; exactly 2 returns. States 0x81 and 0x82 do not enter either case. ResumeAll preserves only 0x80. Thus the preserved asynchronous-state bit prevents these pause cases from matching; no masking is performed by Update. Nonzero u16 lifetime predecrements and removal returns before later work. Scale inheritance uses non-root attachment matrix scale or root local scale, broadcasts Y uniformly, then animates root/non-instance descendants and calls update.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L387-L431

### `efLib_Create`

`EF_Effect* efLib_Create(int gfx_id, HSD_GObj* parent_gobj)`

Creates from unchecked DAT[gfx_id/1000].data[gfx_id%1000]. LoadKind 0 (named EF_LOADKIND_ASYNC) enforces count>=64 eviction and increments count before allocating; allocator failure returns NULL without rollback. is_async stores LoadKind as u8; nonzero requires a parent. GObj allocation failure assigns NULL then tests the same field for non-NULL, so the cleanup branch is unreachable and the duplicate-free assertion executes. JObj load failure destroys the GObj. Selected fields only are initialized. Lifetime converts through u32 into u16; nonzero stored values increment with u16 wrap (65535 becomes 0). Animation queue count increments and the JObj is written before the >=32 assertion. IDs25/26 use p_link12, others11; render gx_link7/proc15.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L433-L536

### `efLib_Create_Attach`

`EF_Effect* efLib_Create_Attach(u32 gfx_id, HSD_GObj* gobj, HSD_JObj* jobj)`

`gfx_id` and the owner GObj flow into efLib_Create. On success, the created effect GObj supplies the destination root JObj, while the supplied attachment JObj is used to establish the transform relationship and obtain a translation copied onto that root. The attachment JObj is then stored in `effect->attach_jobj`, where the regular effect update path can consume it for attachment-dependent scale inheritance. Construction has three outcomes: base creation failure returns `NULL`; a created effect without a root JObj is passed to the GObj removal routine and returns `NULL`; otherwise its transform and `attach_jobj` state are initialized and the live effect is returned.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L538-L555

### `efLib_Create_AttachChild`

`EF_Effect* efLib_Create_AttachChild(u32 gfx_id, HSD_GObj* gobj, HSD_JObj* jobj)`

Passes `gfx_id`, owner `gobj`, and attachment `jobj` unchanged to the common attached-effect constructor. On success it extracts the created effect GObj's root JObj, passes that root and the original attachment JObj to `lb_8000C290`, and returns the same `EF_Effect*`; on failure it performs no hierarchy operation and returns `NULL`.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L557-L565

### `efLib_Create_Attach_Scale`

`EF_Effect* efLib_Create_Attach_Scale(u32 gfx_id, HSD_GObj* gobj, HSD_JObj* jobj)`

Passes `gfx_id`, the owner `gobj`, and attachment `jobj` to the attached-effect constructor. If creation succeeds, it reads the scale of `GET_JOBJ(gobj)`, replaces the X and Z components with its Y component, writes the resulting uniform vector to `GET_JOBJ(effect->gobj)`, and returns the effect; on failure it performs no scale access or write and returns null.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L567-L579

### `efLib_Create_AttachChild_Scale`

`EF_Effect* efLib_Create_AttachChild_Scale(u32 gfx_id, HSD_GObj* gobj, HSD_JObj* jobj)`

Passes `gfx_id`, `gobj`, and `jobj` to efLib_Create_Attach. If creation succeeds, it passes the created effect's root JObj and the attachment JObj to `lb_8000C290`, reads the scale of `GET_JOBJ(gobj)`, replaces its X and Z components with its Y component, and writes that uniform vector to the created effect's root JObj. A failed creation bypasses both post-creation operations and returns NULL.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L581-L604

### `efLib_Create_Attach_Scale_FacingDir`

`EF_Effect* efLib_Create_Attach_Scale_FacingDir(u32 gfx_id, HSD_GObj* gobj, HSD_JObj* jobj)`

Passes `gfx_id`, the owner GObj, and the attachment JObj into efLib_Create_Attach. On success, it reads the owner GObj's root JObj scale, replaces the X and Z components with its Y component, writes that uniform vector to the effect JObj, and stores efLib_Cb_SetRotY_FromFighterDir in `effect->update`; later updates read `effect->parent_gobj`'s Fighter facing direction and write the effect JObj's Y rotation. If attached-effect creation fails, the function performs no transform or callback writes and returns NULL. If creation succeeds, it initializes the effect's uniform scale and installs a persistent update callback; on each active effect update, that callback selects −π/2 when the parent fighter faces left and +π/2 otherwise, allowing the effect to follow facing-direction changes after creation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L606-L628

### `efLib_Create_Attach_Pos`

`EF_Effect* efLib_Create_Attach_Pos(u32 gfx_id, HSD_GObj* gobj, Vec3* position)`

Passes `gfx_id` and `gobj` to efLib_Create. If creation succeeds, follows `effect->gobj` to its root HSD_JObj and copies `*position` into that JObj's translation, marking its transform dirty through HSD_JObjSetTranslate; it then returns the unchanged EF_Effect pointer. If creation fails, it does not read the position or access a JObj and returns NULL.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L630-L642

### `efLib_render_callback`

`void efLib_render_callback(HSD_GObj* gobj, int code)`

The callback maps an input code of 0, 1, or 2 unchanged into particles_code and rejects all other codes. For a valid code it enables color updates, reads gobj->gx_link, and calls psDispParticles with PTCL_RENDER_LINKNO_0 | PTCL_RENDER_LINKNO_2 when gx_link is 7, or PTCL_RENDER_LINKNO_1 otherwise.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L644-L668

### `efLib_particles_proc_main`

`void efLib_particles_proc_main(HSD_GObj* gobj)`

The callback ignores its HSD_GObj argument and sends the identical PTCL_SKIP_LINKNO_1 | PTCL_SKIP_LINKNO_2 mask to the global particle-list and generator-list processors. The particle processor interprets the mask while traversing its sixteen link lists; the generator processor tests it against each generator's linkNo before changing that generator. Sends skip-link1|skip-link2 to particle and generator processing. Generator processing first drains its deferred queue regardless of this mask, then skips masked or kind0x800 active generators. Remaining generators update, accumulate emission, emit at count>=1 and decrement/remove nonzero genLife. The mask does not preserve all deferred generator state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L670-L674

### `efLib_particles_proc_aux`

`void efLib_particles_proc_aux(HSD_GObj* gobj)`

When scheduled, the callback ignores its HSD_GObj argument and forwards PTCL_SKIP_LINKNO_0 to both the baselib particle processor hsd_8039CEAC and generator processor hsd_8039EE24. Consequently, both processors operate with link number 0 excluded, complementing the main callback's exclusion of link numbers 1 and 2.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L676-L680

### `efLib_CreateGenerator`

`HSD_Generator* efLib_CreateGenerator(s32 gfx_id, Vec3* pos)`

Maps `gfx_id` to a generator link number—2 for ID 0x121, 1 for IDs 0xFF, 0x7918, 0xFC, and 0xF7, and 0 otherwise—computes the particle bank as `gfx_id / 1000`, and passes the link number, bank, and full ID to `hsd_8039F05C`. On success it copies all three components of `*pos` into `generator->pos`; on failure it propagates null unchanged.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L682-L710

### `efLib_CreateGenerator_AddAppSRT`

`HSD_Generator* efLib_CreateGenerator_AddAppSRT(s32 gfx_id)`

The input graphics ID is passed intact to the generator creator while gfx_id / 1000 selects its bank and zero selects the generator link. The resulting generator's appsrt field is read; if empty, status 1 and the generator's idnum flow through psAddGeneratorAppSRT_begin into a newly allocated identity-SRT record stored back in generator->appsrt. Failure flows through generator destruction to a NULL return; otherwise the generator pointer is returned. There are three completion states: generator creation failure returns NULL immediately; a generator that already owns an AppSRT is returned unchanged; and a generator lacking AppSRT is returned after successful status-1 AppSRT allocation. If that allocation fails, the partially created generator is destroyed and NULL is returned.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L712-L728

### `efLib_CreateGenerator_Translate_FacingDir`

`HSD_Generator* efLib_CreateGenerator_Translate_FacingDir(s32 gfx_id, Vec3* translation, f32 direction)`

gfx_id flows to the generator constructor both directly and as gfx_id / 1000, selecting the effect and its thousand-ID group. The resulting generator supplies an existing appsrt pointer or its idnum to a status-1 AppSRT allocation. On success, translation is copied component-for-component into appsrt->translate; the sign of direction selects appsrt->rot.y and, for the negative case, sets generator kind bit 0x40000. The configured generator is returned to the caller. Creation has three outcomes. If the generator constructor fails, the function returns NULL without reading translation. If the generator exists but has no AppSRT and AppSRT allocation fails, the generator is passed to hsd_8039D4DC and the function returns NULL. Otherwise it retains the existing or newly allocated AppSRT, applies the requested transform, and returns the generator. A negative direction additionally sets kind bit 0x40000 and uses -π/2 Y rotation; a zero or positive direction leaves that bit unchanged and uses +π/2.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L730-L759

### `efLib_CreateGenerator_Attach`

`HSD_Generator* efLib_CreateGenerator_Attach(s32 gfx_id, HSD_JObj* jobj)`

Passes a zero-valued leading option, gfx_id / 1000, the full gfx_id, and the attachment JObj to hsd_8039EFAC. It preserves that callee's HSD_Generator pointer as its return value; when non-null, the pointer is also used to update the generator's type field before being returned. Generator creation has two result branches: a null result is returned without further work, while a successful result has PSAPPSRT_UNK_B10 cleared in its type flags before it is returned.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L761-L768

### `efLib_CreateGenerator_Attach_AddAppSRT`

`HSD_Generator* efLib_CreateGenerator_Attach_AddAppSRT(s32 gfx_id, HSD_JObj* jobj)`

The function sends 0, gfx_id / 1000, gfx_id, and jobj to the generator constructor. On success it reads generator->appsrt, creates and installs an identity AppSRT record with status 0 only when that field is NULL, writes generator into appsrt->gp, clears generator type bits 0x600, and sets PSAPPSRT_UNK_B11. If no AppSRT is available, it destroys the newly created generator and returns NULL. Generator creation failure leaves no object and returns NULL. After successful generator creation, an existing AppSRT record is retained; otherwise a status-0 record is allocated. AppSRT allocation failure immediately destroys the generator and returns NULL. Every successful return guarantees a non-NULL generator->appsrt whose gp points back to that generator, with type bits 0x600 cleared and PSAPPSRT_UNK_B11 set.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L770-L789

### `efLib_CreateGenerator_Attach_Scale`

`HSD_Generator* efLib_CreateGenerator_Attach_Scale(s32 gfx_id, va_list vlist, HSD_GObj* gobj)`

`gfx_id` and the `HSD_JObj*` consumed from `vlist` flow into generator creation with an AppSRT. If that produces a generator, the function reads `GET_JOBJ(gobj)` into a temporary `Vec3` scale and broadcasts `scale.y` to `generator->appsrt->scale.x`, `.y`, and `.z`; it then returns the generator without further mutation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L791-L807

### `efLib_CreateGenerator_AppSRT_SetScale`

`HSD_Generator* efLib_CreateGenerator_AppSRT_SetScale(s32 gfx_id, va_list vlist)`

gfx_id and the first variadic value, an HSD_JObj pointer, flow into generator creation. If that produces a generator, the float addressed by the next variadic value is read once and propagated equally to generator->appsrt->scale.x, scale.y, and scale.z; the resulting generator pointer is returned to the asynchronous effect dispatcher. The JObj argument is consumed before creation is attempted. If creation fails, the function returns NULL without consuming the scale argument or writing transform state. If creation succeeds, it immediately replaces the AppSRT record's identity unit scale with the supplied uniform value and returns the generator.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L809-L820

### `efLib_CreateGenerator_AppSRT_SetFacingDir`

`HSD_Generator* efLib_CreateGenerator_AppSRT_SetFacingDir(s32 gfx_id, va_list vlist)`

Passes `gfx_id` and the first variadic `HSD_JObj*` into the shared generator/AppSRT creation helper. On success, it dereferences the next variadic `f32*`, converts only its sign into a discrete facing orientation, stores that orientation in `generator->appsrt->rot.y`, and returns the configured generator.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L822-L835

### `efLib_CreateGenerator_AppSRT_SetFacingDirScale`

`HSD_Generator* efLib_CreateGenerator_AppSRT_SetFacingDirScale(s32 gfx_id, va_list vlist)`

The graphics identifier and first variadic argument, an HSD_JObj pointer, flow into the generator/AppSRT creation helper. If creation succeeds, the next argument's pointed-to float is reduced to its sign and written as appsrt->rot.y (-π/2 for negative, +π/2 otherwise); the final pointed-to float is replicated into appsrt->scale.x, scale.y, and scale.z. The configured generator pointer is returned. Transform configuration is conditional on successful generator creation: a NULL generator is returned without consuming the direction or scale arguments. On success, any direction strictly below zero selects -π/2 Y rotation, while zero and positive values select +π/2, and all three scale components are overwritten with the same supplied value.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L837-L855

### `efLib_SpawnParticleEffect`

`void efLib_SpawnParticleEffect(int bank, s32 gfx_id, HSD_JObj* jobj, bool flag)`

Special IDs choose attached or standalone generator construction and selected AppSRT transforms; bank is often derived from gfx_id/1000 and flag ignored. IDs0xD4/0x243 use explicit bank/link2. ID0xE3 uses the supplied joint world origin, then root scale. Fallback uses link1 for0xFC/0xFF/0xF7/0x7918, else0, and passes the supplied jobj unchanged to EFAC when flag is true or F6CC when false; it does not walk the fallback joint to root. Every exceptional graphics-ID case terminates processing after its specialized attempt, even when generator creation fails. For IDs 0xD4 and 0x243, a created generator is retained only if it already has or can acquire an AppSRT record; otherwise the generator is destroyed. Unhandled IDs always proceed through exactly one generic spawn routine, selected by flag. Special-case ledger: 4A38–4A3A/B798–B79A rootyaw;2D/2E/31 type1000;127 rootyaw+scale;2/6/A3/A7/AA/F2/12A/132/133 rootscale;16D–170/7E2 standalone rootyaw+localtranslation;D4 rootZ+translation+scale;243 rootZ+translation;E3 supplied worldorigin+rootscale. Exceptional branches return even on failure.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L857-L992

### `efLib_Cb_SPtcl`

`void efLib_Cb_SPtcl(s32 linkNo, s32 bank, s32 gfx_id, HSD_JObj* jobj)`

Receives a particle link number, resource bank, graphics ID, and source JObj from the JObj SPtcl callback path. It discards linkNo, tests bank, and forwards bank, gfx_id, and jobj unchanged to either grLib_801C99C0 or efLib_SpawnParticleEffect, supplying 0 as the final mode flag in both paths.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L996-L1003

### `efLib_Cb_DPtcl`

`void efLib_Cb_DPtcl(int linkNo, int bank, int gfx_id, HSD_JObj* jobj)`

Receives a link number, particle bank, graphics ID, and source JObj from the JObj callback system. It ignores linkNo, forwards bank, gfx_id, and jobj unchanged, and appends mode 1; bank 0x1E is sent to grLib_801C99C0, while all other banks are sent to efLib_SpawnParticleEffect.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1007-L1014

### `efLib_Cb_ParticleRender`

`void efLib_Cb_ParticleRender(HSD_Particle* particle)`

When particle and particle->appsrt are non-null, the callback copies translation, scale, and rotation from the current AppSRT into locals, detaches that AppSRT through psRemoveParticleAppSRT, and attaches a newly allocated status-1 AppSRT through psAddParticleAppSRT_begin. On success it copies the saved transform into the new record. On allocation failure it instead writes cmdWait = 0, size = 0.0, and life = 1 to the particle. A null particle or a particle without an AppSRT is left unchanged. Otherwise the particle transitions from its old AppSRT attachment to a fresh attachment carrying identical transform values. If allocation fails after the old attachment has been removed, the particle enters a terminal visual state with no wait, zero size, and one remaining life unit. Copies SRT values but no other state or matrix; it performs no drawing. The local callback/vector return void, while HSD_PSUserFunc hooks return int. The void-pointer setter does not establish signature or ABI compatibility.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1016-L1040

### `efLib_Cb_PtclAppSRTHook`

`void efLib_Cb_PtclAppSRTHook(HSD_Generator* gen)`

The particle system supplies an HSD_Generator. The callback reads gen->cmdList and compares it by pointer identity with the cmdList fields of ptclref_804D0E5C bank-0 entries 0x96, 0x97, 0x98, and 0x21B. For each match it passes the generator and lbl_803BF810 to hsd_8039D1E4, which stores the vector in gen->userfunc. A generator whose command list matches one of the four selected definitions transitions to having userfunc set to lbl_803BF810. A generator with any other command list undergoes no mutation. The checks are independent and contain no timer, allocation, or failure state.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1050-L1064

### `efLib_Cb_SetOffsetY_FromParamY`

`void efLib_Cb_SetOffsetY_FromParamY(EF_Effect* effect)`

Reads `effect->gobj` to obtain the destination effect JObj, passes `effect->attach_jobj` to `lb_8000B1CC` to produce a base position vector, adds `effect->params.y` to the vector's Y component, and sends the completed vector to `HSD_JObjSetTranslate` as the destination JObj's new translation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1066-L1075

### `efLib_Cb_SetScale_FromParamX`

`void efLib_Cb_SetScale_FromParamX(EF_Effect* effect)`

Reads the scale factor from `effect->params.x` and obtains the destination JObj from `effect->gobj`. For each axis, it reads the JObj's current scale, multiplies that component by the parameter, and passes the result to the corresponding X, Y, or Z scale setter. Applies an immediate, unguarded multiplicative update to the JObj's current scale. Because it uses the current components rather than fixed base values, repeated invocations compound the scaling; a factor of 1 leaves the scale unchanged and a factor of 0 collapses all three components to zero.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1077-L1093

### `efLib_Cb_SetRotYAndTransition`

`void efLib_Cb_SetRotYAndTransition(EF_Effect* effect)`

The callback reads `effect->user_data`, `effect->gobj`, `expire_flags`, and `lifetime`. A non-null user-data JObj contributes the sign of `scale.x`, which becomes a root-model Y rotation of -π/2 for negative scale and +π/2 otherwise. The expiration branch writes lifetime 11, clears `effect->update`, and requests animation frame 65 across the effect's JObj hierarchy; otherwise, lifetime 1 is rewritten to 6 and frame 60 is requested across that hierarchy. The callback has two transition modes. When `expire_flags` is not `EF_DOES_NOT_EXPIRE`, its first invocation makes the transition one-shot by setting lifetime to 11, clearing the update callback, and requesting animation frame 65; subsequent effect updates count that lifetime down to removal without invoking this callback again. When the flag equals `EF_DOES_NOT_EXPIRE`, the callback remains installed, and an invocation that observes lifetime 1 changes it to 6 and requests animation frame 60. A null user-data pointer suppresses only the orientation update, not either transition mode. Expiration tests the stored low byte. Current model animation can reset transforms before this callback.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1095-L1124

### `efLib_Cb_SetJObjOffsetZ`

`void efLib_Cb_SetJObjOffsetZ(EF_Effect* effect)`

Receives the EF_Effect from efLib_Update, follows effect->gobj to the effect root JObj and then its child pointer, reads the child's current translation.z, adds 2.0, and writes the accumulated value back through the JObj translation setter. Its transform change is cumulative rather than a fixed assignment: every active update adds another 2.0 to the first child JObj's Z translation. The callback is skipped while the containing effect is paused because efLib_Update returns before callback dispatch in the paused state. A missing child is passed to a translation getter; the local ternary is not a safe no-op guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1126-L1140

### `efLib_Cb_SetRotY_FromFighterDir`

`void efLib_Cb_SetRotY_FromFighterDir(EF_Effect* effect)`

Reads effect->gobj to obtain the effect JObj and effect->parent_gobj to obtain the owning Fighter. The sign of Fighter.facing_dir is converted to a fixed yaw of −π/2 for negative facing or +π/2 otherwise, then written to the effect JObj through HSD_JObjSetRotationY.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1142-L1156

### `efLib_Cb_SetRotYZ_FromFighter`

`void efLib_Cb_SetRotYZ_FromFighter(EF_Effect* effect)`

Reads `effect->parent_gobj` to obtain the owning Fighter and `effect->gobj` to obtain the rendered HSD_JObj. It computes `M_PI_2_F - fighter->mv.co.common.x4.x`, tests `fighter->facing_dir`, and writes the effect JObj's Y and Z rotations: negative-facing fighters receive Y = -π/2 and Z = +(π/2 - x4.x), while nonnegative-facing fighters receive Y = +π/2 and Z = -(π/2 - x4.x). Each invocation overwrites the effect JObj's Y and Z orientation rather than incrementing it. The fighter's facing sign selects one of two mirrored states: left-facing uses negative quarter-turn Y and positive computed Z tilt, while right-facing or zero uses positive quarter-turn Y and negative computed Z tilt.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1158-L1174

### `efLib_Cb_Fall_FromParamY`

`void efLib_Cb_Fall_FromParamY(EF_Effect* effect)`

Consumes the effect's GObj to obtain its JObj, reads that JObj's current translation and X/Y rotations, and treats effect->params.y as mutable vertical velocity. It subtracts 0.2 from that velocity, adds sin(rotation_y) and cos(rotation_y) to the X and Z positions respectively, adds the updated velocity to Y, and adds 0.5 to X rotation; the resulting transform is consumed by the effect rendering and animation pipeline. On every active invocation, the callback first lowers the stored vertical velocity by 0.2 and then applies the new value to vertical position, so repeated updates produce constant downward acceleration. Simultaneously it advances one unit per update in the horizontal direction selected by Y rotation and accumulates 0.5 of X rotation per update. It contains no termination guard; lifetime expiration and pause suppression are handled by efLib_Update before callback dispatch.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1176-L1198

### `efLib_Cb_SetOffset_FromParams`

`void efLib_Cb_SetOffset_FromParams(EF_Effect* effect)`

On each active effect update, the callback reads the JObj's current X/Y/Z translation and the effect's parameter vector, subtracts 0.1 from params.y in place, then writes X + params.x, Y + the updated params.y, and Z + params.z back to the JObj. The mutated Y parameter is retained in EF_Effect and therefore becomes the vertical increment consumed by the next invocation. Repeated invocations integrate a discrete gravity-like trajectory: X and Z advance by their stored offsets, while the Y increment decreases by 0.1 before every position update. Thus vertical motion progressively bends downward, with params.y crossing through zero and becoming increasingly negative unless another routine changes it.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1200-L1217

### `efLib_Cb_LifetimeEndSpawn`

`void efLib_Cb_LifetimeEndSpawn(EF_Effect* effect)`

Consumes the owning EF_Effect's post-decrement lifetime and attach_jobj. On the trigger update it passes attach_jobj to a bank-0 particle-generator creation request for graphics ID 0x1AB, then writes NULL to the effect's update callback and 0x27 to its lifetime; later efLib_Update calls no custom callback and consumes the replacement lifetime until removal. Only lifetime1 triggers this one-shot transition. The creation result is ignored: update becomes NULL and lifetime39 on both success and failure. Subsequent unpaused updates decrement to removal.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1219-L1226

### `efLib_Cb_SetScaleRotY_FromFighter`

`void efLib_Cb_SetScaleRotY_FromFighter(EF_Effect* effect)`

Reads the parent GObj and effect GObj from EF_Effect, obtains each GObj's JObj, and reads the Fighter from the parent GObj. It component-wise multiplies the parent JObj scale by the effect JObj's existing scale and writes the result back to the effect JObj; it then maps parent Fighter facing_dir < 0 to −π/2 and all other values to +π/2 and writes that angle as the effect JObj's Y rotation. Scale multiplication can compound across calls unless another path resets current effect scale.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1228-L1259

### `efLib_Cb_SetRotYZ_FromParamZ_FighterDir`

`void efLib_Cb_SetRotYZ_FromParamZ_FighterDir(EF_Effect* effect)`

The callback resolves the rendered JObj from effect->gobj, reads facing_dir from the Fighter stored on effect->parent_gobj, and reads effect->params.z. For negative facing it writes rotation Y = -π/2 and rotation Z = params.z; otherwise it writes rotation Y = +π/2 and rotation Z = -params.z.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1261-L1276

### `efLib_Cb_ftMr_SpecialLw`

`void efLib_Cb_ftMr_SpecialLw(EF_Effect* effect)`

Reads the effect GObj's root JObj and selects the root's second child subtree, then reads motion_id, cmd_vars[3], a common move-state word, and the collision floor normal from the Fighter stored on effect->parent_gobj. It writes JOBJ_HIDDEN across the selected subtree and writes the root JObj's Z rotation, using `-atan2f(floor.normal.x, floor.normal.y)` when both move-state guards are nonzero and zero otherwise. When the owning Fighter's motion_id is 349, the callback clears JOBJ_HIDDEN recursively on the selected effect subtree; in every other motion it sets JOBJ_HIDDEN recursively. Independently, it aligns the effect root to the floor only while both cmd_vars[3] and the tested common move-state word are nonzero; if either guard is zero, it restores the root's Z rotation to 0 radians. The common.x4.z guard reinterprets float bits as s32, not numeric float nonzero.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1279-L1306

### `efLib_Cb_ftLg_SpecialLw`

`void efLib_Cb_ftLg_SpecialLw(EF_Effect* effect)`

The callback resolves the effect root from effect->gobj and its second child as root->child->next, then resolves the owning Fighter from effect->parent_gobj. fighter->motion_id drives that child's JOBJ_HIDDEN flag; fighter->cmd_vars[3] and fighter->mv.co.common.x4.z gate slope alignment; and the fighter's floor-normal X/Y components are converted with -atan2f into the root JObj's Z rotation. Motion357 reveals root.child.next; all other motions hide that subtree. Floor-slope rotation requires cmd_vars[3]!=0 and the s32 bit reinterpretation of common.x4.z to be nonzero. This is not a floating-point nonzero test: negative zero has nonzero bits. Otherwise root Z rotation becomes0.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1309-L1337

### `efLib_Cb_ftKp_SpecialHi`

`void efLib_Cb_ftKp_SpecialHi(EF_Effect* effect)`

Reads the primary effect GObj, the next linked EF_Effect's GObj, and the parent fighter. From the fighter it consumes motion_id, command-variable bit 0 of cmd_vars[2], move variable x10, and the current floor normal. It writes JOBJ_HIDDEN on the second effect hierarchy and writes the same Z rotation to both effect hierarchies, using -atan2f(floor.normal.x, floor.normal.y) when both alignment guards pass and 0 otherwise. During motion 359, the callback clears JOBJ_HIDDEN on the second effect hierarchy; in every other motion it hides that hierarchy. Independently, it aligns both effect hierarchies to the floor only while cmd_vars[2] bit 0 is set and move variable x10 is nonzero; if either guard fails, it restores both Z rotations to zero. The second model is effect->next->gobj, not a child JObj. common.x10 is UNK_T and cast to s32; do not infer a floating scalar.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1340-L1363

### `efLib_Cb_ftCo_Bury`

`void efLib_Cb_ftCo_Bury(EF_Effect* effect)`

Reads effect->gobj and effect->parent_gobj from its EF_Effect argument and forwards them, in that order, to ftCo_800C0FCC; it produces no direct return value or local state change.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1366-L1369

### `efLib_SetTevKonstColor`

`void efLib_SetTevKonstColor(HSD_JObj* jobj, s32 count, u32 konst, u32 tev0)`

The input JObj is resolved to its DObj, then to that DObj's MObj and the material's TObj-chain head. The function advances through count next links and writes the low 24 bits of konst and tev0 into the selected TObj's TEV konst and tev0 RGB fields; it does not alter either color's alpha component. Negative count and short material/texture chains are not guarded; modifies memory RGB only, without issuing a direct GX call.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1375-L1393

### `efLib_SetParamAlpha`

`void efLib_SetParamAlpha(HSD_GObj* gobj, u8 alpha)`

For ordinary fighters in guard processing, the caller interpolates alpha from p_ftCommonData->x2F4 toward 255 using Fighter.lightshield_amount and passes the resulting byte with the fighter GObj. efLib_SetParamAlpha first searches eight slots for that GObj, otherwise uses the first empty slot, then stores the GObj and alpha. efLib_Cb_ApplyStoredAlpha later looks up an effect by effect->parent_gobj and copies the byte to its texture TEV constant alpha; graphics IDs 0x417 and 0x419 select additional texture or joint materials to receive the same alpha. Searches existing owner keys then first NULL key, updates only gobj/alpha and returns silently when full. Init clears keys and sets alpha255, but does not reset gfx_id. Destroy clears keys equal to the effect GObj; DestroyAll clears keys equal to the supplied parent. Both setters assume ParamTable follows AnimQueue by deliberately indexing beyond AnimQueue. Selected gfx_id is preserved; NULL gobj matches a free slot rather than allocating a live key. Deliberately indexes beyond AnimQueue.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1411-L1434

### `efLib_SetParamGfxId`

`void efLib_SetParamGfxId(HSD_GObj* gobj, s32 gfx_id)`

Receives an owner GObj and effect dispatch ID from efAsync_Dispatch, searches the eight-entry effect-parameter table first for that owner and then for an unused entry, and stores the owner/ID pair. efLib_Cb_ApplyStoredAlpha later finds the pair through an effect's parent_gobj and consumes gfx_id to determine which texture objects receive the entry's alpha. Implements an eight-slot owner-keyed upsert: it updates the first entry already matching the supplied GObj, otherwise occupies the first entry whose GObj is null, and leaves the table unchanged if all eight entries belong to other owners. gfx_id narrows into u16; selected alpha is preserved. Deliberately indexes beyond AnimQueue to reach assumed-adjacent ParamTable; portable C layout is not guaranteed.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1436-L1459

### `efLib_Cb_ApplyStoredAlpha`

`void efLib_Cb_ApplyStoredAlpha(EF_Effect* effect)`

`efLib_SetParamAlpha` and `efLib_SetParamGfxId` associate an owner GObj with alpha and graphics-ID values in one of eight `EF_ParamEntry` slots. This function selects that slot by comparing its GObj with `effect->parent_gobj`, obtains material texture objects through the effect GObj's child JObj/DObj/MObj hierarchy, and copies the stored alpha into `tobj->tev->konst.a`. Graphics ID 0x417 redirects the initial write to the next texture object, while ID 0x419 additionally copies the alpha into the materials of six successive sibling JObjs. The callback scans at most eight parameter slots and stops after the first slot owned by `effect->parent_gobj`; if no slot matches, it leaves the effect unchanged. A normal matching entry updates one TEV alpha channel, graphics ID 0x417 first advances to the second texture object, and graphics ID 0x419 updates the initial channel plus one channel on each of six following sibling JObjs. No guard for absent child/DObj/MObj/TObj/TEV chains; ID419 traverses six following siblings, not descendants.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1461-L1500

### `efLib_Cb_AccumOffset_FromParams`

`void efLib_Cb_AccumOffset_FromParams(EF_Effect* effect)`

efLib_CreateGenerator_AppSRT_SetPos copies its `jobj` argument into `effect->attach_jobj`, copies its `vec` argument into `effect->params`, and registers this callback in `effect->update`. During an active efLib_Update, the callback passes attach_jobj to lb_8000B1CC to obtain a base translation, adds params.x, params.y, and params.z, then writes the resulting vector to `GET_JOBJ(effect->gobj)`.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1502-L1511

### `efLib_CreateGenerator_AppSRT_SetPos`

`EF_Effect* efLib_CreateGenerator_AppSRT_SetPos(int gfx_id, HSD_GObj* gobj, HSD_JObj* jobj, Vec3* vec)`

The function creates a generic effect with descriptor ID 0 under gobj, stores jobj in effect->attach_jobj and a value copy of *vec in effect->params, and attaches the gfx_id-selected generator to GET_JOBJ(effect->gobj). During later active effect updates, efLib_Cb_AccumOffset_FromParams reads the attachment's current translation, adds the stored x/y/z offset, and writes the sum to the effect JObj; the attached generator consequently receives that moving transform through its AppSRT-enabled attachment. If efLib_Create fails, the function returns NULL without initializing an attachment or generator. Once an effect exists, it is returned even if generator creation or AppSRT allocation fails; the helper destroys an AppSRT-less generator and nulls only its local output. For a successfully configured effect, each active update recomputes its position from the attachment and fixed offset, while the library's paused state suppresses that callback and therefore freezes this positional following until updates resume.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L1513-L1527

## Types, state, and header

Header11–16 defines EF_ParamEntry as void* owner, u16 gfx_id and u16 alpha, size8. Header18–119 exports the lifecycle/factory/callback signatures; lines121–122 declare AnimQueue[16] and ParamTable[8]. No ownership-transfer promise accompanies borrowed owner/JObj/vector inputs. EF_Effect is size0x2C, u16 lifetime, s8 expiration and u8 scale/state/is_async. Its params/user_data/padding are not all initialized by Create. Load-kind names ASYNC0/SYNC1 conflict with natural reading of is_async; numeric predicates are documented.

C1–63 imports dependency types/functions. C132–152 WALK_TO_ROOT follows parent untilnull with no cycle guard; downstream getters can still rejectnull. C1043–1044 declares the three-entry callback vector (first SRT clone hook, twoNULL); C1404 and1409 declare animation and parameter arrays. No compiled section/address mapping is asserted. Init resets only first50 DAT data pointers, count, parameter owner/alpha, but not AnimCount/gfx_id.

Every target, source-only helper, parameter identity, empty subject, baseline fact and exact outgoing link has a ledger entry. Source signatures supply parameter order; inherited #rN suffixes do not prove ABI registers. No parameter fact writes proposed. No canonical renames proposed.

Outgoing links: {'expected': 30, 'reviewed': 30, 'retain': 24, 'reject': 0, 'unresolved': 6}. Exact pause/animation guarantees, named move mappings, and raw-section attribution remain unresolved where stated.

Proposal validation is dry-run only. No source, shared KB, UI, Git or publication action was performed. Foreign canonical-only ranges are recorded in coverage.json; no foreign owned-file completion claimed.

Validation: dry-run valid; 24 fact writes, 0 rejected, 0 skipped. Proposal SHA256 `a6a93277d69a44272bd14f17a36c45b01c425ef3842d33bc4db95594c9cc2fdf`. Shared psstructs review confirms int-returning hooks differ from the local void-returning vector; the void* setter establishes storage only, not callable-type compatibility.
