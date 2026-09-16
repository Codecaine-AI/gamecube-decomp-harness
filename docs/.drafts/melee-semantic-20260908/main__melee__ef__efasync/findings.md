# Efasync review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`; UTC 2026-09-08T16:01:58.149Z to 2026-09-08T16:07:30.913633+00:00. All1471C lines and24header lines read canonically and separately rendered. C renderer reports998full-file parse errors on each page, zero substitutions; header zero errors/substitutions. No claim of clean parsing.

{"subjects": 33, "targets": 13, "function_targets": 9, "section_targets": 4, "parameter_entities": 19, "facts": 64, "retained": 23, "superseded": 26, "unresolved": 15, "proposed_facts": 45, "links": 25, "links_retained": 20, "links_unresolved": 5}

## Functions and parameters

### efAsync_Dispatch

void* efAsync_Dispatch(s32 gfx_id, HSD_GObj* gobj, va_list vlist). s32 gfx_id: case tag, explicit0x3E8..0x477; unknown still drains animation queue HSD_GObj* gobj: borrowed owner, required by owner-dependent recipes va_list vlist: active tag-specific argument stream; conditional reads and helper forwarding. Source signature; positional parameter entities are not ABI evidence.

Starts ret_obj=NULL and switches explicit IDs0x3E8..0x477. Unknown IDs create nothing but still drain the shared initial-animation queue. Return is not a success indicator:0x41B,0x432,0x43F,0x443,0x44A/B/C create/configure generators without assigning ret_obj.0x3ED returns the first generator even if secondary creation fails;0x427 returns head of up to6 linked effects, retaining partial creation. Constructor guards gate many later va_arg reads, so consumption depends on success. No validation of caller argument schema, gobj/JObj/resource lifetime or numeric finiteness. Selected recipes set global LoadKind=SYNC without restoring it; efSync_Spawn resets it on its next entry. AnimCount decrements and queued JObjs animate in reverse insertion order; no bounds/reentrancy guarantee. No active va_end in this function.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L71-L1133

### efAsync_LoadAsync

void efAsync_LoadAsync(int index). int index: intended catalog index0..49. Source signature; positional parameter entities are not ABI evidence.

For indices0..49 with nonNULL filename, registers/reprioritizes a type3 preload with scheduling metadata and original index; no local data-cache guard or wait. Invalid range returns before dereferencing table data, but source forms &table[index] before checking range, so arbitrary out-of-array pointer arithmetic is not a defined-C guarantee. Filename conversion/preload capacity failures are handled only downstream. Later retrieval finalizes archive; submission does not mean loaded.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1260-L1272

### efAsync_OnLoad

void efAsync_OnLoad(HSD_Archive* archive, u8* data, u32 length, int index). HSD_Archive* archive: writable destination descriptor u8* data: mutable loaded DAT image u32 length: image byte length int index: trusted catalog index for export name. Source signature; positional parameter entities are not ABI evidence.

Unconditionally initializes archive and resolves named export using trusted index. No local index, export-NULL or buffer/content guard. Tests the OR of the two first export pointer words before relocation; this permits a one-pointer-only combination although particle helper dereferences command bank. Does not register bank index or populate catalog data cache. Preload retrieval calls it at load_state1 and changes to2 afterward; direct repeated calls are not locally guarded.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1274-L1285

### efAsync_LoadSync

void efAsync_LoadSync(int idx). int idx: intended catalog index0..49. Source signature; positional parameter entities are not ABI evidence.

Forms table pointer before range check, then skips indices outside0..49, absent filename or nonNULL data cache. Resolves export through preload-aware fatal loader; true selects already-relocated bank installation, false relocation plus installation. The OR guard checks only whether either first pointer word exists, not validity of both. Always caches &spC->data, the address of the export third word, even if both bank pointers are zero; it does not copy that word value. No local index-pointer-arithmetic, content, reentrancy or unload/lifetime safety guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1287-L1316

