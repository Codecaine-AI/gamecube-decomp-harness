# main/sysdolphin/baselib/fobj

Status: TU synthesis complete; independent root review pending.

# FObj Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Started 2026-09-08T14:59:56Z; ended 2026-09-08T15:03:11Z. Complete C 1–497 and header 1–91 canonical and rendered coverage. Rendering succeeded; C reports four parse errors, header zero. No substitutions. Manual canonical review includes all MUST_MATCH branches.

All 55 writable subjects and 92 facts reviewed: {'unresolved': 27, 'retain': 59, 'supersede': 6}. All 30 source functions are documented below. No inferred function names are proposed.

## Interpreter Contract

Descriptors become zeroed channel nodes with a borrowed stream pointer. Request initializes working data and state1. Packed headers combine a low-nibble opcode and variable-length run count; payloads supply values/slopes and waits. States1/2 load data,3 loads wait,4 processes the interval and5 yields until another tick. Local state6 handles stream exhaustion without being stored into flags.

High flags0x20,0x40,0x80 mean slope recomputation, pending key and ready key in the observed paths. Request clears pending0x40 but preserves the other high bits. Stop conditionally invokes the interpreter for KEY and then stores0; it does not promise output for every buffered key.

### `HSD_FObjGetAllocData`

`HSD_ObjAllocData* HSD_FObjGetAllocData(void)`

Returns &fobj_alloc_data without initialization or mutation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L10-L13.

### `HSD_FObjInitAllocData`

`void HSD_FObjInitAllocData(void)`

Passes the allocator descriptor, sizeof(HSD_FObj) and alignment 4 to HSD_ObjAllocInit.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L15-L18.

### `HSD_FObjRemove`

`void HSD_FObjRemove(HSD_FObj* fobj)`

Null input returns; otherwise forwards one node to HSD_FObjFree. Does not unlink owner or traverse next.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L20-L27.

### `HSD_FObjRemoveAll`

`void HSD_FObjRemoveAll(HSD_FObj* fobj)`

Null-terminated recursive removal; removes successor chain before current node. No cycle/depth guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L29-L36.

### `HSD_FObjSetState`

`u32 HSD_FObjSetState(HSD_FObj* fobj, u32 state)`

For non-null node, stores state low nibble while preserving flags high nibble. Returns original unmasked u32 state even for null input.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L38-L44.

### `HSD_FObjGetState`

`u32 HSD_FObjGetState(HSD_FObj* fobj)`

Returns zero for null or flags&0xF for a node; no writes.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L46-L52.

### `HSD_FObjReqAnim`

`static inline void HSD_FObjReqAnim(HSD_FObj* fobj, f32 startframe)`

Null-safe rewind to ad_head, time=startframe+request, zero op/op_intrp, pack count, duration, values and slopes; clears 0x40 and enters state 1. Other high flags including 0x20/0x80 are preserved.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L54-L72.

### `HSD_FObjReqAnimAll`

`void HSD_FObjReqAnimAll(HSD_FObj* fobj, f32 startframe)`

Traverses next in order and applies identical requested frame through the local reset helper.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L74-L85.

### `FObj_FlushKeyData`

`static inline void FObj_FlushKeyData(HSD_FObj* fobj, void* obj, HSD_ObjUpdateFunc obj_update, f32 rate)`

Calls interpreter only when op_intrp equals KEY; forwards object, callback and rate.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L87-L93.

### `HSD_FObjStopAnim`

`void HSD_FObjStopAnim(HSD_FObj* fobj, void* obj, HSD_ObjUpdateFunc obj_update, f32 rate)`

Null-safe; conditionally interprets KEY once, then stores state 0 while preserving high flags. Does not guarantee a callback if inactive or time remains negative.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L95-L104.

### `HSD_FObjStopAnimAll`

`void HSD_FObjStopAnimAll(HSD_FObj* fobj, void* obj, HSD_ObjUpdateFunc obj_update, f32 rate)`

Traverses next and stops every node with unchanged object, callback and rate.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L106-L112.

### `parseFloat`

`static f32 parseFloat(u8** pos, u8 frac)`

