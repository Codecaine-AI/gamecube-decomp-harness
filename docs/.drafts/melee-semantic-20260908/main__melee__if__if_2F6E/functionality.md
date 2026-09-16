## Match-status announcement lifecycle

This unit owns an eight-entry announcement table and four public operations. The rendered names `ifStatus_Create`, `ifStatus_ShowMatchResult`, `ifStatus_Init`, and `ifStatus_Free` fit the canonical behavior and are retained as hypotheses, not recovered original names. Both owned files were read completely in canonical and rendered form; rendering reported no errors.

Initialization clears each entry's active GObj and x4, resolves `ScInfCnt_scene_models` from the existing IfAll archive, and installs eight model pointers. It does not destroy previously active objects or reset every runtime field. Ordinary creation indexes the selected entry, stores sound/configuration arguments, removes its previous GObj, constructs a renderable animated joint hierarchy, requests frame zero, clears three packed one-bit flags, and stores two callbacks. There is no selector bounds check beyond the special equality test for 8.

Selector 8 creates no display. It invokes both non-null callbacks synchronously with -1, then makes both audio calls only when the first sound argument is nonnegative. The second call deliberately retains the same first-argument guard; it does not independently validate the second sound.

Result dispatch normalizes absent sound values to -1 and otherwise subtracts one. A nonzero unk_B overrides all other selection and produces unk_B-1. Otherwise timeout selects 0; with x24C8.x5_1 set, the symbolic uncertain bonus-stage outcome selects 7 and other outcomes select 6; the fallback is 5. The first callback is forwarded and the second is null. An override of 9 therefore reaches synchronous bypass, not stored completion.

The adjacent process implementation establishes callback timing and object lifetime: x18 runs once on initial process execution, whereas x1C runs at animation completion. Entries 1, 3, and 4 use the process that clears and destroys the object on completion; the other entries retain it and clear the terminal callback. Sound playback is frame-thresholded and guarded by separate one-shot bits. Teardown requests removal of every active GObj and immediately clears its slot, even when the engine defers actual reclamation.

Source evidence supports the table and frame-zero semantics, but cannot establish literal placement in compiled .data or .sdata2 sections. Those attribution claims remain unresolved rather than being silently treated as verified layout.

Status: synthesized; independent review and live promotion pending.
