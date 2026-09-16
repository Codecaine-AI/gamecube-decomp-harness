## Pause controller-information presentation

`gmpause.c` owns a private `PauseData` singleton containing five JObj references and a signed controller selector, plus retained archive and display-GObj handles. The header declares four entry points with matching signatures. The rendered names `gmPause_UpdateAnalogStick`, `gmPause_Configure`, and `gmPause_Hide` remain descriptive hypotheses, independently supported by canonical bodies rather than by their rendered spelling.

### Construction

`fn_801A1134` loads `GmPause` / `ScGamPause_scene_data`, creates a GObj with arguments `(0xE, 2, 0)`, and loads the first model's joint hierarchy. It retains the root as the background, obtains indicator nodes using indices 1, 9, 10, and 11, and replaces the analog-stick reference with that node's child. It attaches the root, installs JObj rendering with GX-link arguments `(0xB, 0)`, calls `gm_8016895C` with the first model, requests and evaluates animation frame 1, hides the hierarchy, registers `fn_801A0E34` with process argument 0, and sets selector 99. There are no local allocation-failure checks or teardown operations. The retained archive and GObj handles are assigned but not subsequently read in this translation unit. Common match setup calls this initializer.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmpause.c#L76-L101 ; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L1990-L2032

### Configuration and distinct hidden states

`gm_801A0FEC(s32 slot, u8 flag)` stores the supplied selector and requests background frame `(f32)(slot + 1)`. For any nonzero flag, it first clears hidden flags across the background hierarchy, hides all optional indicator groups, then reveals `lras` for bit 1, `z` for bit 2, and the stick plus outline for bit 4. A high-bit-only nonzero flag therefore takes the reveal-background branch while leaving these optional groups hidden. Zero hides the entire hierarchy. Animation is evaluated after either branch, so the ordering is significant.

Configuration does not independently force selector 99. Thus hidden-with-selected-controller differs from sentinel-inactive: a zero mask can leave input-driven rotation enabled. Nor does configuration validate the selector or exclude 99 supplied by a caller.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmpause.c#L42-L68

### Recurring stick update and deactivation

`fn_801A0E34` ignores its GObj argument. Its only selector guard is `slot != 99`; it casts the selector to `u8` when indexing `HSD_PadMasterStatus`, without a local range or controller-error check. Normalized stick X and Y are multiplied by 10 degrees and converted to radians. X drives positive Y-axis rotation, while Y drives negative X-axis rotation. The setters assert a non-null, non-quaternion JObj and request dirty handling only when `JOBJ_MTX_INDEP_SRT` is absent; unconditional transform-dirty claims are therefore too broad.

`gm_801A10FC(int slot)` ignores its parameter, writes selector 99, and hides the background hierarchy. It changes the referenced hierarchy's flags, not the stored background pointer. It neither destroys the objects nor unregisters the callback; the callback becomes a no-op through its selector guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmpause.c#L27-L74 ; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L295-L323

### Cross-file lifetime

Accepted pause entry conditionally calls configuration unless `x3_6` suppresses it, packing `x3_5`, `x3_3`, and `x3_1` into mask values 1, 2, and 4. Accepted unpause hides the overlay, and the outcome-commit routine hides it before storing the result. Camera entry can also temporarily hide the overlay while the underlying pause persists. Camera exit conditionally restores it with the saved pauser and mask 1 when its numeric state queries succeed. These paths distinguish presentation visibility from the broader match pause state; the numeric state-query implementation was not examined here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L1102-L1148 ; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L1203-L1217 ; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L1280-L1297 ; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L261-L315

### Evidence limits

Source establishes resource strings, floating-point expressions, declarations, and documented structure offsets, but not compiled section placement, exact section extents, string deduplication, or alignment padding. No compiled artifacts were supplied. The module controls visibility of `lras` and `z`; it does not locally animate these groups from live button presses. Exact artwork meaning and resource teardown ownership remain outside the verified evidence.

Status: synthesized; independent review and live promotion pending.