Exact format zero consumes four little-endian bytes as f32 bits. High format bits select signed/unsigned 8/16-bit integer reads and low five bits select binary fractional shift. Advances by numeric width. Unknown class returns zero without cursor advance; does not check bounds or shift validity.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L114-L153.

### `parseOpCode`

`static u8 parseOpCode(u8** curr_parse)`

Reads low nibble of next byte without advancing cursor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L155-L158.

### `parsePackInfo`

`static u32 parsePackInfo(u8** adp)`

Consumes header; count starts at bits4–6 plus one. Continued bytes add seven-bit chunks at shifts3,10,... until high bit clears. Returns u32, later narrowed to u16 nb_pack. No stream bounds or continuation limit.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L160-L178.

### `FObjLaunchKeyData`

`static void FObjLaunchKeyData(HSD_FObj* fobj)`

If 0x40 pending, copies op to op_intrp, clears pending, sets ready 0x80 and copies p1 to p0; otherwise no work.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L180-L188.

### `parseWait`

`static s32 parseWait(u8** adp)`

Consumes seven-bit low chunks with continuation bit into signed wait at shifts0,7,...; no bounds/shift guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L190-L203.

### `FObjLoadWait`

`static u32 FObjLoadWait(HSD_FObj* fobj)`

Asserts state3. If cursor offset reached length returns local state6 without storing it. Otherwise parses wait into u16 fterm, sets 0x20 and stores state2.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L205-L217.

### `FObjAnimCON`

`static u32 FObjAnimCON(HSD_FObj* fobj)`

Asserts state1/2, shifts p1 to p0, parses new p1; unless prior interpolation is slope opcode5, shifts d1 to d0 and zeros d1. Stores state3 from state1, otherwise state4.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L219-L232.

### `FObjAnimLinear`

`static u32 FObjAnimLinear(HSD_FObj* fobj)`

Same value/slope loading transitions as CON; distinction is later op_intrp evaluation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L234-L247.

### `FObjAnimSPL0`

`static u32 FObjAnimSPL0(HSD_FObj* fobj)`

Asserts state1/2, shifts endpoints/slopes, parses p1, zeros d1, and stores state3 for initial load or state4 thereafter.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L249-L260.

### `FObjAnimSPL`

`static u32 FObjAnimSPL(HSD_FObj* fobj)`

Asserts state1/2, shifts endpoints/slopes, parses p1 using value format and d1 using slope format; stores state3 initially or state4 thereafter.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L262-L273.

### `FObjAnimSLP`

`static u32 FObjAnimSLP(HSD_FObj* fobj)`

Asserts state1/2, shifts d1 to d0 and parses new slope. Leaves state unchanged, allowing further data loading.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L275-L284.

### `FObjAnimKey`

`static u32 FObjAnimKey(HSD_FObj* fobj)`

Launches prior pending key, parses p1 and sets pending0x40. Stores state3 initially or state4 thereafter.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L286-L296.

### `FObjLoadData`

`static inline u32 FObjLoadData(HSD_FObj* fobj)`

Returns local6 at stream end without storing state. Otherwise copies previous op into op_intrp, decodes header/count if nb_pack zero, decrements u16 count and dispatches op1–6. Unknown op returns local0 without storing stopped state. Checks only initial cursor offset, not whole payload.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L298-L334.

### `FObjUpdateAnim`

`void FObjUpdateAnim(HSD_FObj* fobj, void* obj, HSD_ObjUpdateFunc obj_update)`

Null callback returns before accessing fobj. KEY emits p0 only with ready0x80 and clears it; CON selects endpoint by time>=fterm. LIN lazily calculates slope under 0x20, with zero-duration snap, then evaluates d0*time+p0. SPL0/SPL/SLP call Hermite with inverse duration or use p1 for zero duration. Unsupported op falls through and calls callback with uninitialized local HSD_ObjData. Supported paths pass obj, obj_type and address of stack payload.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L336-L388.

### `HSD_FObjInterpretAnim`

`void HSD_FObjInterpretAnim(HSD_FObj* fobj, void* obj, HSD_ObjUpdateFunc obj_update, f32 rate)`

