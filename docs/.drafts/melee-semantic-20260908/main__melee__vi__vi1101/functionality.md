## Vi1101 semantic review

This unit implements the established Adventure Mode Metal Bros. cinematic. Existing participant-setup, JObj callback, camera callback and camera-timeline names fit their canonical roles; no equivalent-wording rewrites are proposed.

### Construction and resource flow
`vi1101_Scene_OnEnter` consumes input bytes 0 and 1 as character and costume. It loads `Vi1101.dat`, its primary and alternate scene descriptors, and the selected character animation archive. Lights and models always come from the primary descriptor. Luigi's unlock state selects the primary camera when unlocked and the alternate camera otherwise. Camera animation is requested at zero and evaluated before installing its process; each primary-scene model is likewise initialized before its hierarchy-animation process is installed at priority `0x17`.

`un_8031F294` initializes the environment and creates the selected fighter in slot 0, Mario in slot 1, and Luigi in slot 2 only when unlocked. Preserve archive selectors 3/5, creation modes 8/10, camera mode 6, opponent facing value 0 and flag bit 5 without deriving additional meanings from rendered callees. Each opponent hierarchy is requested at frame 432 and evaluated, its stage-position entry is written, then frame zero is requested without another immediate evaluation.

### Playback and rendering
`fn_8031F548` unconditionally animates its attached JObj hierarchy. `fn_8031F56C` calls the shadow helper with zero, then invokes `vi_RunCamera` with opaque-black RGBA and priority mask `0x281`. Camera activation failure skips the helper's erase, draw and finalization operations.

`fn_8031F600` updates camera animation before testing exact floating-point frame equality. Frames 170 and 190 request effect `0xD` and sound `0x209`; only frame 170 is Luigi-guarded. Frames 241 and 271 request sound `0x20A`; only frame 241 is Luigi-guarded. A separate end-frame equality test performs rumble reset followed by scene-exit request, so a cue and completion can occur on the same invocation. No local null check, crossed-frame detection or one-shot latch exists. `vi1101_Scene_OnFrame` separately delegates to the shared triggered-Start skip handler.

### Storage and evidence boundaries
Static pointer slots outlive individual setup calls; resource validity and teardown are separate concerns. Mario's retained pointer is always assigned during participant setup, but Luigi's is only assigned in the unlocked branch and is not cleared by the locked branch. The exported eight-byte buffer has no local consumer. Source declarations do not establish compiled section extent or ordering.

Both owned files were reviewed completely in canonical and rendered form, and every frozen subject and link was enumerated through restored evidence. Rendered external names remain hypotheses rather than proof. The historical parameter locator `un_8031F714_OnEnter#r3` is preserved separately from the current entry parameter identity; no merge is proposed.

Status: synthesized; independent review and live promotion pending.
