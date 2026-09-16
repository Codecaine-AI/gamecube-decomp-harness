# Unresolved Camera Claims

The entire owned source, header and dox have canonical and rendered coverage. An unresolved fact means the claim is wider than its verified evidence or depends on a family whose files are not owned here. It does not mean source coverage was skipped. Exact IDs, prior values, versions and reasons are in `fact-dispositions.json`.

1. Assign `cm/types.h` and `cm/forward.h` before promoting Camera, CmSubject, CameraModeCallbacks or quake-record layouts. The legacy dox's exclusive-writer and never-read assertions need callsite review. The initialized `cm_803BCCA0` definition is at camera.c end; exact emitted section mapping remains unresolved.
2. Identify the separate `.sdata` target with immutable linker/object evidence. Source declarations alone do not prove its object identity or the exhaustive contents of every emitted section.
3. Review fighter, item, stage, Hand and render consumers before retaining broader game mappings or exposing meanings for generic bit setters. In particular, a local getter/setter pair can prove storage behavior without proving an external renderer's interpretation.
4. Inspect the spherical transition locals in `Camera_8002E234`: component flags conditionally initialize locals that are later used together. Record observed source behavior without proposing a fix in this semantic pass. Similarly, `Camera_RequestQuake` assumes a recognized quake kind before writing its timer.
5. Investigate source-view collision diagnostics. `Camera_PauseZoom` and `Camera_PauseRotate` appear as source comments and are treated as collisions by the renderer's word scan. Distinct scaled-bounds functions also share an inherited alias; those aliases are cleared pending caller-specific naming. Neither case permits changing canonical symbols.
