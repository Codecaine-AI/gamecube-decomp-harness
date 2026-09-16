Status: Reviewed and promoted to the live knowledge base.

# GObj Process-Link Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Start 2026-09-08T14:43:39.772186Z; end 2026-09-08T14:46:40.316367+00:00. Full canonical and rendered reads cover c1-197 and h1-20. Hashes, render metadata and exact read ranges are in coverage.json.

## Functions and Naming

### CreateGObj

Allocates an HSD_GObj and initializes its classifier, process-link/priority and attachment fields. For placement modes 0 through 3 it inserts the new object using priority or relative position. Allocation failure returns NULL. Other mode values return the allocated object without performing insertion.

Function signature: HSD_GObj* CreateGObj(s32 where, u16 classifier, u8 p_link, u8 priority, HSD_GObj* position). The where argument has the observed domain 0–3 and selects the insertion policy; classifier is copied into the object's classifier field, p_link is a process-list index, priority is the byte-sized process priority, and position supplies the reference object for relative placement modes.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L31-L96

### GObj_Create

Provides the standard three-argument constructor for an HSD_GObj, creating an initialized object and inserting it into the selected process-link list according to process priority.

HSD_GObj* GObj_Create(u16 classifier, u8 p_link, u8 priority); the arguments are respectively a game-object classifier, a process-link list index, and a byte-sized process priority.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L31-L101

### GObj_PReorder

Inserts an HSD_GObj into its process-link bucket immediately after a supplied predecessor, serving as the common doubly linked-list insertion primitive used when creating a game object or assigning it a new process-link position.

void (HSD_GObj* gobj, HSD_GObj* hiprio_gobj), where gobj is the object being inserted and hiprio_gobj is a nullable predecessor in the same process-link bucket; NULL denotes insertion at the bucket head.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L11-L27

### HSD_GObjPLink_80390228

Destroys an HSD_GObj: it releases the object's registered user data, attached HSD object, processes, and optional render-list membership, unlinks it from its process-link list, and returns its storage to the GObj allocator pool. Destruction is deferred when requested for the specially tracked active GObj under the guarded traversal state.

Signature: void HSD_GObjPLink_80390228(HSD_GObj* gobj). The parameter is required to be non-NULL and denotes the GObj whose complete ownership and list state will be torn down.

Canonical name retained; no current inferred-name fact.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L127

### HSD_GObjPLink_8039032C

Relocates an existing GObj using placement modes zero through three while unlinking and reinserting its attached processes. Requests affecting the active process-owned GObj defer unless deferred operations are being drained. Unknown modes are unchecked and can leave the object absent from its process-link bucket after detachment.

void(u32 arg0, HSD_GObj* gobj, u8 p_link, u8 priority, HSD_GObj* position). arg0 is the unchecked placement mode: 0/1 use priority tie policies, 2 inserts after a nullable predecessor, and 3 inserts before a required position. p_link is checked against the configured maximum.

Existing alias GObj_SetPLink retained as a descriptive hypothesis; canonical symbol unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L129-L196

## List and Lifecycle Behavior

GObj_PReorder inserts after a predecessor, or at head for NULL. It updates the successor back-link or tail when needed. It does not detach an object, enforce priority, validate an anchor, or check whether an anchor belongs to the selected p_link. Callers must supply a coherent list state.

Priority mode 0 searches backward while existing priorities are greater than the requested value, so new equal-priority objects go last. Mode 1 searches forward while priorities are smaller, so new equals go first. These preserve nondecreasing numerical priority only when the existing list already has that order. Mode 2 accepts NULL and inserts at head. Mode 3 reads position->prev, requiring a valid position. Explicit relative modes can deliberately violate priority sorting.

Creation initializes only listed fields; x34_unk receives no explicit write. Unknown placement modes skip insertion, potentially leaving next/prev uninitialized in the returned storage. Relocation with an unknown mode detaches and changes the object but skips its reinsertion, then still reinserts saved processes. These are caller-contract limitations, not validated error paths.

Teardown asserts a non-null GObj and defers when it owns the active callback and b0 is clear. Immediate teardown invokes user-data, HSD-object and process cleanup, conditionally unlinks GX state, repairs process bucket neighbors/head/tail, and frees storage. User-data and HSD-object removal use registered callbacks; this is not a claim that all attached resources always have unique ownership.

Relocation reverses the process child chain after scheduler unlinking; process reinsertion prepends each node, restoring original child order. The modulo-three stamp adjustment maps the older computed generation to the immediately previous generation. Deferred replay is supported by gobj.c105-138; b0 prevents the replay from deferring again.

## Header, Helpers, and Sections

The complete header includes runtime, forward declarations and gobj.h, and declares four source functions. GObj_Create is source-defined and declared through gobj.h; it remains explicitly reviewed. Three source inline helpers allocate or choose an insertion predecessor and have no manifest targets. All 16 parameter entities have exact source types and role descriptions in the proposal.

No shared type or field claims are promoted. HSD_GObjList remains the provisional representation documented by gobj.h111-113; code casts it to HSD_GObj** for bucket access.

Extern labels lbl_804084B8 and lbl_804084C4 and HSD_ASSERT uses are visible, but .data/.sdata literal placement, extent and padding require compiled evidence. All six existing section facts remain unresolved. Two broad game-category mappings also remain unresolved; no caller-independent fighter or menu ownership is inferred.

## Coverage

{"targets": 7, "entities": 17, "facts": 32, "retained": 16, "superseded": 8, "unresolved": 8, "proposed_facts": 24}

Every fact has an ID, frozen updated_at revision, full pinned citations and explicit retain/supersede/unresolved disposition. Both owned-file renders are complete and report zero parse errors. No source/KB writes, matching, publishing or UI actions were performed.

## Source-Only Helper Signatures

`static inline HSD_GObj* gobj_allocate(void)` returns allocator output. `static inline void gobj_first_lower_prio(HSD_GObj* gobj)` searches from the tail and inserts after equals. `static inline void gobj_first_higher_prio(HSD_GObj* gobj)` searches from the head and inserts before equals.

## Verified Live Promotion

24 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjplink/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjplink/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/c45ad10f4c0c40634dd65fc02391ccde5a7b1bff94d88267e908d998b868e1a0/2026-09-08T14-53-44.765Z-ce29a10f-2f27-4000-a735-68ab64fc4f96.receipt.json>).