Null/inactive node does nothing. Active node adds rate; negative resulting time stops processing. States1/2 load data,3 emits ready output then loads wait,4 subtracts elapsed duration and continues or evaluates and stores5,5 stores4 and resumes. Local6 restores last subtracted duration, launches key, evaluates and returns without persisting6. Local0 returns. Unsupported state7–15 has no switch arm and loops indefinitely once processing starts.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L390-L456.

### `HSD_FObjInterpretAnimAll`

`void HSD_FObjInterpretAnimAll(void* fobj, void* obj, HSD_ObjUpdateFunc obj_update, f32 rate)`

Casts void* list head to HSD_FObj* and interprets each node in next order with same context/callback/rate. Reads next after callback-driven interpretation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L458-L466.

### `HSD_FObjLoadDesc`

`HSD_FObj* HSD_FObjLoadDesc(HSD_FObjDesc* desc)`

Recursively creates zeroed runtime nodes in descriptor order. Narrows descriptor f32 startframe to runtime s16; copies type, formats, length and borrowed ad pointer into ad_head. Leaves flags0 and current ad NULL until request rewinds it. Null descriptor returns NULL.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L468-L483.

### `HSD_FObjAlloc`

`HSD_FObj* HSD_FObjAlloc(void)`

Gets pool allocation, asserts non-null, zeroes sizeof(HSD_FObj), returns node.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L485-L491.

### `HSD_FObjFree`

`void HSD_FObjFree(HSD_FObj* fobj)`

Unconditionally forwards descriptor and node to HSD_ObjFree; no local null/ownership guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L493-L496.

## Header and Coverage

Owned fobj.h defines opcode0–6, numeric format classes, initial loader state labels, runtime HSD_FObj and descriptor layouts, HSD_ObjData and public prototypes. Runtime startframe is s16 versus descriptor f32; fterm and nb_pack are u16. The stream decoder returns wider integers that narrow at assignment. Payload uses HSD_ObjData.fv. Public prototype spelling agrees with C, including type-erased InterpretAnimAll head. No new shared type identity or field rename is proposed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.h#L11-L88.

The authored global fobj_alloc_data is declared at C line8 and returned directly by its accessor. Its existence does not establish that the entire .bss section corresponds exactly to that symbol. All four data-section claim sets remain unresolved pending object/map evidence.

Allocator internals, startup registry behavior, statistics and AObj caller/loop contracts were not read here and retain explicit unresolved dispositions. No foreign reading is claimed. All function and parameter facts are individually reviewed with IDs and update timestamps; helper output has no integer versions.

Unsupported interpreter states7–15 can loop indefinitely, unsupported interpolation op can pass an uninitialized payload, and decoder reads do not enforce a complete payload boundary. These are canonical edge observations, not source-change proposals. Existing names remain unchanged.

Dry-run valid: 6 accepted, 0 rejected. Proposal SHA-256 `975bc45559325158d74a2d4d3b46e57f6115c1eae5200906ac4bb4e0b0fa9a28`.


## TU independent review

State setter preserves upper nibble and returns unmasked input. Request clears0x40 but preserves other high bits while resetting data/time/interpolation fields. Stop KEY path conditionally invokes interpretation then stores0. RemoveAll frees tail first. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L10-L112`.

Little-endian float and fixed scalar decoders are unbounded. Denominator is signed32 1<<fraction; fraction31 requires machine/compiler qualification. Pack count u32 narrows to u16; wait s32 narrows to u16. Exhaustion returns local6 without persistence. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L114-L217`.

CON/LIN preserve previous slope under op_intrp5; SLP does not change state. KEY staging flags40/80. Null callback returns before access. Unsupported interpolation passes uninitialized stack payload; key not-ready returns without callback. Zero-duration LIN writes p0=p1 and zero slope. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L219-L388`.

Interpreter adds rate before negative-time guard; NaN bypasses negative check. States1/2 load,3 wait,4 interval evaluation/advance,5 returns to4, local6 restores last subtracted duration and flushes. Invalid7..15 no switch arm. Descriptor float startframe narrows s16, ad borrowed, node zeroed. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L390-L497`.

Confirmed flags/op/type u8, nb_pack and fterm u16, startframe s16, descriptor startframe f32, scalar/vector union. C4 parse errors H0, no substitutions. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.h#L1-L91`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
