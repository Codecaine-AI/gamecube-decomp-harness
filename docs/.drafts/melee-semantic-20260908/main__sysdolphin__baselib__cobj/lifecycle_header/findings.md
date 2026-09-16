# Lifecycle and Header Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Read all assigned canonical and rendered lines: cobj.c 1243-1407 and cobj.h 1-227. Source hashes and render exceptions are in coverage.json.

## Target Findings

### HSD_CObjGetCurrent

Provides read access to the HSD camera object currently selected by the camera subsystem.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1243-L1246

### HSD_CObjAlloc

Creates a new HSD camera object through the HSD class system, using the configured default CObj subclass when one is installed and otherwise using the standard CObj class, then asserts that construction succeeded.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1258-L1264

### CObjLoad

Loads a camera descriptor into an existing HSD_CObj, initializing its render rectangle, eye and interest objects, clipping planes, orientation representation, and projection parameters so the object is ready for later camera setup.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1274-L1312

### HSD_CObjInit

Initializes an existing HSD_CObj from an HSD_CObjDesc. It is the public, null-safe entry point around the internal descriptor-loading routine and performs no allocation itself.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1314-L1320

### HSD_CObjLoadDesc

Constructs an HSD_CObj from a non-null descriptor, using hsdNew on a class found by class_name or HSD_CObjAlloc when the name is absent or lookup fails, then invokes the resulting object's load method. A null descriptor returns NULL.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1322-L1340

### CObjInit

Initializes a newly allocated HSD_CObj through the HSD class hierarchy, invalidates its cached viewing matrices, and creates the two HSD_WObj instances that hold the camera's eye position and point of interest.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1342-L1356

### CObjRelease

Implements the HSD_CObj class's release-stage cleanup: it removes the camera's animation object, relinquishes its references to the eye-position and interest WObjs, frees an allocated projection matrix, and then delegates the remaining base-object cleanup to the parent class.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1358-L1383

### CObjAmnesia

Handles HSD class-amnesia notifications for the camera-object class by invalidating CObj module caches associated with the forgotten class and then propagating the notification to the parent HSD object class.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1385-L1394

### CObjInfoInit

Initializes the HSD_CObj class descriptor as a subclass of HSD_Obj and installs the camera object's construction, loading, release, and amnesia handlers.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1396-L1406

### vec_normalize_check

Foreign util.h helper rejects null pointers and componentwise magnitudes <= FLT_MIN, returning -1 without normalization. Otherwise calls PSVECNormalize and returns 0. Game-specific mapping remains unresolved; no header ownership claim.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.h#L23-L35

## Header and Unindexed Definitions

The header defines projection tags 1/2/3; unsigned scissor and signed/float viewport rectangles; HSD_CObj with parent, flags, pose, union-backed orientation/projection, matrices and animation pointer; descriptor common/frustum/perspective layouts; a 0x40-byte descriptor union; camera load callback metadata; and the animation descriptor triple. HSD_CObjGetViewingMtxPtrDirect returns view_mtx without null checks. Other declarations are contextual only. No header type has an exact writable subject.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.h#L12-L148
code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.h#L150-L224

HSD_CObjSetDefaultClass checks non-null class ancestry then stores info. Its source comment explicitly says the assertion line is fabricated to satisfy the unavailable function; this is canonical source behavior, not separate proof of original-binary behavior. CObjResetFlags preserves the top two existing bits and ORs supplied flags, but CObjLoad has already assigned descriptor flags before calling it, so loading does not preserve pre-load dirty bits at that step. Both definitions lack manifest targets and receive no proposal.

code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1248-L1278

## Dispositions and Boundaries

All 38 existing facts have row IDs and frozen updated_at versions in dispositions.json. 34 retained, three superseded, one unresolved. Eight parameter entities have no current facts and receive source-backed purpose proposals. No inferred names are proposed.

CObjRelease frees the field named proj_mtx; this review does not reinterpret that field as an actual projection matrix, since use elsewhere may establish a different cache role. CObjLoadDesc ignores the load callback return. It trusts a found class to be camera-compatible. HSD_CObjInit directly calls CObjLoad rather than virtual dispatch. These limits matter for callers supplying subclasses.

Foreign util.h and wobj.c reads support context only. Full shared-header render and generic type ownership remain coordinator family work. The cobj render completed with two parse errors and no substitutions; those annotations do not weaken the direct canonical branch review.
