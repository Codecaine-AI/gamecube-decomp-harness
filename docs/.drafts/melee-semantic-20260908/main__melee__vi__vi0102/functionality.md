## Video scene 0102

The unit loads `Vi0102.dat` and its `visual0102Scene` descriptor, constructs an animated camera and null-terminated collection of model hierarchies, and installs fog and lighting objects. The retained baseline identifies this as Adventure Mode's Mario/Luigi transition; canonical source independently confirms the archive and participant association, not the encounter condition or depicted narrative.

`vi0102_8031CB00` initializes the Castle-stage environment and configures Mario in demo slot 0 and Luigi in demo slot 1. Both receive player ID 0, facing +1, the shared origin, and creation argument 9; costume indices come from the entry descriptor. The rendered hypothesis `vi0102_SetupMarioAndLuigi` remains useful and supported.

Camera and model animations are requested and evaluated at frame zero before their respective process registrations. Model updates use `HSD_JObjAnimAll`, whose traversal skips instance children and invokes accumulated animation-end callbacks after evaluation. Camera updates animate first, then independently test exact equality with frame 190 and the eye animation's end frame. Both branches can execute on the same invocation; neither is a crossing test or locally latched one-shot. The event helper suppresses forwarding when `gm_8017E440()` returns numeric value 4.

Rendering first calls `lbShadow_8000F38C(0)`, then delegates to `vi_RunCamera` with the fog-derived erase color and priority value `0x881`. Camera activation failure skips clearing, drawing, priority assignment and finalization. Success clears color and depth, not alpha, and runs the shared camera-layer sequence. Scene-level updates separately delegate to the shared Start-trigger handler, which performs two audio calls before cleanup and scene progression.

Archive and descriptor pointers persist in file-local storage; no release path is present here. Entry assumes valid resources and descriptor fields, and the camera process dereferences the eye animation controller without local null checks. The exported eight-byte array is not accessed in this unit. Source declarations and literals do not establish compiled section sizes, padding or placement.

Status: synthesized; independent review and live promotion pending.
