## Vi0401 semantic review

This unit constructs and runs video sequence 0401, retaining the established Adventure Mode Brinstar-intro identification. Canonical debug-mode registration independently associates its exported configuration buffer with the Brinstar cutscene.

### Configuration and construction
`vi0401_8031D020` narrows two integer inputs into bytes 0 and 1 of an eight-byte buffer, preserving the other six bytes. Scene entry reads the corresponding character and costume fields through `ViCharaDesc*`; the buffer is not a complete descriptor. Entry loads the primary and information scenes from `Vi0401.dat`, the interface camera descriptor from `IfAll.dat`, and a character-selected animation archive. It constructs fog, lighting, two cameras and two animated model groups. The primary camera and both model groups receive frame-zero requests and initial evaluation before their respective continuing processes are installed.

The fighter helper initializes the Zebes environment and demo player slot 0 using the selected character/costume, archive selector 3, positive facing and creation mode 8. Placement comes from traversal-index 1 extracted from the first primary model, not necessarily its root. Entry does not clear the retained marker when the primary model list is empty; resource validity therefore depends on initialization and external scene lifetime management.

### Playback and rendering
The two model callbacks have identical bodies but distinct primary/information registrations, supporting their existing descriptive naming hypotheses. Hierarchy animation accepts a null root, skips descendants of instance nodes and invokes collected animation-end callbacks after traversal.

The primary render callback delegates with fog-derived RGBA and mask `0x281`. Camera activation failure skips clearing, drawing and finalization. Successful activation clears color and depth, not alpha, runs shared rendering phases and finishes the camera pass. The initialization mask `0x2A9` is distinct from the callback's final drawing mask; the interface camera uses `0x801`.

The camera process advances animation before testing exact `curr_frame == end_frame`, requiring a valid camera and camera AObj. The scene-level input callback separately tests newly triggered Start. Both completion paths call `lb_800145F4` followed by `gm_801A4B60`. The latter writes scene-loop control value 1, allowing the current rendering/presentation path, unlike value 2's pre-render exit.

### Corrections and retained uncertainty
The entry call `vi_8031C9B4(1, 0)` does not enter a video state numbered 1. Canonical callees establish a port-guarded, preference-checked rumble request. Three existing explanations are corrected accordingly. A fourth correction distinguishes static shared storage from scene-resource validity and fixes initialization-order overstatement.

Existing callback names remain useful hypotheses, not recovered historical names. Rendered names were checked against canonical behavior rather than used as proof. Exact compiled data-section sizes, placement and ordering remain unresolved because this packet supplies no compiled artifacts.

Status: synthesized; independent review and live promotion pending.
