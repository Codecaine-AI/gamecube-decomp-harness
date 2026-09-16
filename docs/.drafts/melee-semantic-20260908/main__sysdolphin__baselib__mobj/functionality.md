# HSD material-object subsystem

The unit implements material-object construction, animation, TEV-expression compilation, draw-time setup, shared shadow/toon texture integration, and resource release. Canonical and rendered versions of both owned files were reviewed completely. Existing function names fit their implementations; no function rename is proposed. Rendered names were not used as independent behavioral evidence.

## Construction and lifetime

`HSD_MObjLoadDesc` returns NULL for a missing descriptor. Otherwise it constructs the class resolved from `class_name`, or falls back to `HSD_MObjAlloc`, which selects `default_class` when non-null and the base MObj class otherwise. It invokes virtual loading and then TEV compilation; the loader's integer result is not inspected. The base loader copies material data, loads the texture chain, forces `RENDER_TOON`, optionally copies PE data, and clears the material animation attachment. It does not assign `mobj->pe` when the descriptor omits PE data. `renderdesc` and `renderanim` exist in the header but are not consumed by these base loading/attachment paths.

Public removal dispatches release before destruction. Base release removes owned animation and texture objects, frees material, TEV products and optional PE data, and delegates to the parent. It does not clear those owner fields and is not an idempotent reset. Class amnesia is separate: it selectively nulls the default-class and shared-texture pointers without freeing those objects or clearing `current_mobj`.

## Animation and numeric behavior

Attachment replaces the material AObj and distributes texture descriptors by texture-map ID; unmatched texture nodes remain unchanged. Attachment does not request playback. Material and texture animation selection use independent mask bits. The texture traversal receives the entire mask even when `MOBJ_ANIM` is absent. Requests position reached controllers at a common frame, clear `AOBJ_NO_ANIM`, and set `AOBJ_FIRST_PLAY`.

Evaluation runs the material controller before texture animation. A missing or stopped material controller does not suppress texture evaluation. The callback scales RGB and optional PE tracks by 255.0 before conversion to u8; material alpha instead receives `1.0F - val->fv`. Normalized values describe the intended input domain, not enforced bounds: these conversions are not clamped. Unknown attributes and PE tracks without a PE descriptor are ignored. Direct RGB/alpha setters likewise do not clamp or guard their object pointers; RGB updates leave diffuse alpha unchanged.

## TEV compilation and rendering

Compilation frees previous products before rebuilding. The effective texture chain can temporarily append active shadows and prepend the shared toon object when its image exists. Resource assignment precedes virtual graph construction. The graph selects vertex raster inputs or pointer-backed material constants, processes diffuse/ambient roles, optional diffuse lighting or toon modulation, optional specular contribution, and extension roles. `GX_TEXMAP_NULL` is a sentinel, not numeric zero. The role done-mask informs texture callbacks' repeat handling, including avoiding repeated alpha processing. A packing stage is added unless final color and alpha already share a TEV node. Compilation produces TEV descriptors and retains live constant nodes rather than the original complete graph.

Draw setup ignores its incoming render-mode value and uses `mobj->rendermode`. It initializes TEV bookkeeping, installs material colors and optional shininess, configures the effective texture chain and coordinates, applies compiled then volatile TEV state, and configures PE state from the mode and optional descriptor. This is material-state setup, not a guarantee that every GX state is reset. `MObjSetupTev`'s third argument is the render mode, despite the local name `arg2`.

Shadow-tail restoration preserves the material's original termination, but it does not clear `tobj_toon->next` or remove shared texture references retained in compiled descriptors. Shared textures therefore have lifetimes beyond a temporary list splice. The shadow registry is identity-unique and intrusive; deletion only detaches nodes, including a NULL clear-all operation. Shadow destruction unregisters an active texture before freeing its image and texture storage. Changing the registry or render flags does not itself recompile existing material programs.

`HSD_MObjUnset` calls `HSD_TObjSetup(NULL)`, which clears the software current-texture head and returns without GX texture unbinding. DObj display brackets rendering with current-material set/clear operations, including the numeric `0x04000000` branch that bypasses material setup and unset. This is a single context slot, not a saved/restored stack.

## Evidence limitations

The rendered C view reports one parse uncertainty at `HSD_MObjClearFlags`; the header reports shadowed bindings for several pointer-returning declarations. Neither view performs name substitutions. Canonical bodies and declarations remain readable.

Compiled section membership, layout, pool ordering and padding are not established by C declarations. Eight section facts and six section-origin links remain unresolved. In particular, `cannot allocate tobj for toon.` contains 29 characters and occupies 30 bytes including NUL, not the baseline's 31; together with the 9-byte `hsd_mobj` string this does not prove a 40-byte pool. No replacement section layout is invented.

Status: researched; no-change lead bypass; independent review and live promotion pending.