### efAsync_QueueProcessDeferred

void efAsync_QueueProcessDeferred(HSD_GObj* gobj, EF_QueuedEffect* queued_effect). HSD_GObj* gobj: owner supplied at execution EF_QueuedEffect* queued_effect: required one-shot allocator record; consumed/freed after returning dispatch. Source signature; positional parameter entities are not ABI evidence.

Requires a valid allocator-owned command and compatible gfx_id/spawn-kind schema. Reads u8 discriminator, forwards borrowed JObj or current transformed world point plus copied payloads to efSync_Spawn; type8 calls Camera_RequestQuake. Frees command after a returning branch. Unknown type asserts; if assertion does not return, reclamation is not reached. Does not unlink from any queue itself. Command JObj lifetime must extend through processing; output pointers into stack/command cannot escape through incompatible downstream recipes.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1318-L1375

### efAsync_QueueFlush

void efAsync_QueueFlush(HSD_GObj* gobj, void* arg_struct). HSD_GObj* gobj: common execution owner for queued requests void* arg_struct: required sentinel with EF_QueuedEffect-compatible next field. Source signature; positional parameter entities are not ABI evidence.

Requires valid head and acyclic allocator-owned chain with safe nonreentrant mutation. Saves successor before each processing/free, then clears sentinel after traversal. Ordinary prepend queues are processed newest-first. Sentinel retains links to freed nodes during traversal; reentrant enqueue/clear/flush is not protected and newly prepended records can be lost by final NULL store. gobj supplied at flush is used for every request; it is not stored in each command.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1377-L1389

### efAsync_QueueClear

void efAsync_QueueClear(void* arg_struct). void* arg_struct: required sentinel; owned commands freed, sentinel retained. Source signature; positional parameter entities are not ABI evidence.

Requires valid sentinel and acyclic exclusively owned records. Saves successor, frees each without presentation dispatch, then sets sentinel next=NULL. Does not free sentinel, JObj or previously spawned effects. No NULL/ownership/duplicate/cycle/interrupt protection; exact-once reclamation assumes well-formed nonreentrant queue.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1391-L1403

### efAsync_Spawn

void efAsync_Spawn(HSD_GObj* gobj, void* queue_head, u32 spawn_kind, u32 gfx_id, HSD_JObj* jobj, ...). HSD_GObj* gobj: immediate execution owner, not stored on queue record void* queue_head: sentinel required only for deferral branch u32 spawn_kind: original switch discriminator0..8, stored asu8 u32 gfx_id: tag for downstream visual recipe or quake HSD_JObj* jobj: borrowed anchor, no added reference; followed by kind-specific variadic arguments. Source signature; positional parameter entities are not ABI evidence.

Allocates one record without checking NULL, stores spawn_kind narrowed to u8, gfx_id and borrowed jobj. The switch decodes original u32 spawn_kind; unknown kinds assert. Only required payload fields are initialized; scalar-only types3/4 write params.x, leaving y/z untouched. Copies scalar/vector values immediately, but retains JObj pointer without reference increment. If current HSD_GObj process exists with s_link<9, prepends to supplied sentinel; otherwise processes/frees immediately and does not access queue_head. Deferral does not store gobj, so caller must flush with intended owner. No argument-schema, allocation, reference-lifetime or reentrancy guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1405-L1464

### efAsync_QueueInit

void efAsync_QueueInit(void). . Source signature; positional parameter entities are not ABI evidence.

Calls HSD_ObjAllocInit with EF_QueuedEffect size and pointer-size alignment. Callee removes descriptor from registry, clears it and registers fresh state; it does not free or preserve old pool allocations or owner queues. Initialization must precede allocation; repeated initialization with live/free records is not a safe reset guarantee.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/efasync.c#L1466-L1470

## Queue schemas and ownership

