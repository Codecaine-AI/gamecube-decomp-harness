# GObj User Data Lifecycle

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered C1-26 and H1-15 read to EOF. Research started 2026-09-08T14:44:45.773Z; completed 2026-09-08T14:47:00.675899+00:00.

## Registration

GObj_InitUserData requires the old user_data_kind to equal HSD_GOBJ_USER_DATA_NONE, defined as the u8 all-ones value. It writes kind, payload and callback in that order. It neither invokes the callback nor allocates or copies the payload. The callback parameter has type void (*)(void*), and the payload is void*.

The initializer accepts a new NONE kind, NULL payload and NULL callback. Passing NONE keeps removal disabled even with non-NULL payload. Passing another kind with NULL callback defers failure to the removal assertion. Thus this routine does not by itself establish that all stored metadata can be safely destroyed.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjuserdata.c#L6-L13 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjuserdata.h#L8-L12.

## Removal

GObj_RemoveUserData returns immediately for kind NONE. Otherwise it requires a callback and calls it with user_data before clearing either kind or payload. If the callback returns normally, kind becomes NONE and payload becomes NULL. The callback pointer is not cleared. Repeated ordinary removal therefore skips the stale callback because the kind controls eligibility.

No in-progress marker is set. A callback that re-enters removal can encounter the same active metadata; a callback that never returns prevents the final clearing writes. Actual release semantics belong to the supplied callback, not this helper. No callback-specific side effect is inferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjuserdata.c#L15-L25.

## GObj Family Context

CreateGObj initializes kind to 0xFF and both payload and removal callback to NULL. The independently read GObj destruction path calls GObj_RemoveUserData before object and process teardown, unless its earlier deferred-destruction branch returns. This confirms the local lifecycle connection without claiming ownership of the shared GObj type or the full destruction implementation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L57-L80 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L103-L115.

## Diagnostics and Coverage

Observed existing .data contains gobjuserdata.c and both assertion-expression strings with alignment padding. It is diagnostic text, not payload storage. Existing source/target object dumps and hashes accompany the packet; no build was run and exact artifact provenance was not reconstructed.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjuserdata.c#L9-L9 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjuserdata.c#L21-L21, plus src-object-evidence.txt and obj-object-evidence.txt.

All eight owned subjects are accounted for. The four parameter entities have no baseline facts. The callback formal has no owned manifest entity; its role is covered here and in the existing function signature facts without creating a new identity. All 14 existing facts have exact IDs and timestamp/hash versions in coverage.json. Canonical function names are retained.

## TU Lead Verification

Complete canonical and rendered C/header reviewed. Checked accepted NONE/null registration, sentinel skip leaving metadata untouched, callback-before-clear ordering, retained callback pointer and absent reentrancy marker. Payload freeing is callback-defined. Compiled strings and foreign lifecycle remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

## Current Application Status

Root completed reviewed live KB promotion for 8 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjuserdata/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjuserdata/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/96ca85cd4e71b6cbbc046a6ec7237d1fd3e00bde13003fa5b2bd777abb0fe730/2026-09-08T14-51-21.813Z-1b22e87c-11f4-4147-a064-bb1b573608a1.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__gobjuserdata/final-render.json).
