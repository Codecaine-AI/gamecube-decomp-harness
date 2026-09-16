# Naming Table

| Canonical target | Existing inferred alias | Decision |
|---|---|---|
| .data | none | retain canonical; Two fixed unlit HSD channel descriptors; section also contains assertion strings. |
| .rodata | none | retain canonical; Two constant Vec3 values, eye0,0,1 and interest0,0,0, total24 bytes. |
| .sdata | none | retain canonical; Existing objects identify lobj.h and lobj assertion strings emitted by inline HSD_LObjSetNext. |
| .sdata2 | none | retain canonical; Pooled color coefficients, reciprocal blur spacing, conversion double and camera literals. |
| fn_80013614 | lbCameraBlur_Disp | retain hypothesis; Call event before mode test, then draw21 samples for mode1 or one for all other modes; tint mode1 restricts scissor. |
| fn_800138AC | none | retain canonical; Free supplied user-state allocation. |
| lb_80011AC4 | none | retain canonical; Load descriptor chains, attach first animation chain, link previous head directly to current head; empty array leaves first undefined. |
| lb_80011B74 | none | retain canonical; Recursively OR flags into DObj material modes, tail first; required nonnull head/materials. |
| lb_80011C18 | none | retain canonical; Postorder child/sibling material traversal; particle/spline payloads skipped but children still traversed. |
| lb_80011E24 | none | retain canonical; Resolve variadic indices ending-1 with depth-first walk and retained position; instance children skipped. |
| lb_8001204C | none | retain canonical; Resolve u16 array indices with positive count; nonpositive count makes no writes. |
| lb_800121FC | none | retain canonical; Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes. |
| lb_800122C8 | none | retain canonical; Forward EFB copy origin/clear with sync=true. |
| lb_800122F0 | lbSpDisplay_SetupImageTexture | supersede with lbSpDisplay_SetupTintedImageTexture; optional filter factor distinguishes from unfiltered helper |
| lb_8001271C | lbSpDisplay_DrawTexQuad | retain hypothesis; Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio. |
| lb_8001285C | lbSpDisplay_SetupImageTexture | retain hypothesis; Single-stage unfiltered texture/GX state setup without alpha-input setup or drawing. |
| lb_80012994 | lbSpDisplay_DrawBlurredImage | retain hypothesis; Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d. |
| lb_800138CC | lbCameraBlur_SetEvent | retain hypothesis; Replace optional pre-render callback, includingNULL. |
| lb_800138D8 | lbCameraBlur_SetBlurSize | retain hypothesis; Set mode1 and assign signed size into unsigned byte; tint not initialized. |
| lb_800138EC | lbCameraBlur_Create | retain hypothesis; Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations. |
| lb_80013B14 | none | retain canonical; Load camera, exact1.18 perspective aspect correction, upper caps on scissor right/bottom only. |

Independent review repair: facts c3320bcf-a981-4bf6-96d8-5603859a4bc2 and 7c680942-a7ad-4b3c-93c2-5fb6793b6085 are superseded. Scissor normalization only upper-caps right/bottom; priority and render callback go to GX registration, not CameraBlurData. Final packet has 22 writes, 85 retain, 19 supersede, 3 unresolved. SHA `572ee6f055cbed01499413b2c94561f4c3194757c9982a97aa8572a6359da554`.
