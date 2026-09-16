## Vi1201v2 semantic review

This unit constructs the Giga Bowser transformation cinematic. Entry loads the main scene, selected-character animation archive, Koopa trophy joint and presentation stand; creates the animated camera and initial model layer; configures player slot 0; then installs the temporary trophy/stand, animated fog and lights. The exported setter narrows two integers into the persistent character/costume bytes. The cross-file scene table associates that buffer with `GS_CUTSCENE_GIGATRANSFORM`.

Model descriptor 1 is deliberately omitted from initial setup. Model 0 receives the transition callback and supplies the retained attachment joint. After hierarchy animation, an exact model-frame comparison against 251 independently removes and clears the saved trophy and stand GObjs, then always invokes the reveal initializer within that frame branch—even if both pointers were already null. The initializer creates model 1 at frame 251, configures slot 1 as `CKIND_GKOOPS`, normalizes its scale and initializes audio. There is no local once-only latch.

The camera animation process is separate from both rendering and the scene-frame input wrapper. It tests exact updated camera frames 130, 190 and 251 for rumble requests, then independently tests equality with the animation end frame for cleanup and exit. These camera cues do not themselves create Giga Bowser. Rendering uses the initial fog-color snapshot and mask `0x881`; the shared helper skips erase, drawing and finalization if camera activation fails. The scene-frame wrapper delegates Start-edge skipping to the common visual-scene handler.

The existing rendered names for stand animation, Koopa animation, player setup, model setup, camera rendering, camera timeline processing and fog processing fit their canonical bodies and registration sites. No equivalent-name rewrites are proposed. The header agrees with the implementation, including the camera callback's one-argument definition despite its two-argument registration cast. Numeric selectors and demo modes are preserved rather than assigned additional meanings.

Two explanations merit correction: the TU summary conflates a camera rumble cue with the model-driven transformation, and the fog playback explanation overstates the scope of `AOBJ_NO_UPDATE`. Compiled section sizes, offsets and literal placement remain unverified; source declarations and ordering helpers alone do not establish them.

Status: synthesized; independent review and live promotion pending.
