## DevText rendering and lifecycle

The translation unit implements a developer-facing colored ASCII-grid overlay. Its header declares the implemented public entry points. A source-modeled pool contains 32 DevText entries; initialization links them into an available-node chain and clears the active draw list. The declaration explicitly leaves the trailing pool storage's original ownership uncertain.

`DevText_Show` registers a node through ascending-ID insertion, placing it after existing equal-ID entries. It neither draws immediately nor clears hide flags, and its GObj argument is unused. Insertion omits successor-prev repair and initializes no node links on the empty-list branch. `DevText_Remove` relies on incoming links and appropriate caller-pointer aliasing, unlinks the node, and prepends it to the free pool without repairing the previous free head's prev pointer. These operations should not be described as safe for arbitrary or duplicate nodes.

`DevText_Setup` persists scheduling inputs, resets the lazy camera pointer, creates a descriptor-backed camera GObj, initializes the pool, and independently creates the drawing GObj. Only successful drawing-GObj creation registers `DevText_DrawAll`; its render priority uses the low byte of the supplied value. Camera-GObj creation has separate failure branches, including removal of the new GObj if descriptor loading fails. The returned drawing host does not establish that camera creation succeeded.

`DevText_DrawAll` operates only for `HSD_RP_BOTTOMHALF`. It establishes fog and camera state even for an empty list, then traverses next links. `DevText_SetupCObj` lazily allocates a distinct orthographic camera, with 640×480 viewport/scissor, eye (0,0,1), interest (0,0,0), near/far 0/2, and bounds top/left −20, bottom 500, right 660. Initialization lasts until the pointer is reset; allocation failure is not guarded locally, and the return from HSD_CObjSetCurrent is ignored. Cleanup of previous camera or GObj lifetimes during repeated setup is not shown.

Per-node drawing configures glyph scale and line width, optionally draws two backing rectangles, and reads row-major two-byte cells. The first byte supplies the character; the high two bits of the second select one of four colors. Zero characters are skipped. Background hiding is independent of text hiding, but hidden text also suppresses cursor processing. With visible text and SHOWCURSOR, the cursor counter advances through a 17-update cycle containing states 0–16, with states 9–16 visible.

The utility routines provide nullable string-length traversal, signed decimal formatting, and observational access to the nullable shared drawing GObj. `DevText_PrintInt` consumes the decimal formatter; the sound-information client obtains the shared GObj and registers a styled display. Decimal conversion has no capacity argument and does not specially handle negation of INT_MIN.

## Semantic review

Supported existing names and explanations are explicitly retained in the checkpoint ledger. Two corrections address the cursor-cycle rationale and the distinction between setup's two camera paths. Compiled section placement, ordering, extent, and alignment are not independently established by source declarations or inline literals; affected claims remain unresolved. The rendered C view reported three parse errors and no substitutions, so its proposed names were not treated as evidence. The header rendered without parse errors, with two shadowed bindings and no substitutions.

Status: synthesized; independent review and live promotion pending.
