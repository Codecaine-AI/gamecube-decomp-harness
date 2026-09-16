# GObj GX-Link Semantic Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete owned canonical and rendered reads cover C lines 1–164 and H lines 1–22. Both renders succeeded with zero parse errors. C has five substitutions, H has three; rendered hypotheses are not proof.

Started 2026-09-08T14:43:48Z; ended 2026-09-08T14:47:20Z. Covered all 27 subjects, all 44 facts and all nine source functions. Dispositions: {'unresolved': 3, 'retain': 34, 'supersede': 7}. All 18 parameter entities had zero existing facts and are explicitly reviewed in JSON.

## Functionality and Contracts

Buckets are intrusive doubly linked lists ordered by ascending stored byte priority. Normal setup and SetupGXLinkMax search from the tail and insert after equals. SetupGXLinkMaxSorted and relocation search from the head and insert before equals. Both max variants therefore sort; their difference is equal-priority placement.

Setup accepts u32 priority but stores u8 render_priority before comparing. For example, 256 is stored as 0. Setup does not remove existing membership; the relocation routines do. Removal retains render_cb.

### `GObj_GXReorder`

`void GObj_GXReorder(HSD_GObj* gobj, HSD_GObj* hiprio_gobj)`

Inserts gobj after nullable hiprio_gobj in the bucket selected by gobj->gx_link. Null predecessor inserts at head. Repairs successor->prev_gx or bucket tail. Does not detach gobj, search priority, compare priorities, set callback, or validate bucket membership.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L10-L31.

### `GObj_SetupGXLink`

`void GObj_SetupGXLink(HSD_GObj* gobj, GObj_RenderFunc render_cb, u8 gx_link, u32 priority)`

Asserts requested u8 link is at most configured gx_link_max. Stores callback, link and the low byte of u32 priority. Scans backward from bucket tail while priority is greater, then inserts after the last value less than or equal to the stored priority. With a sorted valid list this puts the new node after existing equals. Does not detach existing membership.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L36-L53.

### `GObj_SetupGXLinkMax`

`void GObj_SetupGXLinkMax(HSD_GObj* gobj, GObj_RenderFunc render_cb, u32 priority)`

Stores callback and low byte of u32 priority; selects gx_link_max+1 through byte-sized gx_link. Scans backward from tail and inserts after existing equal priorities. Does not detach membership or assert configured maximum capacity.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L55-L70.

### `GObj_GXFindPrioPosition`

`static inline HSD_GObj* GObj_GXFindPrioPosition(HSD_GObj* gobj)`

Reads the selected bucket head and advances while node priority is strictly lower than gobj priority. Returns first greater-or-equal node or NULL; no mutation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L72-L82.

### `GObj_SetupGXLinkMaxSorted`

`void GObj_SetupGXLinkMaxSorted(HSD_GObj* gobj, GObj_RenderFunc render_cb, u32 priority)`

Stores callback and low byte of u32 priority, selects special max+1 bucket, scans forward to first greater-or-equal node, and inserts immediately before that node or at tail. Inserts before existing equals. Does not unlink gobj first.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L84-L102.

### `HSD_GObjGXLink_8039084C`

`void HSD_GObjGXLink_8039084C(HSD_GObj* gobj)`

Asserts gx_link is not HSD_GOBJ_GXLINK_NONE. Repairs predecessor/head and successor/tail independently, then sets gx_link to NONE, priority to zero and both neighbors to NULL. Preserves render_cb and does not free the object.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L104-L127.

### `get_by_prio`

`static inline HSD_GObj* get_by_prio(HSD_GObj* gobj)`

Reads bucket head and advances across strictly lower priorities. Returns first greater-or-equal node or NULL without modifying list or object.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L129-L136.

### `HSD_GObjGXLink_80390908`

`void HSD_GObjGXLink_80390908(HSD_GObj* gobj, u8 gx_link, u8 priority)`

Asserts destination link is within regular maximum, unlinks the already-linked object, sets u8 link and priority, then scans forward and inserts before first greater-or-equal priority or at tail. Callback survives removal and relocation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L138-L148.

### `HSD_GObjGXLink_803909D8`

`void HSD_GObjGXLink_803909D8(HSD_GObj* gobj, HSD_GObj* other)`

Saves other link and priority as u8, unlinks gobj, copies saved placement, and inserts after other->prev_gx as read after removal. For distinct linked objects this moves gobj immediately before other, including when previously adjacent. No distinctness check exists; self-reference reinserts at bucket head because removal clears the same object predecessor.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L150-L163.

## Naming Decisions

| Canonical | Existing Hypothesis | Decision |
|---|---|---|
| .data |  | retain canonical name; no redundant alias |
| GObj_GXReorder |  | retain canonical name; no redundant alias |
| GObj_SetupGXLink |  | retain canonical name; no redundant alias |
| GObj_SetupGXLinkMax |  | retain canonical name; no redundant alias |
| GObj_SetupGXLinkMaxSorted |  | retain canonical name; no redundant alias |
| HSD_GObjGXLink_8039084C | GObj_RemoveGXLink | retain existing hypothesis with refreshed pinned evidence |
| HSD_GObjGXLink_80390908 | GObj_SetGXLink | retain existing hypothesis with refreshed pinned evidence |
| HSD_GObjGXLink_803909D8 | HSD_GObjGXLinkMoveBefore | retain existing hypothesis with refreshed pinned evidence |

## Coverage and Deferred Work

Source-only inline helpers GObj_GXFindPrioPosition and get_by_prio are both covered. Each takes HSD_GObj* and returns HSD_GObj*, with no writes. The paired header prototypes agree with the seven external definitions. No foreign header is claimed as owned.

Foreign canonical reads verify u8 fields in gobj.h and GObj_RenderFunc as void (*)(HSD_GObj*, int) in forward.h. coverage.json records the exact ranges. These declarations support local assignment behavior; no shared field/type proposals are made.

The data section remains unresolved. Assertions are visible at C lines 42, 109 and 141, but no object mapping or section bytes were read to prove the inherited 104-byte string-block claim. The special max+1 bucket also depends on allocation/configuration invariants outside this TU.

For distinct linked objects, MoveBefore handles adjacency correctly because it reads other->prev_gx after removing gobj. If both arguments identify the same object, removal clears that predecessor and the object is reinserted at head. The function has no identity guard.

All fact IDs and timestamps are preserved with individual decisions. Integer versions are absent in helper output. Original fact snapshots are retained in dispositions.json. No source or KB writes occurred.

Dry-run valid: 10 accepted, 0 rejected. SHA-256 `db9964b34be3f7a3a886721741bb787b2cd755f16edce322ffd8847b293f9727`. Initial validation rejected a whole-file citation including trailing blank line 164; the validator counts 163 lines. The proposal now cites substantive lines 10–162. Full owned read coverage remains recorded.
