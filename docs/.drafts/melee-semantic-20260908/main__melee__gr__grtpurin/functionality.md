# TPurin stage controller

This unit publishes the `Gr_Kind_TPurin` descriptor backed by `/GrTPr.dat`, retaining the existing identification as Jigglypuff's Target Test course. Its callback array contains three populated Ground-object records and a fourth all-null record. Only object 2 has flags `0xC0000000`; their wider meaning is not established here.

## Initialization and callback installation

Initialization caches `Ground_GetYakumonoParam()`, clears `stage_info.unk8C.b4`, sets `b5`, configures objects 0, 1 and 2 in order, then calls four shared Ground setup routines. The indexed helper has no bounds check. A missing GObj produces an `OSReport` and a null return, which initialization ignores before continuing. The shared setup inline clears two Ground callback fields, establishes the display link, conditionally stores callback3, invokes the initializer and schedules the process. It does not install callback1 or consume the table flags in this inline. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L15-L94), [setup inline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L33-L62).

The demo and load hooks are inert. Start delegates to `grZakoGenerator_801CAE04(NULL)`; this call alone does not establish spawned objects or generator lifetime. Object 0 delegates animation setup using its map ID and index zero. Objects 1 and 2 use the shared JObj initializer. All three callback1 predicates return false; all fourth callbacks are empty. Object 0's process is empty, while object 1 forwards its GObj to `Ground_801C2FE0`. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L96-L177), [JObj inline](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/inlines.h#L24-L30).

## Conditional collision and shared effect lifetimes

Object 2 processes precisely the map-joint IDs `0x37, 0x39, 0x3B, 0x3D, 0x3F, 0x41, 0x43`, followed by signed sentinel `-1`. Each is mapped through `Ground_801C32D4(2, value)`. An unmapped result is skipped without collision mutation. For a valid result, an existing JObj whose transformed position satisfies `vec.x < 130.0f` sends the mapped index to `mpJointListAdd`; a missing JObj or failed comparison sends it to `mpLib_80057BC0`. Equality does not add, and an unordered comparison also follows the latter branch. The callback then calls `lb_800115F4()` before `Ground_801C2FE0(gobj)`. [Complete process](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L127-L152).

The first post-loop call is not a collision refresh: it traverses a global effect list, accumulates pre-decay scale for records with `x0 == 1`, decays/clamps scale, decrements positive counts, advances angle counters and recycles records whose count is zero. It updates a shared numeric state to `1` or `2` when accumulated scale exceeds `0.1`, otherwise to `-1` or `0`, depending on whether the prior state was positive. Those numeric states are not assigned stronger names here. These are cross-file shared effects, not per-GObj records owned by this callback. [Effect updater](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_00F9.c#L939-L992).

## Dynamics and shadow policy

The touch-line callback rejects literal line sentinel `-1`, resolves the line with `mpJointFromLine`, rejects mapped sentinel `-1`, and calls `mpLineGetKind` without using its result. Mapped joints 0 and 1 both return `yakumono_param->x0`; other paths return null. The successful branches have no cache-pointer null check, allocation, copy or ownership transfer. Initialization must supply a valid parameter block whose external lifetime covers these reads. No local cleanup or reset is present. The stage-level Boolean callback always returns false. The shadow-check callback ignores all three arguments and always returns true, meaning this hook does not suppress a query—not that other systems necessarily draw a shadow. [Policies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L179-L201), [independent slot identities](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/types.h#L157-L171).

## Semantic and rendered-name assessment

Existing lifecycle, object-slot, dynamics-lookup and shadow-check names fit canonical behavior and remain inferred spellings. No cosmetic renaming is proposed. The header and implementation signatures agree; the header renderer leaves two proposed names unsubstituted with `shadowed_binding` reports. Rendered external helper names were not used as self-proving evidence. Corrections distinguish the four-entry array from its three used records and identify the global effect updater separately from Ground processing. Four section-type facts remain unresolved because source declarations and literals do not prove compiled section placement or extents.

Status: researched; no-change lead bypass; independent review and live promotion pending.
