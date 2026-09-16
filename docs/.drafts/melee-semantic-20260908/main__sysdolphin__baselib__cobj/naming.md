# Naming Decisions

Canonical function names remain preferred. No function rename is proposed. Parameter aliases below describe literal pointer stores. Section aliases remain unresolved until emitted layout is verified.

| Subject | Canonical Name | Existing Alias | Proposed Name | Decision |
|---|---|---|---|---|
| main/sysdolphin/baselib/cobj:.data | .data | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:.sbss | .sbss | CObj state | none | unresolved section alias |
| main/sysdolphin/baselib/cobj:.sdata | .sdata | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:.sdata2 | .sdata2 | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:CObjAmnesia | CObjAmnesia | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:CObjInfoInit | CObjInfoInit | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:CObjInit | CObjInit | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:CObjLoad | CObjLoad | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:CObjRelease | CObjRelease | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:CObjUpdateFunc | CObjUpdateFunc | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjAddAnim | HSD_CObjAddAnim | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjAlloc | HSD_CObjAlloc | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjAnim | HSD_CObjAnim | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjClearFlags | HSD_CObjClearFlags | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjEndCurrent | HSD_CObjEndCurrent | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjEraseScreen | HSD_CObjEraseScreen | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetAspect | HSD_CObjGetAspect | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetBottom | HSD_CObjGetBottom | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetCurrent | HSD_CObjGetCurrent | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetEyeDistance | HSD_CObjGetEyeDistance | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetEyePosition | HSD_CObjGetEyePosition | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetEyePositionWObj | HSD_CObjGetEyePositionWObj | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetEyeVector | HSD_CObjGetEyeVector | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetFar | HSD_CObjGetFar | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetFlags | HSD_CObjGetFlags | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetFov | HSD_CObjGetFov | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetInterest | HSD_CObjGetInterest | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetInterestWObj | HSD_CObjGetInterestWObj | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetInvViewingMtxPtr | HSD_CObjGetInvViewingMtxPtr | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetInvViewingMtxPtrDirect | HSD_CObjGetInvViewingMtxPtrDirect | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetLeft | HSD_CObjGetLeft | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetLeftVector | HSD_CObjGetLeftVector | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetNear | HSD_CObjGetNear | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetOrtho | HSD_CObjGetOrtho | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetPerspective | HSD_CObjGetPerspective | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetProjectionType | HSD_CObjGetProjectionType | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetRight | HSD_CObjGetRight | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetScissor | HSD_CObjGetScissor | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetTop | HSD_CObjGetTop | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetUpVector | HSD_CObjGetUpVector | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetViewingMtx | HSD_CObjGetViewingMtx | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetViewingMtxPtr | HSD_CObjGetViewingMtxPtr | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetViewportf | HSD_CObjGetViewportf | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjInit | HSD_CObjInit | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjLoadDesc | HSD_CObjLoadDesc | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjMtxIsDirty | HSD_CObjMtxIsDirty | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjRemoveAnim | HSD_CObjRemoveAnim | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjReqAnim | HSD_CObjReqAnim | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetAspect | HSD_CObjSetAspect | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetBottom | HSD_CObjSetBottom | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetCurrent | HSD_CObjSetCurrent | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetEyePosition | HSD_CObjSetEyePosition | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetFar | HSD_CObjSetFar | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetFlags | HSD_CObjSetFlags | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetFov | HSD_CObjSetFov | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetFrustum | HSD_CObjSetFrustum | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetInterest | HSD_CObjSetInterest | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetLeft | HSD_CObjSetLeft | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetMtxDirty | HSD_CObjSetMtxDirty | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetNear | HSD_CObjSetNear | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetOrtho | HSD_CObjSetOrtho | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetPerspective | HSD_CObjSetPerspective | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetProjectionType | HSD_CObjSetProjectionType | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetRight | HSD_CObjSetRight | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetRoll | HSD_CObjSetRoll | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetScissor | HSD_CObjSetScissor | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetScissorx4 | HSD_CObjSetScissorx4 | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetTop | HSD_CObjSetTop | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetUpVector | HSD_CObjSetUpVector | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetViewport | HSD_CObjSetViewport | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetViewportf | HSD_CObjSetViewportf | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetViewportfx4 | HSD_CObjSetViewportfx4 | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjSetupViewingMtx | HSD_CObjSetupViewingMtx | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:makeProjectionMtx | makeProjectionMtx | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:roll2upvec | roll2upvec | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:setupBottomHalfCamera | setupBottomHalfCamera | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:setupNormalCamera | setupNormalCamera | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:setupTopHalfCamera | setupTopHalfCamera | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:vec_normalize_check | vec_normalize_check | none | none | retain canonical |
| main/sysdolphin/baselib/cobj:HSD_CObjGetPerspective#r4 | top | none | fov_out | proposed; independent review pending |
| main/sysdolphin/baselib/cobj:HSD_CObjGetPerspective#r5 | bottom | none | aspect_out | proposed; independent review pending |

All 132 parameter entities were reviewed in their cluster coverage inventories. The 130 parameters outside the two proposed aliases keep their canonical spellings or current unlabeled state; no alias is inferred merely from a register locator. The sole inherited naming fact is section alias `CObj state`, left unresolved pending section attribution.
