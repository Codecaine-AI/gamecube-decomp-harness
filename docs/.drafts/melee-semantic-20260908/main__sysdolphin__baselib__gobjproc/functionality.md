Status: Reviewed and promoted to the live knowledge base.

# GObj Process Lifecycle

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Fully reviewed canonical and rendered C lines 1-186 and header lines 1-29. Leaf research began at 2026-09-08T14:43:31Z; final leaf completion was 2026-09-08T14:45:55.566222+00:00. TU synthesis timing is recorded in coverage.json.

## Functions

### HSD_GObjProc_8038FAA8
Registers an initialized HSD_GObjProc with both the global GObj process scheduler and its owning HSD_GObj, choosing a scheduler position from the process priority and the owner's process-link placement.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L12-L95

### HSD_GObjProc_8038FC18
Detaches an HSD_GObjProc from the global process-callback schedule without removing it from its owning GObj's process chain or freeing its storage. It repairs the selected schedule's neighboring links, head, and p_link/s_link boundary entry so callers can either reinsert the process after relocating its owner or continue with complete process destruction.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L97-L126

### HSD_GObjProc_8038FCE4
Detaches one HSD_GObjProc from all scheduling and ownership links without freeing it: it removes the record from the global process schedule and then unlinks it from its owning GObj's process chain.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L128-L141

### HSD_GObj_SetupProc
Creates and registers a process callback for an HSD_GObj by allocating an HSD_GObjProc, initializing its scheduling and invocation state, and inserting it into the GObj process infrastructure.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L143-L165

### HSD_GObjProc_8038FE24
Destroys one HSD_GObjProc: it removes the process from the global callback scheduler and its owning GObj's process chain, then returns the process record to the GObj-process allocator. If the process is its own currently executing callback, destruction is postponed until that callback returns.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L167-L175

### HSD_GObjProc_8038FED4
Requests removal of every process in an HSD_GObj owner chain, saving each child pointer before invoking the single-record remover. Ordinary records are detached and freed; the currently executing record can remain linked with removal pending. Generic GObj destruction calls this cleanup before freeing the owner.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L177-L185

## Names

| Canonical | Retained hypothesis |
|---|---|
| HSD_GObjProc_8038FAA8 | GObj_LinkProc |
| HSD_GObjProc_8038FC18 | GObjProc_Unlink |
| HSD_GObjProc_8038FCE4 | HSD_GObjProc_Unlink |
| HSD_GObjProc_8038FE24 | HSD_GObjProc_Remove |
| HSD_GObjProc_8038FED4 | HSD_GObjProcRemoveAll |

HSD_GObj_SetupProc already has a canonical descriptive name. assertProc is a source-defined static inline helper absent from report targets; it asserts its HSD_GObjProc pointer. Alias spellings are hypotheses and do not change canonical symbols.

## State and Invariants

Each record has two memberships. next/prev link the global s_link schedule; child links the owner chain. The indexed p_link/s_link table tracks group boundaries. FC18 removes global membership only and leaves the record links uncleared. FCE4 then removes owner membership, without freeing. FE24 either sets b2 for the current callback when b0 is clear or unlinks and frees immediately. FED4 saves child before removal and can leave the active record pending. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L97-L185.

The runner invokes on_invoke, sets b0 before servicing deferred flags, and resets those flags afterward. Whole-owner deletion b1 takes precedence; otherwise relocation b3 is serviced before process removal b2. These checks support the deferred-self-removal interpretation without claiming b0 means ordinary callback execution. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobj.c#L101-L138.

Setup initializes flags_1, flags_2, and flags_3 but not flags_4. The caller supplies an HSD_GObj owner, a void(HSD_GObj*) callback, and u8 priority. It stores the callback without calling it. The seven parameter entities have no facts; the manifest omits an entity for SetupProc func. Other pointer arguments are HSD_GObjProc* except FED4, which takes HSD_GObj*. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L143-L185; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.h#L8-L26.

Null, ownership, and membership validation are absent from unlink operations. FCE4 assumes its node can be found in the owner chain. Insertion assumes valid p_link/s_link dimensions and existing list consistency. These are preconditions, not checked failures.

## Sections and Dependencies

Both section aggregates remain unresolved. HSD_ASSERT stringifies gproc and the priority condition, and supplies __FILE__; source does not prove whether each string is in .data or .sdata, its alignment, or its filename spelling. The inherited claims overlap on gproc. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjproc.c#L143-L165; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/debug.h#L16-L32.

Canonical supporting reads of gobj.c and gobjplink.c verify deferred operations, relocation, and destruction order. No shared scheduler fields are claimed here. No allocator internals or runtime scheduling tests were performed.

## TU Synthesis Correction

FCE4 cursor advancement inherits the FC18 b0 guard. The final five-operation proposal corrects that remaining broad claim. Final dispositions are 29 retain, 5 supersede and 6 unresolved.

## Exact Source Signatures

All FAA8, FC18, FCE4 and FE24 definitions return void and take HSD_GObjProc* gproc. FED4 returns void and takes HSD_GObj* gobj. SetupProc returns HSD_GObjProc* and takes HSD_GObj* gobj, void (*func)(HSD_GObj*) and u8 pri. assertProc is static inline void with HSD_GObjProc* gproc.

## Verified Live Promotion

5 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjproc/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjproc/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/af4aa0260b051e871f83a5b2634b28b5384fd8000427393ed3cf41287f4e76f0/2026-09-08T14-53-44.675Z-24fd3572-791d-4aa7-8595-6fa988a18138.receipt.json>).