Types0/1 take no trailing payload;2/7/8 copy Vec3;3/4 copy one f32 into params.x;5 copies Vec3 plus scalar;6 copies Vec3 plus two scalars. Types0/3/7 pass attachment JObj;1/4 transform origin;2/5/6/8 transform local offset. JObj transform is sampled at execution, payload values at request creation. Record stores no gobj, reference count or capture of full transform. y/z are uninitialized for scalar-only requests and must not be read as a full Vec3 by an incompatible recipe. Queue sentinel is caller-owned, never allocator-freed.

## Dispatcher boundaries

144explicit tags0x3E8..0x477. efSync routes a wider range0x250..0x477 here; unhandled IDs still drain animation queue. Cases0x41B,0x432,0x43F,0x443,0x44A/B/C omit ret_obj assignment despite creation.0x3ED returns first generator and may create a second;0x427 builds up to6 linked effects with partial success. Selected model recipes mark ASYNC but not all; selected cases override global load kind without restoring it. Common epilogue reads packed JObj-pointer queue storage and drains reverse-order; canonical constructor matches packed pointer writes.0x42B passes two va_arg expressions in one function call, so a left-to-right color argument order is not proven.

Six inline helpers get effect JObj, set explicit/random Z rotation, set uniform/vector scale, and select Y rotation by facing sign. They require valid objects/pointers. Uniform scale helper contains a preliminary jobj->scale.x read. Random rotation uses M_TAU*HSD_Randf; facing<0 selects-M_PI_2, otherwise+M_PI_2.

## Resource catalog

51declared slots,35named and16empty; loaders use0..49. Names cover common, fighters, menu and Kirby variants; exact mapping retained in canonical lines1135..1258. Catalog entry is a name/name/cache record, while loaded export is cast through the same type for command-bank,texture-bank and following data address. Sync publishes address of third export field, even when no particle bank initialized. OnLoad only relocates and never publishes cache/registry index. OR guard does not establish both command and texture pointer validity. Pointer formation precedes loader index checks.

## Recipe inventory

Each row preserves exact direct constructor calls and local va_arg footprint. Grouped labels follow their shared body; delegated helpers have schemas documented above. Reads after failed constructors are skipped. Concrete runtime visuals/assets and compiled switch tables were not inspected.

