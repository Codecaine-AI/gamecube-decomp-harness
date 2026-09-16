## Vi1201v1 semantic review
The canonical implementation remains consistent with the baseline identification of Adventure Mode's ordinary Bowser-defeat outro. That identification retains its frozen runtime/wiki provenance; rendered names are not independent proof.

Entry reads character and costume bytes, clears the retained fighter pointer, initializes audio/effects, and loads the visual scene, TyKoopa trophy, presentation stand and selected-character resources. The archive global is overwritten with the selected-character archive before delayed fighter setup. Camera, scene models, trophy, stand, fog and lighting receive separate GObjs and callbacks. The attachment joint is overwritten for each scene model, leaving the final model's selected joint for trophy/stand attachment. Resource and allocation success are generally assumed. The stand's null-root branch still forwards a null child to subsequent setters; it is not a complete recovery path, and the scale denominator is unchecked.

The camera process advances animation before three independent equality tests: frame 120 dispatches event 0xD, frame 100 initializes the selected participant, and equality with the end frame requests finalization and scene exit. A milestone and completion can execute together. No consumed-event latch guarantees one-shot execution. Fighter setup resets demo/player state, configures slot 0 with numeric slot type 2 and creation argument 1, retains Player_GetEntity(0), and performs fixed audio setup.

Each scene-model process advances its hierarchy, then emits effect 0x42B and sound 0x61 only at exactly frame 120. StandAnim and KoopaAnim correctly distinguish separately registered objects despite identical hierarchy-animation wrapper bodies. CameraCallback correctly describes rendering rather than animation advancement: the retained entity pointer gates shadow processing, while successful camera activation independently gates clearing and drawing. The saved fog color survives fog-object removal.

Fog lifetime is process-count-driven, not camera-frame-driven: from zero, 100 invocations increment the counter, and invocation 101 requests teardown. The parameterless scene OnFrame hook delegates Start-trigger skipping to the common VI handler rather than advancing the camera.

All existing owned rendered function names fit their canonical roles. Two state explanations warrant correction; section-layout assertions remain unresolved without compiled evidence. The header declarations agree with the definitions, including the camera callback's one-argument source signature despite its two-argument registration cast.

Status: synthesized; independent review and live promotion pending.
