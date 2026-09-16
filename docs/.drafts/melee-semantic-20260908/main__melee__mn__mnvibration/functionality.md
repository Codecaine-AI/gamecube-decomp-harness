## Functionality

This translation unit implements menu 19, the controller and saved-name rumble-settings interface entered by the Settings menu's Rumble selection. Existing references to “Vibration Records” are retained as a historical screen label, not proof that the screen belongs to the Records menu hierarchy.

### Construction and ownership

`mnVibration_Init` sets a five-unit shared cooldown, records the previous menu, selects menu 19, loads four resource families, constructs the main screen, and creates a separate input-process GObj. `mnVibration_CreateScreen` publishes the primary GObj through `mnVibration_804D6C28`, attaches heap-allocated `MnVibrationData` with `HSD_Free`, caches 25 JObjs, initializes the selection and connection bytes, clears eight name-text slots, constructs four initially hidden port panels, and creates title text. Its integer argument is unused. The constructor tests `title_text` before explicitly assigning or initializing that field; this pass does not assume the allocator clears it.

Four separately declared asset records supply the cursor, controller panels, name ON/OFF rows, and main screen. Initialization accesses them as an array. A separate layout cast addresses animation descriptors, text position, diagnostics, and resource strings. These source access patterns do not establish compiled section size or contiguity.

### Entrance and ongoing presentation

The intro process evaluates JObj 1 and compares the returned frame for exact equality with 10, 11, 12, 13, and 14. The first four checkpoints reveal successive port-panel children and reveal associated controls only for cached connected ports. At frame 14, a nonzero name count causes an eight-row refresh and creation of a separately rendered cursor GObj. At or beyond intro end frame 20, the process changes to `mnVibration_Think`.

The recurring process first updates rumble presentation for all four ports, then reconciles live PAD errors with cached connection bytes. Disconnect hides the corresponding control and refreshes the panel as unavailable. Reconnect reveals it, resets that port's selection mode to zero, evaluates the reset animation, and refreshes it as connected. Disconnect does not itself reset the selection mode. The active-menu test casts `cur_menu` to `u8`; the cursor callback's test does not.

`mnVibration_UpdatePortPanel` updates hierarchy indices 1, 3, and 2 synchronously. Connected presentation uses port identity and persistent rumble state. Disconnected presentation does not read the rumble preference: it requests frame 20 on the indexed children, with child 1 subsequently receiving the descriptor endpoint 14 before its material-animation operation.

### Input and saved-name rows

The input callback ignores its formal GObj and dereferences the singleton screen. Shared cooldown returns first. Once cooldown expires, cancel is handled before the separate byte counter `x0[0]` is tested and incremented through 20. Consequently, cancel is available during the remaining intro gate.

`x0[2..5]` are per-controller control-selection modes, not rumble values: mode 0 permits a port-setting confirmation; mode 1 contributes input to the shared name list. The handler contains no explicit cached-connectivity or PAD-error gate. The first qualifying port confirmation toggles that port's persistent preference and returns. Disabling removes all rumble requests and turns that port off; enabling submits a preview using `mnVibration_804D4FF0`.

When names exist, left/right switches selection modes. Input masks from mode-1 controllers are combined; confirmation changes the selected name's `rumble_enabled` field and updates its row. The name toggle tests equality with 1, whereas the port toggle tests nonzero. Confirmation takes precedence over navigation, and up takes precedence over down. Navigation moves within eight visible rows or changes the scroll offset at a boundary. The explicit downward offset-wrap branch remains present after the next-slot validity check; this pass does not claim ordinary end-of-list wraparound.

`mnVibration_RefreshNameRows` removes non-null text handles, clears those slots, removes the row-model children, and recreates valid rows using the existing offset. `mnVibration_CreateNameRow` distinguishes persistent name index from display-row index, creates text at scale 0.03, and attaches a model evaluated at the saved rumble flag. `mnVibration_GetNameRowJObj` performs read-only, null-propagating sibling traversal; nonpositive indices select the first child, and the singleton itself is not guarded.

### Exit and exceptional paths

Cancel requests a menu transition, removes name and title text, requests main-screen destruction, removes rumble requests, and calls `lbCardGame_UpdatePowerTime`. The separate cursor requests its own destruction when menu 19 is left. Independently, a surviving main-screen think process switches to `mnVibration_OnAnimComplete` on leaving the menu; that callback evaluates the 50–70 descriptor and requests destruction at its end frame. The generic GObj destructor has a protected-traversal deferral branch, so a destruction request does not always mean immediate reclamation. The separate input GObj's eventual removal and all text ownership on non-cancel exits require broader lifecycle evidence.

### Semantic review

The existing owned function names and singleton role name remain useful; no cosmetic renaming is proposed. Corrections distinguish selection modes from connectivity, the input counter from the animation frame, early cancel from ordinary-action gating, and source-level layout assumptions from compiled layout claims. The rendered views were fully inspected, but substituted external names were not treated as independent proof. Renderer-reported text-creator collisions and shadowed bindings remain noted.

Status: synthesized; independent review and live promotion pending.
