# Performance-Display Camera Setup

This TU creates a camera-bearing GObj for the developer performance display and supplies its GX callback. It owns three initialized descriptors, two exports and no mutable timing counters. Canonical and rendered C/header were reviewed fully.

## Construction and Callback

hsd_80398310 forwards class_id, p_link and obj_kind to GObj_Create. The callee names the third argument priority, so obj_kind is a misleading local label, not a camera-kind selector. A NULL GObj returns NULL immediately. Otherwise the function loads its local camera descriptor, attaches the camera using HSD_GObj_CameraKind, and installs fn_803982E4 through GObj_SetupGXLinkMax. That helper selects gx_link_max + 1 and stores the fourth argument as render_priority. No local camera-allocation guard or rollback appears. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L40-L54, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjplink.c#L98-L101 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/gobjgxlink.c#L55-L70.

The constructor registers fn_80392A3C through hsd_80392528 and passes 4,1,0 to fn_80392A08. The first value sets the display frame range, the second enables numeric timing text, and the third disables the extra lifetime-peak display. The second parameter's canonical label scale does not establish a geometric scale operation. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L51-L53, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L61-L64, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L88-L98 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L115-L203.

fn_803982E4 passes gobj->hsd_obj to HSD_CObjSetCurrent, then calls fn_80392934 and hsd_8039254C in that order. It ignores its integer argument and does not branch on the camera-setter result. The timing helper copies CPU/draw/total measurements from HSD_PerfLastStat and updates current, periodically reset peak and lifetime peak storage. The diagnostic dispatcher invokes registered producers and consumes their returned lists. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L11-L16, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392A.c#L45-L79 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3924.c#L155-L175.

## Camera Data

Two HSD_WObjDesc initializers describe eye at 0,0,1 and interest at 0,0,0. The camera descriptor supplies 640 by 480 viewport and scissor extents, roll zero, near zero, far 32768, and top/bottom/left/right values -445,35,-20,620. The declared type is HSD_CameraDescFrustum, but projection selector 3 is PROJ_ORTHO and the loader dispatches it through the ortho union arm. That arm uses the same declared struct. This is not a new camera-type inference. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3982.c#L18-L38, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.h#L90-L129 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1294-L1307.

Existing source and split objects verify .data comprises 20-byte world-object records at offsets zero and 20 followed by the 64-byte camera descriptor at offset 40. Two relocations connect the camera eye/interest fields to those records. Total size is 104 bytes. Exact bytes, symbols, relocations and hashes are in compiled-evidence.json. The existing report hash equals the manifest; no build or matching ran.

## Ownership and Naming

Retain HSD_PerfCreateGObj as the inherited hypothesis for hsd_80398310, backed by verified timing producer/setup calls. It remains an inferred alias; canonical source is unchanged. A source search found no existing canonical HSD_PerfCreateGObj declaration. Independent name review remains required.

The owned header contains the guard, platform/forward includes and two declarations only. It introduces no GObj, camera, world-object or performance-item types. Those remain foreign family ownership. Both owned files render completely with zero parser errors. Source has four substitutions; header keeps the constructor canonical due to shadowed_binding.

## TU Lead Verification

Complete canonical and rendered C 1–56/header 1–12 reviewed; all 13 proposed slots scanned. Priority forwarding, ortho discriminator and missing camera-result guard checked. Cross-file timing and producer meaning remains subject to independent gate verification. [Lead receipt](lead-verification.json).

Reviewed live application: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/cefbd661f3ef530db434dc6d5ac89460a9f893701adc6c6efffc5c6c5a95c899/2026-09-08T15-12-22.037Z-555abd99-1d82-43f0-b2f0-debe95b89343.receipt.json); [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3982/final-render.json).

Outgoing relationships were reviewed individually against current canonical evidence. [Exact-record link dispositions](link-dispositions.json) preserve every original record and disposition. Independent link review remains pending.
