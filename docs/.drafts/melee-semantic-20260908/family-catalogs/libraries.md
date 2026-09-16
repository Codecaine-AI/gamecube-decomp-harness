# Libraries Family Catalog

Pinned source revision `c302741689bd67c361cd7faadb221df3193992c3`. Draft family synthesis; no DB, source or scheduler changes.

564 tasks indexed. 10 functionality documents closely read. Selected canonical ranges independently checked. Every current proposal, review, functionality and unresolved artifact has its own hash in [libraries.json](libraries.json).

## Acceptance and Coverage

Scheduler status and review status are separate. A review counts only for its recorded proposal hash. Existing functionality prose can predate review. Shared game headers are included in this family inventory; their presence does not transfer implementation ownership.

| Snapshot | Counts |
|---|---|
| Task state | {"accepted": 485, "research_queued": 23, "not_in_kernel_pool_snapshot": 49, "native_review_preserved": 5, "librarian_running": 2} |
| Review state | {"accepted_for_staged_apply": 539, "missing": 25} |
| Proposal hash matches | {"True": 539, "None": 25} |

This is a family synthesis and artifact index, not a canonical rereview of all 564 tasks. Pending and missing artifacts remain pending or missing. Followup keyword groups overlap and are discovery aids.

## Functionality and Naming Patterns

### Library and Shared-Header Ownership

This inventory includes Runtime, MSL, MetroTRK, Dolphin SDK and HSD baselib, plus shared game headers. A header declaration or callback type does not establish all caller behavior. Keep canonical owner paths when describing a foreign helper.



### Primary and Internal References Use Different Release Tests

ref_DEC succeeds for NOREF unchanged or old count zero after postdecrement. iref_DEC succeeds at existing zero or new zero after decrement. Neither helper itself destroys an object. GObj cleanup adds conditional hsdDelete.

