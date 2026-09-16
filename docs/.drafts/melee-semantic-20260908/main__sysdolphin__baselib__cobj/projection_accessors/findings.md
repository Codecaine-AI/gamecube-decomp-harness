# Projection Accessors Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Assigned cobj.c lines 856–1242 fully read in canonical and rendered form. Source hash `b49cc2726fa8617c73c12090815611e7c554721f4f5d43bfca77df2cfa24cdce`. Header hash `77ddc09f2d37b51e15ed916e567af90fd0a5e740e0e6b339ebd379f815cf117d`.

33 function targets and 73 parameter entities reviewed. Existing facts are individually recorded with IDs and update timestamps in dispositions.json. No inherited inferred-name facts occur in this cluster.

## Findings

The scalar projection getters return zero for a null camera. FOV and aspect require type 1. Extent getters derive perspective bounds from near distance, degree-valued FOV and aspect; explicit frustum/ortho bounds pass through. The GetTop spelling perspective.fov is valid shared union storage, confirmed by cobj.h lines 50–69.

Projection edge setters ignore perspective and unknown modes. Near/far setters store unchecked floats. Full perspective/frustum/ortho setters also select the mode. None updates view-matrix dirty flags or calls GX. The separate projection selector setter narrows its u32 input to u8 and does not initialize the newly selected union arm.

Scissor and floating viewport aggregate accessors guard the camera, but require a valid rectangle pointer when the camera exists. The signed viewport setter copies each bound into float fields. Normal setup scales viewport and scissor bounds by framebuffer-to-VI ratios; offscreen setup uses stored bounds directly. The scissor input is therefore not universally in GX pixel coordinates.

GetPerspective has misleading canonical parameter names. Its top pointer receives FOV and bottom receives aspect. Propose fov_out and aspect_out only on the owned parameter entities. GetOrtho outputs each named bound independently. These output-pointer getters can alias camera storage; claims of read-only camera behavior describe their direct accesses, not an external no-alias guarantee.

GetFlags uniquely requires a valid camera pointer. SetFlags ORs selected bits, and ClearFlags ANDs the inverse mask. Matrix consumers clear bit 30 after rebuilding view_mtx, set bit 31 to invalidate its inverse, and clear bit 31 after inversion.

## Target and Parameter Coverage

| Function | Canonical Range | Parameters |
|---|---|---|
| HSD_CObjGetFov | [856–862](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L856-L862) | `HSD_CObj* cobj` |
| HSD_CObjSetFov | [864–870](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L864-L870) | `HSD_CObj* cobj, float fov` |
| HSD_CObjGetAspect | [872–878](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L872-L878) | `HSD_CObj* cobj` |
| HSD_CObjSetAspect | [880–886](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L880-L886) | `HSD_CObj* cobj, float aspect` |
| HSD_CObjGetTop | [888–911](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L888-L911) | `HSD_CObj* cobj` |
| HSD_CObjSetTop | [913–928](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L913-L928) | `HSD_CObj* cobj, float top` |
| HSD_CObjGetBottom | [930–946](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L930-L946) | `HSD_CObj* cobj` |
| HSD_CObjSetBottom | [948–963](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L948-L963) | `HSD_CObj* cobj, float bottom` |
| HSD_CObjGetLeft | [965–982](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L965-L982) | `HSD_CObj* cobj` |
| HSD_CObjSetLeft | [984–999](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L984-L999) | `HSD_CObj* cobj, float left` |
| HSD_CObjGetRight | [1001–1018](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1001-L1018) | `HSD_CObj* cobj` |
| HSD_CObjSetRight | [1020–1035](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1020-L1035) | `HSD_CObj* cobj, float right` |
| HSD_CObjGetNear | [1037–1043](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1037-L1043) | `HSD_CObj* cobj` |
| HSD_CObjSetNear | [1045–1050](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1045-L1050) | `HSD_CObj* cobj, float near` |
| HSD_CObjGetFar | [1052–1058](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1052-L1058) | `HSD_CObj* cobj` |
| HSD_CObjSetFar | [1060–1065](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1060-L1065) | `HSD_CObj* cobj, float far` |
| HSD_CObjGetScissor | [1067–1073](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1067-L1073) | `HSD_CObj* cobj, Scissor* scissor` |
| HSD_CObjSetScissor | [1075–1081](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1075-L1081) | `HSD_CObj* cobj, Scissor* scissor` |
| HSD_CObjSetScissorx4 | [1083–1093](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1083-L1093) | `HSD_CObj* cobj, u16 left, u16 right, u16 top,                           u16 bottom` |
| HSD_CObjGetViewportf | [1095–1101](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1095-L1101) | `HSD_CObj* cobj, HSD_RectF32* viewport` |
| HSD_CObjSetViewport | [1106–1115](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1106-L1115) | `HSD_CObj* cobj, HSD_RectS16* viewport` |
| HSD_CObjSetViewportf | [1117–1123](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1117-L1123) | `HSD_CObj* cobj, HSD_RectF32* viewport` |
| HSD_CObjSetViewportfx4 | [1125–1135](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1125-L1135) | `HSD_CObj* cobj, float left, float right, float top,                             float bottom` |
| HSD_CObjGetProjectionType | [1137–1143](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1137-L1143) | `HSD_CObj* cobj` |
| HSD_CObjSetProjectionType | [1145–1151](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1145-L1151) | `HSD_CObj* cobj, u32 proj_type` |
| HSD_CObjSetPerspective | [1153–1161](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1153-L1161) | `HSD_CObj* cobj, float fov, float aspect` |
| HSD_CObjSetFrustum | [1163–1174](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1163-L1174) | `HSD_CObj* cobj, float top, float bottom, float left,                         float right` |
| HSD_CObjSetOrtho | [1176–1187](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1176-L1187) | `HSD_CObj* cobj, float top, float bottom, float left,                       float right` |
| HSD_CObjGetPerspective | [1189–1200](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1189-L1200) | `HSD_CObj* cobj, float* top, float* bottom` |
| HSD_CObjGetOrtho | [1202–1220](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1202-L1220) | `HSD_CObj* cobj, float* top, float* bottom, float* left,                       float* right` |
| HSD_CObjGetFlags | [1222–1225](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1222-L1225) | `HSD_CObj* cobj` |
| HSD_CObjSetFlags | [1227–1233](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1227-L1233) | `HSD_CObj* cobj, u32 flags` |
| HSD_CObjClearFlags | [1235–1241](code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L1235-L1241) | `HSD_CObj* cobj, u32 flags` |

The table accounts for every defined function in the assigned range. coverage.json records each owned parameter entity separately. Supplemental reads validate existing cross-range claims only; they do not claim ownership of the other functions.

## Dispositions and Limits

139 retained facts; 4 superseded facts. Eight proposed writes comprise two parameter names, two parameter data-flow facts, three projection-selector corrections and one scissor-coordinate correction. Render parse errors did not prevent full canonical reading. No source, shared KB, Git, matching or UI changes.