| Gfx ID | Canonical lines | Constructor calls | Direct vararg types |
|---|---|---|---|
| 0x3E8 | [98, 116] | efLib_Create_Attach_Pos(9, gobj, va_arg(vlist, Vec3*)); efLib_Create_Attach_Pos(0xA, gobj, va_arg(vlist, Vec3*)) | Vec3*, Vec3*, f32* |
| 0x3E9 | [117, 119] | efLib_CreateGenerator(0xC, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3EA | [120, 122] | efLib_CreateGenerator(0x14, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3EB | [123, 128] | efLib_Create_Attach_Pos(7, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3EC | [129, 135] | efLib_Create_Attach_Pos(8, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3ED | [136, 155] | efLib_CreateGenerator(0x50, &translate); efLib_CreateGenerator_AddAppSRT(0x54) | Vec3*, f32* |
| 0x3EE | [156, 161] | efLib_Create_Attach_Pos(0x27, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3EF | [162, 173] | efLib_CreateGenerator_Translate_FacingDir(0x42, &translate, f32_1) | Vec3*, f32*, f32* |
| 0x3F0 | [163, 173] | efLib_CreateGenerator_Translate_FacingDir(0x42, &translate, f32_1) | Vec3*, f32*, f32* |
| 0x3F1 | [174, 185] | efLib_CreateGenerator_Translate_FacingDir(0x14B, &translate, f32_1) | Vec3*, f32*, f32* |
| 0x3F2 | [175, 185] | efLib_CreateGenerator_Translate_FacingDir(0x14B, &translate, f32_1) | Vec3*, f32*, f32* |
| 0x3F3 | [186, 188] | efLib_CreateGenerator(0xB, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3F4 | [189, 191] | efLib_CreateGenerator(0x48, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3F5 | [192, 198] | efLib_Create_Attach_Pos(0x10, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x3F6 | [199, 204] | efLib_Create_Attach_Pos(0x11, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3F7 | [205, 212] | efLib_Create_Attach_Pos(0x12, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32*, f32* |
| 0x3F8 | [213, 220] | efLib_Create_Attach_Pos(0x13, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32*, f32* |
| 0x3F9 | [221, 228] | efLib_Create_Attach_Pos(0x14, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32*, f32* |
| 0x3FA | [229, 234] | efLib_Create_Attach_Pos(0x15, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3FB | [235, 240] | efLib_Create_Attach_Pos(0x16, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3FC | [241, 246] | efLib_Create_Attach_Pos(0x17, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x3FD | [247, 254] | efLib_Create_Attach_Pos(3, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32*, f32* |
| 0x3FE | [255, 261] | efLib_CreateGenerator_Translate_FacingDir(0x107, &translate, f32_1) | Vec3*, f32* |
| 0x3FF | [262, 269] | efLib_Create_Attach_Pos(5, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32*, f32* |
| 0x400 | [270, 281] | efLib_CreateGenerator_Translate_FacingDir(0x5A, &translate, f32_1) | Vec3*, f32*, f32* |
| 0x401 | [271, 281] | efLib_CreateGenerator_Translate_FacingDir(0x5A, &translate, f32_1) | Vec3*, f32*, f32* |
| 0x402 | [282, 284] | hsd_8039EFAC(0, 0, 0x59, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x403 | [285, 287] | hsd_8039EFAC(0, 0, 0x5E, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x404 | [288, 294] | efLib_Create_Attach_Pos(0x18, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x405 | [295, 297] | efLib_CreateGenerator(0x2C, va_arg(vlist, Vec3*)) | Vec3* |
| 0x406 | [298, 304] | efLib_Create_Attach_Pos(4, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x407 | [305, 307] | efLib_CreateGenerator(0x3C, va_arg(vlist, Vec3*)) | Vec3* |
| 0x408 | [308, 321] | efLib_CreateGenerator_AddAppSRT(0x3E) | Vec3*, f32* |
| 0x409 | [322, 324] | hsd_8039EFAC(0, 0, 0xE2, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x40A | [325, 338] | efLib_CreateGenerator_AddAppSRT(0x241) | Vec3*, f32* |
| 0x40B | [339, 352] | efLib_CreateGenerator_AddAppSRT(0x242) | Vec3*, f32* |
| 0x40C | [353, 355] | efLib_CreateGenerator(0x19, va_arg(vlist, Vec3*)) | Vec3* |
| 0x40D | [356, 371] | efLib_CreateGenerator_AddAppSRT(0x19) | Vec3* |
| 0x40E | [372, 374] | efLib_CreateGenerator(0x43, va_arg(vlist, Vec3*)) | Vec3* |
| 0x40F | [375, 377] | efLib_CreateGenerator(0xE3, va_arg(vlist, Vec3*)) | Vec3* |
| 0x410 | [378, 380] | efLib_CreateGenerator(0x22A, va_arg(vlist, Vec3*)) | Vec3* |
| 0x411 | [381, 383] | efLib_CreateGenerator(0x4B, va_arg(vlist, Vec3*)) | Vec3* |
| 0x412 | [384, 386] | hsd_8039EFAC(0, 0, 0x13, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x413 | [387, 389] | hsd_8039EFAC(0, 0, 0x37, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x414 | [390, 392] | hsd_8039EFAC(0, 0, 0xE1, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x415 | [393, 402] | efLib_Create_AttachChild(0x25, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x416 | [403, 405] | efLib_CreateGenerator(0x196, va_arg(vlist, Vec3*)) | Vec3* |
| 0x417 | [406, 427] | efLib_Create_Attach(0xB, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, u32 |
| 0x418 | [428, 449] | efLib_Create_Attach(0xC, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, u32 |
| 0x419 | [450, 483] | efLib_Create_Attach(0xD, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, u32 |
| 0x41A | [484, 505] | efLib_Create_Attach(0xE, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, u32 |
| 0x41B | [506, 520] | efLib_CreateGenerator_AddAppSRT(0x31) | HSD_JObj* |
| 0x41C | [521, 523] | efLib_CreateGenerator(0x5D, va_arg(vlist, Vec3*)) | Vec3* |
| 0x41D | [524, 529] | efLib_Create_Attach_Pos(0xF, gobj, va_arg(vlist, Vec3*)) | Vec3* |
| 0x41E | [530, 532] | efLib_CreateGenerator_AppSRT_SetScale(0x55, vlist) |  |
| 0x41F | [533, 535] | efLib_CreateGenerator(0x5C, va_arg(vlist, Vec3*)) | Vec3* |
| 0x420 | [536, 538] | efLib_CreateGenerator(0x159, va_arg(vlist, Vec3*)) | Vec3* |
| 0x421 | [539, 541] | efLib_CreateGenerator(0x3F, va_arg(vlist, Vec3*)) | Vec3* |
| 0x422 | [542, 544] | hsd_8039EFAC(0, 0, 0x5B, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x423 | [545, 550] | efLib_Create_Attach(1, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x424 | [551, 556] | efLib_Create_Attach(2, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x425 | [557, 559] | efLib_CreateGenerator(0x7E, va_arg(vlist, Vec3*)) | Vec3* |
| 0x426 | [560, 562] | efLib_CreateGenerator(0x7F, va_arg(vlist, Vec3*)) | Vec3* |
| 0x427 | [563, 588] | efLib_Create_Attach_Pos(0x1B, gobj, &translate) | Vec3* |
| 0x428 | [589, 591] | efLib_CreateGenerator_AppSRT_SetScale(0xCA, vlist) |  |
| 0x429 | [592, 594] | efLib_CreateGenerator_AppSRT_SetScale(0xCE, vlist) |  |
| 0x42A | [595, 597] | efLib_CreateGenerator_AppSRT_SetScale(0xCF, vlist) |  |
| 0x42B | [598, 620] | efLib_Create_Attach_Pos(0x19, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32*, f32*, u32, u32 |
| 0x42C | [621, 629] | efLib_Create_Attach_Pos(0x1A, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x42D | [630, 633] | efLib_CreateGenerator(0x121, va_arg(vlist, Vec3*)) | Vec3* |
| 0x42E | [634, 640] | efLib_CreateGenerator_Translate_FacingDir(0x13C, &translate, f32_1) | Vec3*, f32* |
| 0x42F | [641, 653] | efLib_Create_Attach_Pos(0x20, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x430 | [654, 660] | efLib_CreateGenerator_Translate_FacingDir(0x140, &translate, f32_1) | Vec3*, f32* |
| 0x431 | [661, 673] | efLib_Create_Attach_Pos(0x21, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x432 | [674, 687] | efLib_CreateGenerator_AddAppSRT(0x145) | Vec3*, f32* |
| 0x433 | [688, 690] | hsd_8039EFAC(0, 0, 0x115, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x434 | [691, 693] | efLib_CreateGenerator(0x14D, va_arg(vlist, Vec3*)) | Vec3* |
| 0x435 | [694, 716] | efLib_CreateGenerator_AddAppSRT(u32_1) | Vec3*, f32* |
| 0x436 | [697, 716] | efLib_CreateGenerator_AddAppSRT(u32_1) | Vec3*, f32* |
| 0x437 | [700, 716] | efLib_CreateGenerator_AddAppSRT(u32_1) | Vec3*, f32* |
| 0x438 | [717, 730] | efLib_Create_Attach(0x22, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x439 | [731, 737] | efLib_Create_Attach(0x23, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x43A | [738, 740] | efLib_CreateGenerator(0x193, va_arg(vlist, Vec3*)) | Vec3* |
| 0x43B | [741, 743] | efLib_CreateGenerator(0x192, va_arg(vlist, Vec3*)) | Vec3* |
| 0x43C | [744, 746] | efLib_CreateGenerator(0x1A0, va_arg(vlist, Vec3*)) | Vec3* |
| 0x43D | [747, 749] | hsd_8039EFAC(0, 0, 0x1AF, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x43E | [750, 757] | efLib_Create_Attach(0x24, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x43F | [758, 772] | efLib_CreateGenerator_AddAppSRT(0xCA) | Vec3*, f32* |
| 0x440 | [773, 779] | efLib_CreateGenerator_Translate_FacingDir(0x1D8, &translate, f32_1) | Vec3*, f32* |
| 0x441 | [780, 782] | efLib_CreateGenerator(0x1FB, va_arg(vlist, Vec3*)) | Vec3* |
| 0x442 | [783, 785] | efLib_CreateGenerator(0x1DC, va_arg(vlist, Vec3*)) | Vec3* |
| 0x443 | [786, 799] | efLib_CreateGenerator_AddAppSRT(0x1F1) | Vec3*, f32* |
| 0x444 | [800, 802] | efLib_CreateGenerator(0x1FF, va_arg(vlist, Vec3*)) | Vec3* |
| 0x445 | [803, 805] | efLib_CreateGenerator(0x209, va_arg(vlist, Vec3*)) | Vec3* |
| 0x446 | [806, 816] | efLib_CreateGenerator_AppSRT_SetPos(0x1B, gobj, source_jobj, va_vec3) | HSD_JObj*, Vec3* |
| 0x447 | [817, 829] | efLib_Create_Attach_Pos(0x28, gobj, va_arg(vlist, Vec3*)) | Vec3*, f32* |
| 0x448 | [830, 838] | efLib_CreateGenerator_AppSRT_SetPos(0x92, gobj, va_jobj, va_pos) | void*, void* |
| 0x449 | [839, 841] | efLib_Create_Attach(0x26, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x44A | [842, 862] | efLib_CreateGenerator_AddAppSRT(0x237) | Vec3* |
| 0x44B | [845, 862] | efLib_CreateGenerator_AddAppSRT(0x237) | Vec3* |
| 0x44C | [848, 862] | efLib_CreateGenerator_AddAppSRT(0x237) | Vec3* |
| 0x44D | [863, 865] | efLib_CreateGenerator_AppSRT_SetScale(0x48, vlist) |  |
| 0x44E | [866, 869] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDA, vlist) |  |
| 0x457 | [867, 869] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDA, vlist) |  |
| 0x44F | [870, 873] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDB, vlist) |  |
| 0x458 | [871, 873] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDB, vlist) |  |
| 0x450 | [874, 877] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDC, vlist) |  |
| 0x459 | [875, 877] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDC, vlist) |  |
| 0x451 | [878, 881] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDD, vlist) |  |
| 0x45A | [879, 881] | efLib_CreateGenerator_AppSRT_SetFacingDirScale(0xDD, vlist) |  |
| 0x453 | [882, 895] | efLib_CreateGenerator_Translate_FacingDir( 0x234, &translate, *va_arg(vlist, f32*)) | HSD_JObj*, f32*, f32* |
| 0x454 | [896, 909] | efLib_CreateGenerator_Translate_FacingDir( 0x235, &translate, *va_arg(vlist, f32*)) | HSD_JObj*, f32*, f32* |
| 0x455 | [910, 923] | efLib_CreateGenerator_Translate_FacingDir( 0x236, &translate, *va_arg(vlist, f32*)) | HSD_JObj*, f32*, f32* |
| 0x456 | [924, 937] | efLib_CreateGenerator_Translate_FacingDir( 0x23D, &translate, *va_arg(vlist, f32*)) | HSD_JObj*, f32*, f32* |
| 0x452 | [938, 951] | efLib_CreateGenerator_AddAppSRT(0x21E) | HSD_JObj*, f32* |
| 0x45B | [952, 954] | efLib_CreateGenerator_AppSRT_SetScale(0x8C, vlist) |  |
| 0x45C | [955, 957] | efLib_CreateGenerator_AppSRT_SetScale(0x8D, vlist) |  |
| 0x45D | [958, 971] | efLib_CreateGenerator_AddAppSRT(0x23F) | HSD_JObj*, f32* |
| 0x45E | [972, 985] | efLib_CreateGenerator_AddAppSRT(0x240) | HSD_JObj*, f32* |
| 0x45F | [986, 988] | efLib_CreateGenerator_AppSRT_SetScale(0x8E, vlist) |  |
| 0x460 | [989, 991] | efLib_CreateGenerator_AppSRT_SetScale(0x99, vlist) |  |
| 0x461 | [992, 994] | efLib_CreateGenerator_AppSRT_SetScale(0x95, vlist) |  |
| 0x462 | [995, 997] | efLib_CreateGenerator_AppSRT_SetScale(0x219, vlist) |  |
| 0x463 | [998, 1006] | efLib_Create_Attach(0x29, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x464 | [1007, 1015] | efLib_Create_Attach(0x2A, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x465 | [1016, 1018] | efLib_CreateGenerator_AppSRT_SetScale(0x88, vlist) |  |
| 0x466 | [1019, 1021] | efLib_CreateGenerator_AppSRT_SetScale(0x89, vlist) |  |
| 0x467 | [1022, 1024] | efLib_CreateGenerator_AppSRT_SetScale(0x8A, vlist) |  |
| 0x468 | [1025, 1033] | efLib_Create_Attach(0x2C, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x469 | [1034, 1042] | efLib_Create_Attach(0x2E, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x46A | [1043, 1057] | efLib_CreateGenerator_AddAppSRT(0xAC) | HSD_JObj*, f32* |
| 0x46B | [1058, 1066] | efLib_Create_Attach(0x2B, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x46C | [1067, 1081] | efLib_CreateGenerator_AddAppSRT(0x9E) | HSD_JObj*, f32* |
| 0x46D | [1082, 1090] | efLib_Create_Attach(0x2D, gobj, va_arg(vlist, HSD_JObj*)) | HSD_JObj*, f32* |
| 0x46E | [1091, 1093] | efLib_CreateGenerator_AppSRT_SetScale(0xAE, vlist) |  |
| 0x46F | [1094, 1096] | efLib_CreateGenerator_AppSRT_SetScale(0xA0, vlist) |  |
| 0x470 | [1097, 1099] | efLib_CreateGenerator_AppSRT_SetScale(0x21B, vlist) |  |
| 0x471 | [1100, 1102] | efLib_CreateGenerator_AppSRT_SetScale(0x220, vlist) |  |
| 0x472 | [1103, 1105] | efLib_CreateGenerator_AppSRT_SetScale(0x131, vlist) |  |
| 0x473 | [1106, 1108] | hsd_8039EFAC(0, 0, 0x82, va_arg(vlist, HSD_JObj*)) | HSD_JObj* |
| 0x477 | [1109, 1111] | efLib_CreateGenerator(0x7918, va_arg(vlist, Vec3*)) | Vec3* |
| 0x474 | [1112, 1114] | efLib_CreateGenerator(0xF7, va_arg(vlist, Vec3*)) | Vec3* |
| 0x475 | [1115, 1117] | efLib_CreateGenerator(0xFC, va_arg(vlist, Vec3*)) | Vec3* |
| 0x476 | [1118, 1121] | efLib_CreateGenerator(0xFF, va_arg(vlist, Vec3*)) | Vec3* |

All frozen facts have IDs and updated_at versions with individual decisions. Exact outgoing archived links retained; section links unresolved. No source/shared KB changes, matching, server or publication.
