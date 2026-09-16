# `gobjobject` Functionality

Local research is complete. Independent proposal review and application are pending. Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. This TU contains four functions and one diagnostic data-section target. Both owned files and all thirteen writable subjects were reviewed.

## Operations

| Canonical Function | Operation | Evidence |
|---|---|---|
| `HSD_GObjObject_80390A3C` | Returns the first classifier match from the selected entity-list bucket, or NULL after exhaustion. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L6-L17` |
| `HSD_GObjObject_80390A70` | Asserts the old kind is NONE, then writes the supplied kind and payload verbatim. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L19-L24` |
| `HSD_GObjObject_80390ADC` | Detaches a non-NONE association and returns its old payload without calling cleanup. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L26-L37` |
| `HSD_GObjObject_80390B0C` | Calls the registered cleanup callback for non-NONE kind, then clears the fields after callback return. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L39-L46` |

The selected list index is a u8 used directly as an array index into HSD_GObj_Entities. The code follows next pointers and compares u16 classifier values. It has no local index bounds or cycle guard and does not alter list order. The foreign initializer allocates p_link_max + 1 heads, so callers must select a valid initialized bucket. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjinit.c#L30-L37`.

## Attachment State

HSD_GOBJ_OBJ_NONE is 0xFF. Only obj_kind decides whether an association is considered empty. hsd_obj is a separate opaque pointer. The foreign constructor initializes both consistently, but these operations do not enforce consistency for arbitrary caller inputs. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.h#L8-L49` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L66-L80`.

| Initial Kind | Operation | Result |
|---|---|---|
| NONE | Attach | Stores supplied kind and pointer, including NONE or NULL. |
| Non-NONE | Attach | Assertion fails before either field is overwritten. |
| NONE | Detach or cleanup | No writes; a stale payload is left unchanged. Detach returns NULL. |
| Non-NONE | Detach | Writes NONE, captures payload, clears payload, returns captured pointer. |
| Non-NONE | Cleanup | Invokes callback with old payload, then clears both fields if it returns. |

Attachment neither allocates nor retains the payload, and it does not validate the incoming kind against the callback table. A NULL detach result does not distinguish a NONE association from a non-NONE association whose payload was already NULL. The detach routine preserves its canonical UNK_T declaration; the local return variable is void*. No source type rewrite is proposed.

## Callback Lifetime Boundary

The cleanup table is populated by concatenating registered GObjFuncs arrays. It may be NULL when zero callbacks were registered. This TU calls table[obj_kind] directly with hsd_obj, without local table, index, callback, payload or GObj pointer checks. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjinit.c#L66-L85` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjobject.c#L39-L46`.

The callback runs before obj_kind or hsd_obj is cleared. Any callback that can observe the GObj through another reference sees the old attachment. There is no reentry guard, so a recursive cleanup can dispatch again. The trailing stores require normal return and a still-valid GObj; callback ownership and reentry safety are family-level contracts. Calling the operation "cleanup" does not prove every registered callback frees its payload.

Generic GObj cleanup calls this routine after userdata removal and before process cleanup. The routine manages the payload association; it does not itself unlink or deallocate the GObj. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L115`.

## Reviewed Caller Use

SObj list maintenance uses the detach operation before reattaching a replacement list head. The surviving sprite objects remain in the list; the detach itself invokes no payload cleanup. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L44-L86`. Another SObj removal path detaches or replaces the head before separately freeing the removed SObj at line 130; that broader caller behavior does not make detach a destructor. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sobjlib.c#L98-L130`.

## Naming and Data

The baseline assigned GObj_RemoveObject to both detach and callback cleanup, which prevented either substitution in both rendered pages. The proposal changes detach to GObj_DetachObject and retains GObj_RemoveObject only for cleanup. GObj_InitKindObj remains the attachment hypothesis; GObj_FindByClassifier is proposed for lookup. All remain hypotheses, and canonical address names remain source authority.

Canonical src/include and frozen current target/inferred-name inventory contain no collision for GObj_DetachObject or GObj_FindByClassifier. The only GObj_RemoveObject owners found were the two functions being reconciled. Final rendering must follow reviewed application to confirm the collision is resolved.

The inspected .data pools contain gobjobject.c and the attachment assertion expression. Existing objects agree on text but differ in trailing padding. The source assertion passes literal line 42 under MUST_MATCH and the current source line otherwise. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L11-L32`. Exact object hashes and section bytes are in `compiled-artifacts.json`; proposal rationales retain those hashes. This is read-only artifact evidence, not a freshness or binary-parity claim.

## Coverage and Family Boundaries

Canonical/rendered C1–47 and H1–16 were read through EOF. Both renders are ok with zero parser errors and next_line null. They record the two inherited name_collision entries; the header also records a shadowed_binding entry for lookup. These exceptions are preserved in `coverage.json`.

All 28 existing facts have explicit IDs, updated_at versions and retain/supersede decisions. The 36-operation proposal refreshes those facts, adds seven parameter-purpose facts, and adds one lookup-name fact. Its inherited detach-name replacement is included among the 28 refreshes. No clears or shared-KB writes occur.

Foreign HSD_GObj layout, list allocation, callback registration and payload lifetimes remain family-scoped. No foreign type or symbol is renamed. Source hashes, immutable read-page paths, UTC timestamps, validation and remaining review items are recorded in the packet.

## TU Lead Verification

Complete canonical and rendered source/header reviewed, all 36 proposed slots scanned. Detach returns payload without destructor; cleanup invokes callback before clear. Sentinel branches leave stale payload untouched. Retained RemoveObject reserved for callback cleanup; DetachObject resolves inherited collision. Lookup uses first classifier match in unguarded selected bucket. Foreign lifecycle and compiled diagnostics remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

## Current Application Status

Root completed reviewed staged application for 36 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjobject/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjobject/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/c4908b925b26b16ce7ebaefb40393274e1aa719a3e03fdfb6e662d1068cb8261/2026-09-08T14-53-21.113Z-7f3729c2-8e6e-4666-978f-bf6a39358654.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjobject/final-render.json).
