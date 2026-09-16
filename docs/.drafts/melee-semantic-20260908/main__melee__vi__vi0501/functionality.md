## Vi0501 semantic review

This unit constructs and plays the real-time Green Greens presentation featuring one selected fighter and three Kirby demo participants. Existing descriptive function names fit their canonical bodies and header declarations; no equivalent-wording rename is proposed.

### Configuration and lifetime
`un_8031D9E4` narrows its three integer arguments into configuration bytes 0, 1 and 3, preserving the remaining five bytes. The externally visible eight-byte buffer is not a complete twelve-byte `ViCharaDesc`. Opening-mode code independently populates bytes 4–6 and supplies this buffer to `GS_CUTSCENE_3KIRBYS`; this presentation is therefore not exclusive to its established Adventure intro mapping. Scene and archive pointers, erase color, scale and Kirby object pointers persist in file-scope storage. This unit does not implement their teardown.

### Participant setup
`un_8031D9F8` initializes the Green Greens environment and demo systems, creates the selected character in slot 0 with mode 8, and creates exactly three Kirbys in slots 1–3 with modes 11–13. Its fourth formal integer argument carries an address: the routine reads three consecutive bytes, not a numeric spawn count. The third argument supplies the Kirby costume and is also forwarded to `Player_80031DA8`; its entire domain is not established here.

The routine saves the ground parameter before setting it to 0.7. Each Kirby hierarchy is requested and evaluated at frame 140; its translation is multiplied by `1.4285715f` times the saved value and written into stage-position entries 1–3. The hierarchy is then requested at frame zero without an immediate second evaluation. Only array entries 0–2 of the four-pointer Kirby cache are used.

### Scene construction and playback
Entry loads `Vi0501.dat`/`visual0501Scene` and the selected character's animation archive. It constructs fog, lighting, an animated camera and a null-terminated list of animated models. Camera and models receive frame-zero requests and immediate evaluations before recurring processes are installed. Fog color supplies the retained erase color; this body does not separately install fog or light animation.

The camera render callback first calls the shadow helper with 0. The shared camera routine performs clearing, drawing and finalization only if camera activation succeeds. It clears color and depth, not alpha, and finishes with GX-link 7 using mask `0x281`.

The camera process advances animation before exact floating-point equality tests. Frames 60, 70 and 85 dispatch effect 12 and sound `0x222F9`, plus sounds `0x73`, `0x74` and `0x73`, respectively. Frames 98, 108 and 123 dispatch `0x22308`. The independent end-frame branch calls the rumble-reset and scene-exit helpers after any coincident cue. There is no crossing detector or local one-shot latch. The rumble dispatcher excludes selector 4. The scene OnFrame callback separately delegates to the common Start-edge skip handler, whose guarded path also invokes audio shutdown before the terminal helpers.

### Evidence boundaries
Canonical and rendered pages were fully reviewed, as were all 24 subjects, 62 facts and 17 links. Supported semantic knowledge is explicitly retained in the checkpoint. Five compiled-layout/type assertions remain unresolved rather than being replaced with speculative section assignments. No compiled artifacts were supplied. Rendered substitutions were treated as hypotheses, not as evidence of callee behavior.

Status: synthesized; independent review and live promotion pending.
