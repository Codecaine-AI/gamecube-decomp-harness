## vi0801 semantic review

This unit implements the archive-backed Vi0801 presentation identified by the frozen baseline as the Adventure Mode F-Zero Grand Prix opener. Entry loads `Vi0801.dat` / `visual0801Scene`, initializes its animated camera and models, configures BigBlueRoute, installs fog and lighting, and initializes players. Audio calls bracket construction with numeric states 1 and 0; the rendered `SetPause` hypothesis is not independent proof of their meaning.

Model setup walks descriptors until NULL, evaluates each hierarchy at frame zero, and registers the hierarchy-animation process at priority 23. The 23 mapping rows populate slots 0–22 of a 24-pointer array. Entry supplies that array to `grBigBlueRoute_8020DAB4` with scale 0.5 and count 23. The canonical route helper stops at the first NULL attachment, selects children from its source hierarchy, unhides and scales them, reparents them under supplied joints, then calls `Ground_801C4A08` on the source GObj. Thus the selected joints participate in a cross-file hierarchy lifetime, not merely a copied list of transforms.

The camera render callback does nothing further if camera activation fails. Otherwise it installs the retained fog-derived RGBA erase color and clears color and depth, not alpha. Four dispatcher calls use `gxlink_prios` masks 9, 8, 8 and 0x8A1, with camera-group arguments 2, 1 and 0 before the first three calls. Dispatcher argument 7 selects render passes 0–2; it is not GX link 7. The final mask selects link lists 0, 5, 7 and 11. Camera finalization follows the dispatches.

The camera process evaluates animation before exact frame comparisons: 75 and 160 call `vi_8031C9B4(0xC, 0)`, and 120 calls it with 0x10. That shared helper suppresses forwarding when its selected index is 4. A separate exact end-frame test calls `lb_800145F4` then `gm_801A4B60`; a milestone and completion can occur on the same tick. The callback assumes non-NULL camera and camera AObj despite the evaluator's own NULL-camera handling. The separate scene-frame wrapper delegates to the shared newly-triggered-Start interruption handler.

The owned rendered names `vi0801_GObj_OnRender`, `vi0801_SetupSceneModels` and `vi0801_RunFrame` fit their canonical roles and are retained. Header declarations agree with definitions. The rendered external name `HSD_GObj_SetTextureCamera` is misleading for the canonical bitmask dispatcher. Source declarations and literals do not establish compiled section ordering, padding or constant pooling.

Status: synthesized; independent review and live promotion pending.