[sysdolphin/baselib/object.h#L74-L119](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L119) [sysdolphin/baselib/gobj.c#L236-L246](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L236-L246)

### Remove and Free Have Distinct Ownership

HSD_AObjRemove tears down the FObj chain and retained JObj before HSD_AObjFree returns storage. HSD_SListRemove frees one node and returns its successor; caller links and opaque payload remain caller responsibilities.

[sysdolphin/baselib/aobj.c#L220-L260](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L220-L260) [sysdolphin/baselib/list.c#L80-L91](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L80-L91)

### Append Spelling Does Not Establish Tail Traversal

HSD_SListAppendList inserts one node immediately after its nullable anchor and overwrites the inserted node successor. HSD_SListAllocAndAppend returns the supplied anchor or a new singleton.

[sysdolphin/baselib/list.c#L39-L78](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L39-L78)

### Process Flag Names Must Identify the Inhibition Slot

80390C84 clears flags_1 and 80390CAC clears flags_2. Dispatch still checks both flags, the link exclusion mask and generation. Staff Roll uses the first flag for its pause branch.

[sysdolphin/baselib/gobj.c#L46-L115](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L46-L115) [melee/gm/gmstaffroll.c#L1162-L1180](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmstaffroll.c#L1162-L1180)

### Pass Dispatch and Camera Activation Are Separate Operations

80390ED0 traverses pass bits and selected GX links. 803910D8 activates its CObj and dispatches mask 7 only on success. CObjSetCurrent stores current and clears the Z list before pass setup can fail; EndCurrent sorts and displays without clearing current.

[sysdolphin/baselib/gobj.c#L149-L234](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L149-L234) [sysdolphin/baselib/cobj.c#L485-L525](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L485-L525)

### proj_mtx Stores an Inverse-View Cache

The Direct inverse accessor allocates proj_mtx if needed and writes PSMTXInverse(view_mtx, *proj_mtx). Field spelling must not become a projection-matrix claim.

[sysdolphin/baselib/cobj.c#L785-L795](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L785-L795)

### MSL and HSD Random Sequences Are Distinct

MSL rand advances static next with 1103515245 and 12345 and masks 15 output bits. HSD random uses exported seed_ptr with 214013 and 2531011 and 16 output bits. HSD_Randi consumes one advance even for zero max; forget-memory redirects the pointer without resetting its value.

[MSL/rand.c#L1-L14](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/rand.c#L1-L14) [sysdolphin/baselib/random.c#L1-L29](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/random.c#L1-L29)

### Mutex and Shutdown Names Can Be Compatibility Hooks

All three MetroTRK mutex bodies return kNoError without synchronization. __kill_critical_regions returns without teardown. These local bodies do not prove runtime-wide absence of synchronization or teardown requirements.

[MetroTRK/mutex_TRK.c#L5-L18](code://c302741689bd67c361cd7faadb221df3193992c3/src/MetroTRK/mutex_TRK.c#L5-L18) [MSL/PPC_EABI/critical_regions.gamecube.c#L1-L6](code://c302741689bd67c361cd7faadb221df3193992c3/src/MSL/PPC_EABI/critical_regions.gamecube.c#L1-L6)

## Concrete Corrections Across Owners

These are exact slots in existing reviewed proposals. The family pass preserves them and identifies how caller documentation must follow the corrected contract. It does not claim a new live conflict where the current task already corrected an inherited statement.

### main/sysdolphin/baselib/gobj:HSD_GObj_80390C84

Fact `inferred_name`. Distinguishes the flag_1 clear from the separate flag_2 clear. Neither operation alone guarantees execution.

HSD_GObjClearProcFlag1

Use the corrected helper contract when documenting Staff Roll, fighter/item rendering, or other callers. Do not transfer a game-specific caller purpose into the generic helper.

Review `accepted_for_staged_apply`; current proposal hash match `True`.

[source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L46-L70) [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L94-L110) [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmstaffroll.c#L1162-L1180)

### main/sysdolphin/baselib/gobj:HSD_GObj_80390CAC

Fact `inferred_name`. The old near-identical resume alias hid the independent flag_2 inhibition mechanism.

HSD_GObjClearProcFlag2

Use the corrected helper contract when documenting Staff Roll, fighter/item rendering, or other callers. Do not transfer a game-specific caller purpose into the generic helper.

Review `accepted_for_staged_apply`; current proposal hash match `True`.

[source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L54-L75) [source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L94-L110)

### main/sysdolphin/baselib/gobj:HSD_GObj_80390ED0

Fact `inferred_name`. The body traverses pass and GX-link masks and invokes callbacks. It neither binds textures nor sets a camera directly; the old texture-camera alias overstates behavior.

HSD_GObjDispatchRenderPasses

Use the corrected helper contract when documenting Staff Roll, fighter/item rendering, or other callers. Do not transfer a game-specific caller purpose into the generic helper.

Review `accepted_for_staged_apply`; current proposal hash match `True`.

[source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L149-L183)

### main/sysdolphin/baselib/list:HSD_SListAllocAndAppend

Fact `purpose`. The inherited purpose called an arbitrary anchor the list head; preserve the literal returned pointer.

Allocates a node carrying the opaque data pointer and inserts it immediately after the supplied anchor. It returns the same anchor when non-NULL, or the new singleton when NULL. The anchor may be an interior node; this function does not locate the tail or a containing list head.

Update caller descriptions that assume tail insertion, chain concatenation or payload destruction. Preserve canonical source names.

Review `accepted_for_staged_apply`; current proposal hash match `True`.

[source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L39-L47)

### main/sysdolphin/baselib/list:HSD_SListAppendList

Fact `state_behavior`. This is a single-node splice, not chain concatenation or validated insertion.

Asserts next is non-NULL. With non-NULL list, overwrites next->next with list->next, then sets list->next=next and returns list. With NULL list, overwrites next->next with NULL and returns next. It does not preserve a preexisting chain after next or check membership/aliasing; list==next creates a self-link.

Update caller descriptions that assume tail insertion, chain concatenation or payload destruction. Preserve canonical source names.

Review `accepted_for_staged_apply`; current proposal hash match `True`.

[source](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/list.c#L59-L71)

## Remaining Family Checks

1. Preserve separate primary and internal reference predicates in JObj, WObj, GObj and other cleanup documentation. The verified object header gives different terminal tests; a universal decrement-to-zero explanation is false.
2. Keep MSL and HSD random state, constants and seeding separate in game caller descriptions. Shared words such as rand do not establish a shared sequence.
3. Describe failed CObj activation as potentially changing current and clearing the Z list. Game render callbacks that skip drawing on failure do not roll back these earlier mutations.
4. Use revision-matched compiled evidence for unresolved section facts. The library catalog does not promote source declarations into placement or byte-size proof.

## Render Evidence

Four final-render metadata artifacts were inspected. They are evidence of the recorded render, not of a later live database render. Source pages were not reread in this family pass.

| Task | Revision | Parse Errors | Substitutions | Database |
|---|---|---:|---:|---|
| main__sysdolphin__baselib__cobj | `c302741689bd67c361cd7faadb221df3193992c3` | 2 | 0 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/staged/knowledge.sqlite` |
| main__sysdolphin__baselib__gobj | `c302741689bd67c361cd7faadb221df3193992c3` | 0 | 26 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/staged/knowledge.sqlite` |
| main__sysdolphin__baselib__list | `c302741689bd67c361cd7faadb221df3193992c3` | 0 | 0 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/staged/knowledge.sqlite` |
| main__sysdolphin__baselib__random | `c302741689bd67c361cd7faadb221df3193992c3` | 0 | 0 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/staged/knowledge.sqlite` |

The CObj record includes parse uncertainty. A complete line count does not establish successful parsing of every declaration. Keep those parser limitations separate from the canonical behavior verified above.

## Followup Index

| Group | Tasks |
|---|---:|
| compiled_layout | 18 |
| caller_contract | 13 |
| lifetime | 15 |
| types_and_headers | 13 |
| render_mapping | 4 |

Exact per-task followups and unresolved fact IDs remain in the JSON coverage records. No unresolved claim is accepted by this catalog.
