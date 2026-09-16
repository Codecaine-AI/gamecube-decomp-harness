## Battlefield stage module

`grbattle.c` registers `/GrNBa.dat`, seven map-object callback records, and Battlefield's lifecycle and service hooks. The header exports only `grNBa_StageData`.

Initialization caches the yakumono-parameter pointer, sets two stage flags, and requests object 0. If `gm_8016B3D8()` succeeds or `Stage_80225194()` yields 273 or 245, it requests object 5; otherwise it requests background controller 3 and background variant 1. Object 6 is requested in either branch, followed by shared ground setup and position-cache refresh. The demo latch is cleared last. These numeric stage values and flag meanings are not assigned additional semantics here.

The object factory indexes the callback table without a local bounds check. On successful Ground-object creation it clears two callback slots, registers rendering, installs the optional fourth callback, invokes the initializer, and schedules the optional GObj process at priority 4. On failure it reports the requested ID and returns NULL; initialization does not locally recover from those failures.

Object 0 initializes animation and, while the demo latch is set, copies four previously cached grLib positions into registered stage joints 0–3. Those joint indices are not map-object IDs. Objects 1, 2 and 4 receive equivalent animation/material setup and flag value 2; they are interchangeable background variants, not evidence of three suspended platforms. Objects 5 and 6 use the shared joint/animation setup inline. Object 6's process calls `Ground_801C2FE0` and then `lb_800115F4`. All object predicates return false. Apart from controller 3 and object 6, the object processes are empty; all fourth callbacks are empty.

## Background cycle

Controller 3 starts hidden in `BG_Waiting`, with `curr = -1` and timer `HSD_Randi(1200) + 2400`. Waiting tests the timer's pre-decrement value against zero: an already-negative value starts animation and enters Transitioning. Transitioning unhides the controller and tests animation completion using joint selector 0 and animation-type mask 7—not track 7. On its first transition it discovers an existing background among IDs 1, 2 and 4, asserting if none exists. It repeatedly samples that set until it chooses a different ID, applies outgoing and incoming overlays, and enters Done. Both backgrounds coexist during this phase. Done waits on the outgoing object's overlay-completion flag, calls the Ground removal path, hides the controller, and resets the waiting timer. Missing outgoing or newly created backgrounds are assertion failures, not fallback branches. Unknown controller state values have no switch case.

## Lifecycle and semantic assessment

OnLoad is empty. OnStart invokes the shared generator-manager initializer with a NULL descriptor and discards its result; the callee schedules its manager and publishes state on success, or reports and frees its data when GObj creation fails. The stage-level predicate returns false, touch-line queries return NULL, and the shadow eligibility hook returns true without inspecting its inputs.

Existing OnInit and GObjProc names fit canonical table roles and are retained. The rendered object-4 OnUpdate name is unsupported because callback1 is a predicate distinct from the scheduled process. Corrections also separate background variants from platforms, registered joints from map objects, and overlay completion from generic animation completion. Compiled section placement, sizes and padding are not established by this source pass.

Status: synthesized; independent review and live promotion pending.
