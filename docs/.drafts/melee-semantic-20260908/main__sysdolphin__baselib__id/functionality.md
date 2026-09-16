# Numeric ID Registry

The ID unit maps u32 IDs to opaque data pointers in 101 singly linked buckets. A NULL table argument selects default_table; an explicit table uses the same shared IDEntry allocator. Seven canonical exports, three private inline helpers and one owned-header inline wrapper are covered.

## Allocation and Table Operations

HSD_IDGetAllocData returns the address of the global hsd_iddata descriptor without writing it. HSD_IDInitAllocData passes that address, sizeof(IDEntry), and alignment four to HSD_ObjAllocInit. The allocator clears and registers the descriptor with a mask of three and an aligned node stride. IDEntryAlloc allocates from this pool, asserts the result and clears the node; IDEntryFree returns the node to the pool. A failed allocation is not a normal insertion return code. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.c#L7-L40, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.c#L70-L73, and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L128-L156.

The private hash helper computes id modulo 101. Insert walks the selected chain, replaces id/data in the first matching node, or allocates and prepends a new node on a miss. It neither frees a replaced payload nor relocates an existing node. This preserves unique IDs when the input table is well formed; it does not remove externally introduced duplicate nodes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.c#L26-L68.

Remove walks with current and previous pointers. A first match is unlinked from the bucket head or predecessor, returned to the shared node allocator, and ends the call. No match changes nothing. Payload objects are never freed by this routine. Lookup returns the first matching node's data, sets optional success to one on a hit and zero on a miss, and leaves the table unchanged. A stored NULL payload still yields success one. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.c#L70-L122.

## Setup, Forgetting and Ownership

HSD_IDSetup and _HSD_IDForgetMemory both clear only default_table. ForgetMemory ignores low and high. They do not traverse chains, return nodes to the pool, clear caller-supplied tables or reset hsd_iddata. Existing nodes become unreachable through the reset default table. Allocator initialization is a separate operation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.c#L16-L24 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.c#L124-L127.

Owned IDEntry contains next, u32 id and void* data. HSD_IDTable contains 101 IDEntry pointers. HSD_IDGetData is a header inline wrapper that supplies NULL to HSD_IDGetDataFromTable. The seven exports are declared in lines 18-24. The imported HSD_ObjAllocData definition belongs to objalloc and receives no new type claim here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/id.h#L8-L29.

## Verified Dependencies

initialize.c calls HSD_IDSetup during component initialization and HSD_IDInitAllocData during HSD_ObjInit. HSD_ObjDumpStat obtains the shared descriptor through its accessor table and reads using/free/peak counts. jobj.c registers a joint descriptor address as the key for its runtime joint, then resolves an instance-child reference through the default ID table. These bounded caller checks support the inherited loader/statistics role without claiming all loader families. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L63-L76, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/initialize.c#L263-L308 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L650-L695.

## Compiled Sections and Review State

Existing source and split objects verify .bss is 0x1C0 bytes: hsd_iddata at offset zero for 0x2C bytes and default_table at offset 0x2C for 0x194 bytes. Both are zero-initialized NOBITS symbols. The .sdata allocation contains id.c at offset zero, entry at offset eight, and padding, totaling 16 linked bytes versus 14 source-object bytes. They support the allocation assertion. Exact hashes and layouts are in compiled-evidence.json. The report hash equals the frozen manifest; no build or matching ran.

All 128 source and 32 header lines were read canonically and rendered to EOF. Both have zero parser errors and no substitutions; two header names carry shadowed_binding labels with complete text. Canonical names are retained. Table validity, lifetime coordination across resets, and external mutation remain caller contracts. No new GObj, joint, generic allocator or initialization-family type is proposed.

## TU Lead Verification

Complete canonical and rendered source/header reviewed and all 37 proposed slots scanned. Checked modulo-101 buckets, default-table fallback, update-in-place versus prepend, first-match unlink, NULL payload success, reset without freeing and ignored range bounds. Foreign allocator/startup/joint claims and compiled sections remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

## Current Application Status

Root completed reviewed staged application for 37 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__id/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__id/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/2b082e02213a1db0b2c4c268368ec4afe922b7bb90bba98fd7ddcf7fa12be8b6/2026-09-08T14-53-20.705Z-463b75ea-0598-4c33-a58e-a3dfd0827dbe.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__id/final-render.json).
